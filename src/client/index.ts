#!/usr/bin/env node

import { Command, Option } from 'commander';
import { connectWebSocket, shutdown } from './websocket';
import { createLogger, LogLevel } from '../logger';

interface CLIOptions {
  logLevel: LogLevel;
  serverEndpoint: string;
  forwardEndpoint: string;
  token?: string;
  path?: string;
  filterBodyRegex?: string;
  reconnectIntervalMs: number;
}

const program = new Command();

program
  .requiredOption('--server-endpoint <string>', 'Server endpoint URL')
  .requiredOption('--forward-endpoint <string>', 'Forward endpoint URL')
  .addOption(new Option('--token <string>', 'Authentication token').env('AUTH_TOKEN'))
  .option('--path <string>', 'Path to use')
  .option('--log-level <string>', 'Log level', 'info')
  .option('--filter-body-regex <string>', 'Filter body regex')
  .option('--reconnect-interval-ms <number>', 'Reconnect interval in milliseconds', '1000')
  .name("hook-relay-client");

program.parse(process.argv);

const options = program.opts() as CLIOptions;

const sleepMs = (ms: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

const logger = createLogger('hook-relay-client', options.logLevel);

let isShuttingDown = false;

const handleShutdown = () => {
  if (isShuttingDown) {
    logger.warn("Shutdown already in progress, forcing exit");
    process.exit(1);
  }
  isShuttingDown = true;
  logger.info("Shutdown initiated");
  shutdown(logger);
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
        logger,
        token: options.token,
        serverEndpoint: options.serverEndpoint,
        forwardEndpoint: options.forwardEndpoint,
        path: options.path,
        filterBodyRegex: options.filterBodyRegex,
      });
      if (isShuttingDown) {
        break;
      }
      logger.info("Attempting to reconnect...");
    } catch (err) {
      logger.error(err, "Connection terminated due to error");
    }
    await sleepMs(options.reconnectIntervalMs);
  }
})();
