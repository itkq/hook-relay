import { createServer } from './server';
import { Command, Option } from 'commander';
import { createLogger, LogLevel } from '../logger';

interface CLIOptions {
  port?: number;
  challengePassphrase: string;
  logLevel?: LogLevel;
}

const program = new Command();
program
  .addOption(new Option('--port <number>', 'Port to listen on').default(3000).env('PORT'))
  .addOption(new Option('--challenge-passphrase <string>', 'Passphrase for challenge response').env('CHALLENGE_PASSPHRASE'))
  .addOption(new Option('--log-level <string>', 'Log level').default('info').env('LOG_LEVEL'))
  .name("hook-relay-server");

program.parse(process.argv);

const options = program.opts() as CLIOptions;

const logger = createLogger('hook-relay-server', options.logLevel);
if (!options.challengePassphrase) {
  logger.error('Challenge passphrase is required');
  program.help();
}

const { server, shutdown } = createServer(logger, options.challengePassphrase);

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
