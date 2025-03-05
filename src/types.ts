import express from 'express';

export type WebSocketMessage = WebSocketChallengeMessage | WebSocketChallengeResultMessage | WebSocketHTTPMessage | WebSocketErrorMessage;

export type WebSocketChallengeMessage = {
  kind: 'challenge';
  nonce: string;
}

export function isWebSocketChallengeMessage(message: WebSocketMessage): message is WebSocketChallengeMessage {
  return message.kind === 'challenge';
}

export type WebSocketChallengeResultMessage = {
  kind: 'challenge-result';
  clientId: string;
  success: boolean;
}

export function isWebSocketChallengeResultMessage(message: WebSocketMessage): message is WebSocketChallengeResultMessage {
  return message.kind === 'challenge-result';
}

export type WebSocketHTTPMessage = {
  kind: 'http';
  messageId: string;
  headers: express.Request['headers'];
  rawBody: string;
  method: string;
  path: string;
  queryParams?: Record<string, string>;
}

export function isWebSocketHTTPMessage(message: WebSocketMessage): message is WebSocketHTTPMessage {
  return message.kind === 'http';
}

export type WebSocketErrorMessage = {
  kind: 'error';
  messageId: string;
  error: string;
  status: number;
}

export function isWebSocketErrorMessage(message: WebSocketMessage): message is WebSocketErrorMessage {
  return message.kind === 'error';
}

export type WebSocketResponse = WebSocketChallengeResponse | WebSocketHTTPResponse | WebSocketErrorResponse;

export type WebSocketChallengeResponse = {
  kind: 'challenge-response';
  clientId: string;
  hmac: string;
}

export function isWebSocketChallengeResponse(response: WebSocketResponse): response is WebSocketChallengeResponse {
  return response.kind === 'challenge-response';
}

export type WebSocketHTTPResponse = {
  kind: 'http';
  clientId: string;
  messageId: string;
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
  messageId: string;
  error: string;
}

export function isWebSocketErrorResponse(response: WebSocketResponse): response is WebSocketErrorResponse {
  return response.kind === 'error';
}
