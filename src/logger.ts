import { Logger, pino } from 'pino';

export type LogLevel = 'info' | 'debug';

export function createLogger(name: string, level: LogLevel = 'info'): Logger {
  const isTTY = process.stdout.isTTY;
  
  return pino({
    name,
    level,
    transport: isTTY 
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
          }
        }
      : undefined
  });
}
