import { getAuthenticator } from './authenticator';
import { createServer } from './server';
import { Command, Option } from 'commander';
import { createLogger, LogLevel } from '../logger';

interface CLIOptions {
  port?: number;
  bearerToken?: string;
  logLevel?: LogLevel;
}

const program = new Command();
program
  .addOption(new Option('--port <number>', 'Port to listen on').default(3000).env('PORT'))
  .addOption(new Option('--bearer-token <string>', 'Bearer token').env('BEARER_TOKEN'))
  .option('--log-level <string>', 'Log level', 'info')
  .name("hook-relay-server");

program.parse(process.argv);

const options = program.opts() as CLIOptions;
const authenticator = options.bearerToken ? getAuthenticator('bearer-token', { token: options.bearerToken }) : null;

const logger = createLogger('hook-relay-server', options.logLevel);

const { server, shutdown } = createServer(logger, authenticator);

server.listen(options.port, () => {
  logger.info(`Server started on port ${options.port}`);
});

process.on('SIGINT', () => {
  logger.info("SIGINT received");
  shutdown();
});

process.on('SIGTERM', () => {
  logger.info("SIGTERM received");
  shutdown();
});
