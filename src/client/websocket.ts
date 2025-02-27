import WebSocket from 'ws';
import axios from 'axios';
import { isWebSocketErrorEvent, isWebSocketHTTPEvent, WebSocketEvent, WebSocketHTTPResponse } from '../types';
import { IncomingHttpHeaders } from 'http';
import { Logger } from 'pino';

let activeWs: WebSocket | null = null;

export async function connectWebSocket({
  logger,
  serverEndpoint,
  forwardEndpoint,
  bearerToken,
  path,
  filterBodyRegex,
}: {
  logger: Logger;
  serverEndpoint: string;
  forwardEndpoint: string;
  bearerToken?: string;
  path?: string;
  filterBodyRegex?: string;
}): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const clientId = crypto.randomUUID();
    const wsParams = new URLSearchParams({
      clientId,
      ...(path ? { path } : {}),
      ...(filterBodyRegex ? { filterBodyRegex } : {}),
    });
    const opts: ClientOptions = {
      ...(bearerToken ? { headers: { Authorization: `Bearer ${bearerToken}` } } : {}),
    };
    const ws = new WebSocket(`${serverEndpoint}?${wsParams.toString()}`, opts);
    activeWs = ws;

    ws.on('open', () => {
      logger.info(`Connected to server ${serverEndpoint} as ${clientId}${path ? ` (${path})` : ''}`);
    });

    ws.on('message', async (data) => {
      const event = JSON.parse(data.toString()) as WebSocketEvent;
      logger.debug(`Received event: ${JSON.stringify(event)}`);
      if (isWebSocketErrorEvent(event)) {
        logger.error(`Error: ${event.error} for ${event.eventId}`);
      } else if (isWebSocketHTTPEvent(event)) {
        try {
          const req = {
            method: event.method,
            url: `${forwardEndpoint}${event.path}`,
            headers: event.headers,
            data: event.rawBody,
          };

          const response = await axios(req);
          logger.debug(`response status: ${response.status}`);
          logger.debug(`response headers: ${response.headers}`);
          logger.debug(`response data: ${JSON.stringify(response.data)}`);
          const responseData: WebSocketHTTPResponse = {
            kind: 'http',
            clientId,
            eventId: event.eventId,
            headers: response.headers as IncomingHttpHeaders,
            status: response.status,
            body: response.data,
          };
          ws.send(JSON.stringify(responseData));
          logger.info(`${event.method} ${event.path} -> ${responseData.status} sent to server (event:${responseData.eventId})`);
        } catch (error: unknown) {
          logger.error(error, "Error forwarding request");
        }
      }
    });

    ws.on('close', (code: number) => {
      // established connection
      if (code === 1000) {
        return resolve();
      } else if (code === 1006) {
        logger.warn("Connection closed");
        return resolve();
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
      return resolve();
    });

    ws.on('error', (err: unknown) => {
      ws.close();
      return reject(err);
    });
  });
}

export function shutdown(logger: Logger): void {
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
