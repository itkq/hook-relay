import { connectWebSocket, shutdown } from './websocket';
import { pino } from 'pino';
import { WebSocketChallengeMessage, WebSocketHTTPMessage, WebSocketChallengeResultMessage, WebSocketChallengeResponse, WebSocketHTTPResponse } from '../types';
import { createHmac } from 'crypto';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock WebSocket
const mockWebSocket = {
  on: jest.fn(),
  once: jest.fn(),
  send: jest.fn(),
  close: jest.fn(),
  ping: jest.fn(),
  terminate: jest.fn(),
  readyState: 1, // OPEN
  OPEN: 1,
  CLOSED: 3,
};

jest.mock('ws', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => mockWebSocket),
  };
});

describe('websocket client', () => {
  const logger = pino({ level: 'silent' });
  const challengePassphrase = 'test-passphrase';

  beforeEach(() => {
    jest.clearAllMocks();
    mockWebSocket.on.mockClear();
    mockWebSocket.send.mockClear();
    mockWebSocket.close.mockClear();
    mockWebSocket.readyState = 1;
  });

  describe('connectWebSocket', () => {
    it('should connect and authenticate successfully', async () => {
      const clientId = 'test-client';
      const serverEndpoint = 'ws://localhost:8080';
      const forwardEndpoint = 'http://localhost:3000';
      
      // Mock setup for on method
      const eventHandlers: { [key: string]: Function } = {};
      mockWebSocket.on.mockImplementation((event: string, handler: Function) => {
        eventHandlers[event] = handler;
        return mockWebSocket;
      });
      
      const connectPromise = connectWebSocket({
        clientId,
        logger,
        serverEndpoint,
        forwardEndpoint,
        challengePassphrase,
      });
      
      // Fire open event
      eventHandlers['open']();
      
      // Send challenge message from server
      const challengeMessage: WebSocketChallengeMessage = {
        kind: 'challenge',
        nonce: 'test-nonce',
      };
      eventHandlers['message'](Buffer.from(JSON.stringify(challengeMessage)));
      
      // Verify response from client
      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('"kind":"challenge-response"')
      );
      
      // Parse sent challenge response
      const sentResponse = JSON.parse(mockWebSocket.send.mock.calls[0][0]) as WebSocketChallengeResponse;
      const expectedHmac = createHmac('sha256', challengePassphrase)
        .update('test-nonce')
        .digest('hex');
      expect(sentResponse.hmac).toBe(expectedHmac);
      
      // Send authentication success message
      const challengeResult: WebSocketChallengeResultMessage = {
        kind: 'challenge-result',
        clientId,
        success: true,
      };
      eventHandlers['message'](Buffer.from(JSON.stringify(challengeResult)));
      
      // Close connection
      eventHandlers['close'](1000);
      
      const result = await connectPromise;
      expect(result).toBe(clientId);
    });

    it('should fail authentication with wrong passphrase', async () => {
      const clientId = 'test-client';
      const serverEndpoint = 'ws://localhost:8080';
      const forwardEndpoint = 'http://localhost:3000';
      
      const eventHandlers: { [key: string]: Function } = {};
      mockWebSocket.on.mockImplementation((event: string, handler: Function) => {
        eventHandlers[event] = handler;
        return mockWebSocket;
      });
      
      const connectPromise = connectWebSocket({
        clientId,
        logger,
        serverEndpoint,
        forwardEndpoint,
        challengePassphrase: 'wrong-passphrase',
      });
      
      eventHandlers['open']();
      
      // Challenge message
      const challengeMessage: WebSocketChallengeMessage = {
        kind: 'challenge',
        nonce: 'test-nonce',
      };
      eventHandlers['message'](Buffer.from(JSON.stringify(challengeMessage)));
      
      // Authentication failure message
      const challengeResult: WebSocketChallengeResultMessage = {
        kind: 'challenge-result',
        clientId,
        success: false,
      };
      eventHandlers['message'](Buffer.from(JSON.stringify(challengeResult)));
      
      // Close connection (authentication failed)
      eventHandlers['close'](4001);
      
      await expect(connectPromise).rejects.toThrow('Authentication failed');
    });

    it('should forward HTTP messages', async () => {
      const clientId = 'test-client';
      const serverEndpoint = 'ws://localhost:8080';
      const forwardEndpoint = 'http://localhost:3000';
      
      const mockResponse = {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: Buffer.from('{"success": true}'),
      };
      (mockedAxios as any).mockResolvedValueOnce(mockResponse);
      
      const eventHandlers: { [key: string]: Function } = {};
      mockWebSocket.on.mockImplementation((event: string, handler: Function) => {
        eventHandlers[event] = handler;
        return mockWebSocket;
      });
      
      const connectPromise = connectWebSocket({
        clientId,
        logger,
        serverEndpoint,
        forwardEndpoint,
        challengePassphrase,
      });
      
      eventHandlers['open']();
      
      // Authentication process
      const challengeMessage: WebSocketChallengeMessage = {
        kind: 'challenge',
        nonce: 'test-nonce',
      };
      eventHandlers['message'](Buffer.from(JSON.stringify(challengeMessage)));
      
      const challengeResult: WebSocketChallengeResultMessage = {
        kind: 'challenge-result',
        clientId,
        success: true,
      };
      eventHandlers['message'](Buffer.from(JSON.stringify(challengeResult)));
      
      // Send HTTP message
      const httpMessage: WebSocketHTTPMessage = {
        kind: 'http',
        messageId: 'test-message-id',
        headers: { 'content-type': 'application/json' },
        rawBody: Buffer.from('{"test": "data"}').toString('base64'),
        method: 'POST',
        path: '/api/test',
      };
      eventHandlers['message'](Buffer.from(JSON.stringify(httpMessage)));
      
      // Wait for axios to be called
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify axios was called correctly
      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: 'http://localhost:3000/api/test',
          headers: { 'content-type': 'application/json' },
          data: Buffer.from('{"test": "data"}'),
          responseType: 'arraybuffer',
          validateStatus: expect.any(Function),
          maxRedirects: 0,
        })
      );
      
      // Verify HTTP response was sent
      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('"kind":"http"')
      );
      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('"messageId":"test-message-id"')
      );
      
      eventHandlers['close'](1000);
      await connectPromise;
    });

    it('should handle connection errors', async () => {
      const clientId = 'test-client';
      const serverEndpoint = 'ws://localhost:8080';
      const forwardEndpoint = 'http://localhost:3000';
      
      const eventHandlers: { [key: string]: Function } = {};
      mockWebSocket.on.mockImplementation((event: string, handler: Function) => {
        eventHandlers[event] = handler;
        return mockWebSocket;
      });
      
      const connectPromise = connectWebSocket({
        clientId,
        logger,
        serverEndpoint,
        forwardEndpoint,
        challengePassphrase,
      });
      
      // Simulate error
      eventHandlers['error']({ code: 'ECONNREFUSED' });
      
      // Verify connection resolves with error handling
      const result = await connectPromise;
      expect(result).toBe(clientId);
    });

    it('should handle query parameters in HTTP messages', async () => {
      const clientId = 'test-client';
      const serverEndpoint = 'ws://localhost:8080';
      const forwardEndpoint = 'http://localhost:3000';
      
      const mockResponse = {
        status: 200,
        headers: {},
        data: Buffer.from('OK'),
      };
      (mockedAxios as any).mockResolvedValueOnce(mockResponse);
      
      const eventHandlers: { [key: string]: Function } = {};
      mockWebSocket.on.mockImplementation((event: string, handler: Function) => {
        eventHandlers[event] = handler;
        return mockWebSocket;
      });
      
      const connectPromise = connectWebSocket({
        clientId,
        logger,
        serverEndpoint,
        forwardEndpoint,
        challengePassphrase,
      });
      
      eventHandlers['open']();
      
      // Authentication process
      const challengeMessage: WebSocketChallengeMessage = {
        kind: 'challenge',
        nonce: 'test-nonce',
      };
      eventHandlers['message'](Buffer.from(JSON.stringify(challengeMessage)));
      
      const challengeResult: WebSocketChallengeResultMessage = {
        kind: 'challenge-result',
        clientId,
        success: true,
      };
      eventHandlers['message'](Buffer.from(JSON.stringify(challengeResult)));
      
      // Send HTTP message with query parameters
      const httpMessage: WebSocketHTTPMessage = {
        kind: 'http',
        messageId: 'test-message-id',
        headers: {},
        rawBody: '',
        method: 'GET',
        path: '/api/search',
        queryParams: {
          q: 'test query',
          limit: '10',
        },
      };
      eventHandlers['message'](Buffer.from(JSON.stringify(httpMessage)));
      
      // Wait for axios to be called
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify URL contains query parameters
      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'http://localhost:3000/api/search?q=test+query&limit=10',
        })
      );
      
      eventHandlers['close'](1000);
      await connectPromise;
    });
  });

  describe('shutdown', () => {
    it('should handle shutdown', () => {
      // Test only basic behavior as shutdown depends on internal state
      expect(() => shutdown(logger)).not.toThrow();
    });
  });
});
