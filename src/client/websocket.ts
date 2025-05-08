import WebSocket from 'ws';
import axios from 'axios';
import { isWebSocketChallengeMessage, isWebSocketChallengeResultMessage, isWebSocketErrorMessage, isWebSocketHTTPMessage, WebSocketChallengeResponse, WebSocketHTTPMessage, WebSocketHTTPResponse, WebSocketMessage } from '../types';
import { IncomingHttpHeaders } from 'http';
import { Logger } from 'pino';
import { createHmac } from 'crypto';

let activeWs: WebSocket | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;
const HEARTBEAT_INTERVAL_MS = 20_000;

export async function connectWebSocket({
  clientId,
  logger,
  serverEndpoint,
  forwardEndpoint,
  challengePassphrase,
  path,
  filterBodyRegex,
}: {
  clientId: string;
  logger: Logger;
  serverEndpoint: string;
  forwardEndpoint: string;
  challengePassphrase: string;
  path?: string;
  filterBodyRegex?: string;
}): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const wsParams = new URLSearchParams({
      clientId,
      ...(path ? { path } : {}),
      ...(filterBodyRegex ? { filterBodyRegex } : {}),
    });
    const ws = new WebSocket(`${serverEndpoint}?${wsParams.toString()}`);
    activeWs = ws;

    ws.on('ping', () => {
      logger.debug('Received ping from server, responding with pong');
    });

    ws.on('open', () => {
      logger.info(`Connected to server ${serverEndpoint} as ${clientId}${path ? ` (${path})` : ''}`);
      
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
      
      heartbeatInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          logger.debug('Sending heartbeat to server');
          ws.ping();
        }
      }, HEARTBEAT_INTERVAL_MS);
    });

    ws.on('message', async (data) => {
      const message = JSON.parse(data.toString()) as WebSocketMessage;
      logger.debug(`Received message: ${JSON.stringify(message)}`);
      if (isWebSocketChallengeMessage(message)) {
        const hmac = createHmac('sha256', challengePassphrase)
          .update(message.nonce)
          .digest('hex');
        const challengeResponse: WebSocketChallengeResponse = {
          kind: 'challenge-response',
          clientId,
          hmac,
        };
        ws.send(JSON.stringify(challengeResponse));
        logger.debug(`Sent challenge response: ${JSON.stringify(challengeResponse)}`);
      } else if (isWebSocketChallengeResultMessage(message)) {
        if (message.success) {
          logger.info(`Authentication successful`);
        } else {
          logger.error(`Authentication failed (challenge response mismatch)`);
        }
      } else if (isWebSocketHTTPMessage(message)) {
        try {
          const url = new URL(message.path, forwardEndpoint);
          if (message.queryParams) {
            for (const [key, value] of Object.entries(message.queryParams)) {
              url.searchParams.set(key, value);
            }
          }
          const decodedBody = Buffer.from(message.rawBody, 'base64');
          const req = {
            method: message.method,
            url: url.toString(),
            headers: message.headers,
            data: decodedBody,
            responseType: 'arraybuffer' as const,
          };

          const response = await axios({
            ...req,
            validateStatus: (_status) => true,
            maxRedirects: 0,
          });
          logger.debug(`response status: ${response.status}`);
          logger.debug(`response headers: ${JSON.stringify(response.headers)}`);
          const responseData: WebSocketHTTPResponse = {
            kind: 'http',
            clientId,
            messageId: message.messageId,
            headers: response.headers as IncomingHttpHeaders,
            status: response.status,
            body: response.data,
          };
          ws.send(JSON.stringify(responseData));
          logger.info(`${message.method} ${message.path} -> ${responseData.status} sent to server (message:${responseData.messageId})`);
        } catch (error: unknown) {
          logger.error(error, "Error forwarding request");
        }
      } else if (isWebSocketErrorMessage(message)) {
        logger.error(`Error: ${message.error} for ${message.messageId}`);
      }
    });

    ws.on('close', (code: number) => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
      
      // established connection
      if (code === 1000) {
        return resolve(clientId);
      } else if (code === 1006) {
        logger.warn("Connection closed");
        return resolve(clientId);
      } else if (code === 4001) {
        logger.error("Authentication failed, not reconnecting");
        return reject(new Error("Authentication failed"));
      } else if (code === 4002) {
        logger.error("Unknown authenticator, not reconnecting");
        return reject(new Error("Unknown authenticator"));
      } else if (code === 4004) {
        logger.error("No UUID provided, not reconnecting");
        return reject(new Error("No UUID provided"));
      }
      logger.info(`Disconnected from the server with code: ${code}`);
      return resolve(clientId);
    });

    ws.on('error', (err: unknown) => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
      
      ws.close();
      if (err && typeof err === 'object') {
        const error = err as any;
        if (error.code === 'ECONNREFUSED') {
          logger.error(`Connection refused to ${serverEndpoint}. Server may be down.`);
        } else {
          logger.error(err, "WebSocket error");
        }
        return resolve(clientId); // resolve the promise to reconnect
      } else {
        logger.error(err, "Unknown WebSocket error");
      }
      return reject(err);
    });
  });
}

export function shutdown(logger: Logger): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  
  if (activeWs && activeWs.readyState === WebSocket.OPEN) {
    logger.info("Closing WebSocket connection gracefully...");
    activeWs.close(1000, "Client shutdown");
    activeWs.once('close', () => {
      logger.info("WebSocket closed gracefully");
    });
    setTimeout(() => {
      if (activeWs && activeWs.readyState !== WebSocket.CLOSED) {
        logger.warn("Graceful shutdown timeout reached, terminating WebSocket");
        activeWs.terminate();
      }
    }, 1000); // terminate after 1 second
  }
}
