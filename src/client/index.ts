#!/usr/bin/env node

import { Command, Option } from 'commander';
import { connectWebSocket, shutdown } from './websocket';
import { createLogger, LogLevel } from '../logger';
import express, { Request, Response } from 'express';
import http from 'http';
import { VERSION } from '../version';
import safeRegex from 'safe-regex';

interface CLIOptions {
  logLevel: LogLevel;
  serverEndpoint: string;
  forwardEndpoint: string;
  challengePassphrase: string;
  path?: string;
  filterBodyRegex?: string;
  reconnectIntervalMs: number;
  port: number;
}

const program = new Command();

program
  .version(VERSION)
  .requiredOption('--server-endpoint <string>', 'Server endpoint URL')
  .requiredOption('--forward-endpoint <string>', 'Forward endpoint URL')
  .option('--path <string>', 'Path to use')
  .addOption(new Option('--log-level <string>', 'Log level').default('info').env('LOG_LEVEL'))
  .option('--filter-body-regex <string>', 'Filter body regex')
  .option('--reconnect-interval-ms <number>', 'Reconnect interval in milliseconds', '1000')
  .addOption(new Option('--port <number>', 'Port to listen on').default(3001).env('PORT'))
  .addOption(new Option('--challenge-passphrase <string>', 'Passphrase for challenge response').env('CHALLENGE_PASSPHRASE'))
  .name("hook-relay-client");

program.parse(process.argv);

const options = program.opts() as CLIOptions;

const logger = createLogger('hook-relay-client', options.logLevel);

if (!options.challengePassphrase) {
  logger.error('Challenge passphrase is required');
  program.help();
}

if (options.filterBodyRegex) {
  if (!safeRegex(options.filterBodyRegex)) {
    logger.error('Unsafe regex pattern provided. This pattern could cause performance issues.');
    process.exit(1);
  }
}

const sleepMs = (ms: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

const clientId = crypto.randomUUID();

const app = express();
const server = http.createServer(app);

app.get('/', (_req: Request, res: Response) => {
  res.json({ clientId });
});

server.listen(options.port, () => {
  logger.info(`Server started on port ${options.port}`);
});

let isShuttingDown = false;

const handleShutdown = () => {
  if (isShuttingDown) {
    logger.warn("Shutdown already in progress, forcing exit");
    process.exit(1);
  }
  isShuttingDown = true;
  logger.info("Shutdown initiated");
  shutdown(logger);
  server.close(() => {
    logger.info("Server closed")
  })
};

process.on('SIGINT', () => {
  logger.info("SIGINT received");
  handleShutdown();
});
process.on('SIGTERM', () => {
  logger.info("SIGTERM received");
  handleShutdown();
});

(async () => {
  while (!isShuttingDown) {
    try {
      await connectWebSocket({
        clientId,
        logger,
        challengePassphrase: options.challengePassphrase,
        serverEndpoint: options.serverEndpoint,
        forwardEndpoint: options.forwardEndpoint,
        path: options.path,
        filterBodyRegex: options.filterBodyRegex,
      });
      if (isShuttingDown) {
        break;
      }
      logger.info("Attempting to reconnect...");
    } catch (err: unknown) {
      if (err instanceof Error) {
        logger.error("Connection terminated due to error", err.message);
        logger.debug(err.stack);
      } else {
        logger.error("Connection terminated due to error", err);
      }
      process.exit(1);
    }
    await sleepMs(options.reconnectIntervalMs);
  }
})();
