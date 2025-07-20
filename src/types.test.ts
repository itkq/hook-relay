import {
  WebSocketMessage,
  WebSocketResponse,
  isWebSocketChallengeMessage,
  isWebSocketChallengeResultMessage,
  isWebSocketHTTPMessage,
  isWebSocketErrorMessage,
  isWebSocketChallengeResponse,
  isWebSocketHTTPResponse,
  isWebSocketErrorResponse,
  WebSocketChallengeMessage,
  WebSocketChallengeResultMessage,
  WebSocketHTTPMessage,
  WebSocketErrorMessage,
  WebSocketChallengeResponse,
  WebSocketHTTPResponse,
  WebSocketErrorResponse,
} from './types';

describe('types', () => {
  describe('WebSocketMessage type guards', () => {
    describe('isWebSocketChallengeMessage', () => {
      it('should return true for valid challenge message', () => {
        const message: WebSocketChallengeMessage = {
          kind: 'challenge',
          nonce: 'test-nonce',
        };
        expect(isWebSocketChallengeMessage(message)).toBe(true);
      });

      it('should return false for non-challenge messages', () => {
        const message: WebSocketHTTPMessage = {
          kind: 'http',
          messageId: 'test-id',
          headers: {},
          rawBody: 'test',
          method: 'GET',
          path: '/test',
        };
        expect(isWebSocketChallengeMessage(message)).toBe(false);
      });
    });

    describe('isWebSocketChallengeResultMessage', () => {
      it('should return true for valid challenge result message', () => {
        const message: WebSocketChallengeResultMessage = {
          kind: 'challenge-result',
          clientId: 'test-client',
          success: true,
        };
        expect(isWebSocketChallengeResultMessage(message)).toBe(true);
      });

      it('should return false for non-challenge-result messages', () => {
        const message: WebSocketChallengeMessage = {
          kind: 'challenge',
          nonce: 'test-nonce',
        };
        expect(isWebSocketChallengeResultMessage(message)).toBe(false);
      });
    });

    describe('isWebSocketHTTPMessage', () => {
      it('should return true for valid HTTP message', () => {
        const message: WebSocketHTTPMessage = {
          kind: 'http',
          messageId: 'test-id',
          headers: { 'content-type': 'application/json' },
          rawBody: 'test-body',
          method: 'POST',
          path: '/api/test',
        };
        expect(isWebSocketHTTPMessage(message)).toBe(true);
      });

      it('should return true for HTTP message with query params', () => {
        const message: WebSocketHTTPMessage = {
          kind: 'http',
          messageId: 'test-id',
          headers: {},
          rawBody: '',
          method: 'GET',
          path: '/api/test',
          queryParams: { key: 'value' },
        };
        expect(isWebSocketHTTPMessage(message)).toBe(true);
      });

      it('should return false for non-HTTP messages', () => {
        const message: WebSocketErrorMessage = {
          kind: 'error',
          messageId: 'test-id',
          error: 'test error',
          status: 500,
        };
        expect(isWebSocketHTTPMessage(message)).toBe(false);
      });
    });

    describe('isWebSocketErrorMessage', () => {
      it('should return true for valid error message', () => {
        const message: WebSocketErrorMessage = {
          kind: 'error',
          messageId: 'test-id',
          error: 'Internal Server Error',
          status: 500,
        };
        expect(isWebSocketErrorMessage(message)).toBe(true);
      });

      it('should return false for non-error messages', () => {
        const message: WebSocketHTTPMessage = {
          kind: 'http',
          messageId: 'test-id',
          headers: {},
          rawBody: '',
          method: 'GET',
          path: '/test',
        };
        expect(isWebSocketErrorMessage(message)).toBe(false);
      });
    });
  });

  describe('WebSocketResponse type guards', () => {
    describe('isWebSocketChallengeResponse', () => {
      it('should return true for valid challenge response', () => {
        const response: WebSocketChallengeResponse = {
          kind: 'challenge-response',
          clientId: 'test-client',
          hmac: 'test-hmac',
        };
        expect(isWebSocketChallengeResponse(response)).toBe(true);
      });

      it('should return false for non-challenge responses', () => {
        const response: WebSocketHTTPResponse = {
          kind: 'http',
          clientId: 'test-client',
          messageId: 'test-id',
          headers: {},
          status: 200,
          body: 'OK',
        };
        expect(isWebSocketChallengeResponse(response)).toBe(false);
      });
    });

    describe('isWebSocketHTTPResponse', () => {
      it('should return true for valid HTTP response', () => {
        const response: WebSocketHTTPResponse = {
          kind: 'http',
          clientId: 'test-client',
          messageId: 'test-id',
          headers: { 'content-type': 'application/json' },
          status: 201,
          body: '{"created": true}',
        };
        expect(isWebSocketHTTPResponse(response)).toBe(true);
      });

      it('should return false for non-HTTP responses', () => {
        const response: WebSocketErrorResponse = {
          kind: 'error',
          clientId: 'test-client',
          messageId: 'test-id',
          error: 'Connection timeout',
        };
        expect(isWebSocketHTTPResponse(response)).toBe(false);
      });
    });

    describe('isWebSocketErrorResponse', () => {
      it('should return true for valid error response', () => {
        const response: WebSocketErrorResponse = {
          kind: 'error',
          clientId: 'test-client',
          messageId: 'test-id',
          error: 'Failed to process request',
        };
        expect(isWebSocketErrorResponse(response)).toBe(true);
      });

      it('should return false for non-error responses', () => {
        const response: WebSocketChallengeResponse = {
          kind: 'challenge-response',
          clientId: 'test-client',
          hmac: 'test-hmac',
        };
        expect(isWebSocketErrorResponse(response)).toBe(false);
      });
    });
  });

  describe('Type definitions', () => {
    it('should correctly type WebSocketMessage union', () => {
      const messages: WebSocketMessage[] = [
        {
          kind: 'challenge',
          nonce: 'test-nonce',
        },
        {
          kind: 'challenge-result',
          clientId: 'test-client',
          success: false,
        },
        {
          kind: 'http',
          messageId: 'test-id',
          headers: {},
          rawBody: '',
          method: 'DELETE',
          path: '/api/resource/123',
        },
        {
          kind: 'error',
          messageId: 'test-id',
          error: 'Not Found',
          status: 404,
        },
      ];

      expect(messages).toHaveLength(4);
      expect(messages.every(msg => 'kind' in msg)).toBe(true);
    });

    it('should correctly type WebSocketResponse union', () => {
      const responses: WebSocketResponse[] = [
        {
          kind: 'challenge-response',
          clientId: 'test-client',
          hmac: 'sha256-hmac',
        },
        {
          kind: 'http',
          clientId: 'test-client',
          messageId: 'test-id',
          headers: { 'x-custom-header': 'value' },
          status: 204,
          body: '',
        },
        {
          kind: 'error',
          clientId: 'test-client',
          messageId: 'test-id',
          error: 'Service Unavailable',
        },
      ];

      expect(responses).toHaveLength(3);
      expect(responses.every(res => 'kind' in res && 'clientId' in res)).toBe(true);
    });
  });
});
