import express from 'express';

export type WebSocketEvent = WebSocketHTTPEvent | WebSocketErrorEvent;

export type WebSocketHTTPEvent = {
  kind: 'http';
  eventId: string;
  headers: express.Request['headers'];
  rawBody: string;
  method: string;
  path: string;
}

export function isWebSocketHTTPEvent(event: WebSocketEvent): event is WebSocketHTTPEvent {
  return event.kind === 'http';
}

export type WebSocketErrorEvent = {
  kind: 'error';
  eventId: string;
  error: string;
  status: number;
}

export function isWebSocketErrorEvent(event: WebSocketEvent): event is WebSocketErrorEvent {
  return event.kind === 'error';
}

export type WebSocketResponse = WebSocketHTTPResponse | WebSocketErrorResponse;

export type WebSocketHTTPResponse= {
  kind: 'http';
  clientId: string;
  eventId: string;
  headers: express.Request['headers'];
  status: number;
  body: string;
}

export function isWebSocketHTTPResponse(response: WebSocketResponse): response is WebSocketHTTPResponse {
  return response.kind === 'http';
}

export type WebSocketErrorResponse = {
  kind: 'error';
  clientId: string;
  eventId: string;
  error: string;
}

export function isWebSocketErrorResponse(response: WebSocketResponse): response is WebSocketErrorResponse {
  return response.kind === 'error';
}
