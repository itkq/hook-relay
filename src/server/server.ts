#!/usr/bin/env node

import express, { Request, Response } from 'express';
import http from 'http';
import WebSocket from 'ws';
import { WebSocketHTTPEvent, isWebSocketHTTPResponse, isWebSocketErrorResponse, WebSocketResponse, WebSocketErrorResponse } from '../types';
import { Mutex } from 'async-mutex';
import { IAuthenticator } from './authenticator';
import { Logger } from 'pino';

interface ExtendedWebSocket extends WebSocket {
  path?: string;
  filterBodyRegex?: RegExp;
  clientId: string;
}

interface Clients {
  [path: string]: ExtendedWebSocket[];
}

type Pair<T, U> = [T, U];

interface PendingResponse {
  resolved: boolean;
  resolve: (value: Pair<string, WebSocketResponse>) => void;
  reject: (reason: any) => void;
  clients: ExtendedWebSocket[];
  timeout: NodeJS.Timeout;
}

interface PendingResponses {
  [eventId: string]: PendingResponse;
}

function filterEvent(event: WebSocketHTTPEvent, ws: ExtendedWebSocket): boolean {
  if (ws.filterBodyRegex) {
    return ws.filterBodyRegex.test(event.rawBody);
  }
  return true;
}

export function createServer(logger: Logger, authenticator: IAuthenticator | null): {
  server: http.Server;
  shutdown: () => void;
} {
  const app = express();

  app.get('/health', (_req: Request, res: Response) => {
    res.send('OK');
  });

  const server = http.createServer(app);

  const wss = new WebSocket.Server({ server });


  let clients: Clients = {};
  let pendingResponses: PendingResponses = {};
  const pendingResponsesLock = new Mutex();

  wss.on('connection', (ws: ExtendedWebSocket, req: http.IncomingMessage) => {
    if (!req.url) {
      ws.close(4003, 'Invalid request URL');
      return;
    }
    const query = new URLSearchParams(req.url.split('?')[1]);
    const clientId = query.get('clientId');
    if (!clientId) {
      ws.close(4004, 'No clientId provided');
      return;
    }
    if (authenticator && !authenticator.authenticate(req as unknown as Request)) { // FIXME
      ws.close(4001, 'Authentication failed');
      return;
    }
    const filterBodyRegexStr = query.get('filterBodyRegex');
    if (filterBodyRegexStr) {
      try {
        ws.filterBodyRegex = new RegExp(filterBodyRegexStr);;
      } catch (e) {
        logger.warn(e, 'Invalid filterBodyRegex, ignored');
      }
    }
    ws.path = query.get('path') || '*';
    ws.clientId = clientId;

    if (!clients[ws.path]) {
      clients[ws.path] = [];
    }
    clients[ws.path].push(ws);
    logger.info(`client:${ws.clientId} (path:${ws.path}, filterBodyRegex:${ws.filterBodyRegex}) connected`);

    ws.on('close', () => {
      logger.info(`client:${ws.clientId} (path:${ws.path}, filterBodyRegex:${ws.filterBodyRegex}) disconnected`);
      const path = ws.path;
      if (path && clients[path]) {
        clients[path] = clients[path].filter((client: ExtendedWebSocket) => client !== ws);
      }
      for (let eventId in pendingResponses) {
        const pending = pendingResponses[eventId];
        if (pending.clients) {
          pending.clients = pending.clients.filter(client => client !== ws);
          if (pending.clients.length === 0 && !pending.resolved) {
            clearTimeout(pending.timeout);
            pending.reject("All clients disconnected for event " + eventId);
            delete pendingResponses[eventId];
          }
        }
      }
    });

    ws.on('message', async (message: WebSocket.RawData) => {
      let resp: WebSocketResponse | undefined = undefined;
      try {
        resp = JSON.parse(message.toString()) as WebSocketResponse;
      } catch (e) {
        logger.error("Invalid message:", message);
        return;
      }
      if (resp.eventId) {
        await pendingResponsesLock.runExclusive(async () => {
          let pr = pendingResponses[resp.eventId];
          if (pr) {
            if (!pr.resolved) {
              pr.resolved = true;
              clearTimeout(pr.timeout);
              pr.resolve([ws.clientId, resp]);
              setTimeout(() => {
                delete pendingResponses[resp.eventId];
              }, 10000);
            } else {
              const responseData: WebSocketErrorResponse = {
                kind: 'error',
                clientId: ws.clientId,
                eventId: resp.eventId,
                error: "Response already provided (maybe conflict with other clients)",
              }
              ws.send(JSON.stringify(responseData));
            }
          } else {
            const responseData: WebSocketErrorResponse = {
              kind: 'error',
              clientId: ws.clientId,
              eventId: resp.eventId,
              error: "No pending request",
            }
            ws.send(JSON.stringify(responseData));
          }
        });
      }
    });
  });

  app.post('/hook/*', async (
    req: Request,
    res: Response,
  ) => {
    let rawBody = '';

    req.on('data', (chunk) => {
      rawBody += chunk;
    });
    req.on('end', async () => {
      const requestPath = req.path.replace(/^\/hook/, '');
      const eventId = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
      logger.info(`Received ${req.method} ${req.path} as event:${eventId}`);
      const event: WebSocketHTTPEvent = {
        kind: 'http',
        eventId,
        headers: req.headers,
        rawBody: rawBody,
        method: req.method,
        path: requestPath,
      };
      const clientList = (clients[requestPath] || []).concat(clients['*'] || []);
      let matchedClients = clientList.filter(ws => ws.readyState === WebSocket.OPEN && filterEvent(event, ws));
      if (matchedClients.length === 0) {
        logger.warn("No matching client found for path: " + requestPath);
        return res.status(404).send("No matching client found for path: " + requestPath);
      }

      let resolveFn: (value: Pair<string, WebSocketResponse>) => void;
      let rejectFn: (reason?: any) => void;
      const responsePromise = new Promise<Pair<string, WebSocketResponse>>((resolve, reject) => {
        resolveFn = resolve;
        rejectFn = reject;
      });

      await pendingResponsesLock.runExclusive(() => {
        pendingResponses[event.eventId] = {
          resolved: false,
          resolve: resolveFn!,
          reject: rejectFn!,
          clients: matchedClients.slice(),
          timeout: setTimeout(() => {
            if (!pendingResponses[event.eventId].resolved) {
              delete pendingResponses[event.eventId];
              rejectFn("Client response timeout");
            }
          }, 10000)
        };
      });

      for (const ws of matchedClients) {
        ws.send(JSON.stringify(event));
        logger.debug(`Sent event:${event.eventId} to client:${ws.clientId}`);
      }

      try {
        const [clientId, responseData] = await responsePromise;
        if (isWebSocketHTTPResponse(responseData)) {
          for (const [key, value] of Object.entries(responseData.headers)) {
            if (value) {
              res.setHeader(key, value);
            }
          }
          logger.info(`Responded ${responseData.status} (event:${event.eventId} by client:${clientId})`);
          return res.status(responseData.status).send(responseData.body);
        }
        if (isWebSocketErrorResponse(responseData)) {
          logger.error(`Responded 500 ${responseData.error} (event:${event.eventId} by client:${clientId})`);
          return res.status(500).send(responseData.error);
        }
      } catch (err) {
        logger.error(`someone responded with error ${err} for event:${event.eventId}`);
        return res.status(500).send(err);
      }
    });
    req.on('error', (err) => {
      logger.error(err, 'Error while receiving data');
      res.status(500).send('Error receiving data');
    });
  });

  function shutdown(): void {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.close(1000, 'Server is shutting down');
      }
    });
    
    wss.close(() => {
      logger.info("WebSocket server closed.");
      
      server.close(() => {
        logger.info("HTTP server closed.");
        process.exit(0);
      });
    });
  }

  return {
    server,
    shutdown,
  }
}
