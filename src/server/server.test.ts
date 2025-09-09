import request from 'supertest';
import { createServer } from './server';
import { pino } from 'pino';
import WebSocket from 'ws';
import { WebSocketChallengeMessage, WebSocketChallengeResponse, WebSocketHTTPMessage, WebSocketHTTPResponse } from '../types';
import { createHmac } from 'crypto';

describe('server', () => {
  let server: any;
  let shutdown: () => void;
  const logger = pino({ level: 'silent' });
  const challengePassphrase = 'test-passphrase';
  let port: number;

  beforeEach((done) => {
    const result = createServer(logger, challengePassphrase);
    server = result.server;
    shutdown = result.shutdown;
    server.listen(0, () => {
      port = (server.address() as any).port;
      done();
    });
  });

  afterEach((done) => {
    shutdown();
    setTimeout(() => done(), 100);
  });

  describe('HTTP endpoints', () => {
    describe('GET /health', () => {
      it('should return OK', async () => {
        const response = await request(server)
          .get('/health')
          .expect(200);
        
        expect(response.text).toBe('OK');
      });
    });

    describe('HTTP /hook/*', () => {
      it('should return 404 when no client is connected (POST)', async () => {
        const response = await request(server)
          .post('/hook/test-path')
          .send({ test: 'data' })
          .expect(404);
        
        expect(response.text).toContain('No matching client found');
      });

      it('should return 404 when no client is connected (OPTIONS)', async () => {
        const response = await request(server)
          .options('/hook/test-path')
          .expect(404);
        
        expect(response.text).toContain('No matching client found');
      });

      it('should relay request to connected client', (done) => {
        const ws = new WebSocket(`ws://localhost:${port}?clientId=test-client`);
        
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          
          if (message.kind === 'challenge') {
            const challengeMessage = message as WebSocketChallengeMessage;
            const hmac = createHmac('sha256', challengePassphrase)
              .update(challengeMessage.nonce)
              .digest('hex');
            
            const response: WebSocketChallengeResponse = {
              kind: 'challenge-response',
              clientId: 'test-client',
              hmac,
            };
            ws.send(JSON.stringify(response));
          } else if (message.kind === 'challenge-result' && message.success) {
            request(server)
              .post('/hook/test-path')
              .send({ test: 'data' })
              .end(() => {});
          } else if (message.kind === 'http') {
            const httpMessage = message as WebSocketHTTPMessage;
            expect(httpMessage.path).toBe('/test-path');
            expect(httpMessage.method).toBe('POST');
            
            const response: WebSocketHTTPResponse = {
              kind: 'http',
              clientId: 'test-client',
              messageId: httpMessage.messageId,
              headers: { 'content-type': 'application/json' },
              status: 200,
              body: JSON.stringify({ received: true }),
            };
            ws.send(JSON.stringify(response));
            
            setTimeout(() => {
              ws.close();
              done();
            }, 100);
          }
        });
      });

      it('should relay OPTIONS request to connected client', (done) => {
        const ws = new WebSocket(`ws://localhost:${port}?clientId=test-client`);
        
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          
          if (message.kind === 'challenge') {
            const challengeMessage = message as WebSocketChallengeMessage;
            const hmac = createHmac('sha256', challengePassphrase)
              .update(challengeMessage.nonce)
              .digest('hex');
            
            const response: WebSocketChallengeResponse = {
              kind: 'challenge-response',
              clientId: 'test-client',
              hmac,
            };
            ws.send(JSON.stringify(response));
          } else if (message.kind === 'challenge-result' && message.success) {
            request(server)
              .options('/hook/test-path')
              .end(() => {});
          } else if (message.kind === 'http') {
            const httpMessage = message as WebSocketHTTPMessage;
            expect(httpMessage.path).toBe('/test-path');
            expect(httpMessage.method).toBe('OPTIONS');
            
            const response: WebSocketHTTPResponse = {
              kind: 'http',
              clientId: 'test-client',
              messageId: httpMessage.messageId,
              headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS' },
              status: 200,
              body: '',
            };
            ws.send(JSON.stringify(response));
            
            setTimeout(() => {
              ws.close();
              done();
            }, 100);
          }
        });
      });

      it('should handle wildcard client', (done) => {
        const ws = new WebSocket(`ws://localhost:${port}?clientId=test-client`);
        
        ws.on('message', async (data) => {
          const message = JSON.parse(data.toString());
          
          if (message.kind === 'challenge') {
            const challengeMessage = message as WebSocketChallengeMessage;
            const hmac = createHmac('sha256', challengePassphrase)
              .update(challengeMessage.nonce)
              .digest('hex');
            
            const response: WebSocketChallengeResponse = {
              kind: 'challenge-response',
              clientId: 'test-client',
              hmac,
            };
            ws.send(JSON.stringify(response));
          } else if (message.kind === 'challenge-result' && message.success) {
            // Verify that wildcard client receives all paths
            request(server)
              .post('/hook/any/path/here')
              .send({ test: 'data' })
              .end(() => {});
          } else if (message.kind === 'http') {
            const httpMessage = message as WebSocketHTTPMessage;
            expect(httpMessage.path).toBe('/any/path/here');
            
            const response: WebSocketHTTPResponse = {
              kind: 'http',
              clientId: 'test-client',
              messageId: httpMessage.messageId,
              headers: {},
              status: 200,
              body: 'OK',
            };
            ws.send(JSON.stringify(response));
            
            ws.close();
            done();
          }
        });
        
        ws.on('error', (err) => {
          done(err);
        });
      });
    });

    describe('POST /callback/oneshot/register', () => {
      it('should return 400 for invalid content type', async () => {
        const response = await request(server)
          .post('/callback/oneshot/register')
          .set('Content-Type', 'text/plain')
          .send('invalid')
          .expect(400);
        
        expect(response.text).toBe('Invalid content type');
      });

      it('should return 400 when clientId is missing', async () => {
        const response = await request(server)
          .post('/callback/oneshot/register')
          .send({ path: '/test' })
          .expect(400);
        
        expect(response.text).toBe('No client ID provided');
      });

      it('should return 400 when path is missing', async () => {
        const response = await request(server)
          .post('/callback/oneshot/register')
          .send({ clientId: 'test-client' })
          .expect(400);
        
        expect(response.text).toBe('No path provided');
      });

      it('should return 404 when client is not connected', async () => {
        const response = await request(server)
          .post('/callback/oneshot/register')
          .send({ clientId: 'non-existent', path: '/test' })
          .expect(404);
        
        expect(response.text).toBe('Client not found');
      });

      it('should register callback for connected client', (done) => {
        const ws = new WebSocket(`ws://localhost:${port}?clientId=test-client`);
        
        ws.on('message', async (data) => {
          const message = JSON.parse(data.toString());
          
          if (message.kind === 'challenge') {
            const challengeMessage = message as WebSocketChallengeMessage;
            const hmac = createHmac('sha256', challengePassphrase)
              .update(challengeMessage.nonce)
              .digest('hex');
            
            const response: WebSocketChallengeResponse = {
              kind: 'challenge-response',
              clientId: 'test-client',
              hmac,
            };
            ws.send(JSON.stringify(response));
          } else if (message.kind === 'challenge-result' && message.success) {
            const response = await request(server)
              .post('/callback/oneshot/register')
              .send({ clientId: 'test-client', path: '/oauth/callback' })
              .expect(200);
            
            expect(response.body).toHaveProperty('callbackUrl');
            expect(response.body.callbackUrl).toContain('/callback/oneshot/oauth/callback');
            
            ws.close();
            done();
          }
        });
      });
    });

    describe('GET /callback/oneshot/*', () => {
      it('should return 404 for non-existent callback', async () => {
        const response = await request(server)
          .get('/callback/oneshot/non-existent')
          .expect(404);
        
        expect(response.text).toBe('Callback not found or already used');
      });
    });
  });

  describe('WebSocket authentication', () => {
    it('should close connection with invalid HMAC', (done) => {
      const ws = new WebSocket(`ws://localhost:${port}?clientId=test-client`);
      
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.kind === 'challenge') {
          // Send invalid HMAC (correct length but wrong content)
          const invalidHmac = '0'.repeat(64); // SHA256 is 64 hexadecimal characters
          const response: WebSocketChallengeResponse = {
            kind: 'challenge-response',
            clientId: 'test-client',
            hmac: invalidHmac,
          };
          ws.send(JSON.stringify(response));
        } else if (message.kind === 'challenge-result') {
          expect(message.success).toBe(false);
        }
      });
      
      ws.on('close', (code) => {
        expect(code).toBe(4001);
        done();
      });
      
      ws.on('error', () => {
        done();
      });
    });

    it('should authenticate with valid HMAC', (done) => {
      const ws = new WebSocket(`ws://localhost:${port}?clientId=test-client`);
      
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.kind === 'challenge') {
          const challengeMessage = message as WebSocketChallengeMessage;
          const hmac = createHmac('sha256', challengePassphrase)
            .update(challengeMessage.nonce)
            .digest('hex');
          
          const response: WebSocketChallengeResponse = {
            kind: 'challenge-response',
            clientId: 'test-client',
            hmac,
          };
          ws.send(JSON.stringify(response));
        } else if (message.kind === 'challenge-result') {
          expect(message.success).toBe(true);
          ws.close();
          done();
        }
      });
    });
  });

  describe('shutdown', () => {
    it('should gracefully shutdown server', (done) => {
      const ws = new WebSocket(`ws://localhost:${port}?clientId=test-client`);
      
      ws.on('open', () => {
        shutdown();
      });
      
      ws.on('close', (code) => {
        expect(code).toBe(1000);
        done();
      });
    });
  });
});
