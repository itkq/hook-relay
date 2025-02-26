import { getAuthenticator } from './authenticator';
import { createServer } from './server';
import { Command, Option } from 'commander';
import { createLogger, LogLevel } from '../logger';

interface CLIOptions {
  port?: number;
  token?: string;
  logLevel?: LogLevel;
}

const program = new Command();
program
  .addOption(new Option('--port <number>', 'Port to listen on').default(3000).env('PORT'))
  .addOption(new Option('--token <string>', 'Authentication token').env('AUTH_TOKEN'))
  .option('--log-level <string>', 'Log level', 'info');
program.parse(process.argv);

const options = program.opts() as CLIOptions;
const authenticator = options.token ? getAuthenticator('fixed-token', { validToken: options.token }) : null;

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
