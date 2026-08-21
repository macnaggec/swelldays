/**
 * Simple logger utility
 * In production, replace with Winston, Pino, or your logging service
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogContext {
  [key: string]: unknown;
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development';

  private log(level: LogLevel, message: string, context?: LogContext) {
    const timestamp = new Date().toISOString();
    const logData = {
      timestamp,
      level,
      message,
      ...context,
    };

    // In development: pretty print
    if (this.isDevelopment) {
      const emoji = {
        info: 'ℹ️',
        warn: '⚠️',
        error: '❌',
        debug: '🐛',
      };
      console[level === 'debug' ? 'log' : level](
        `${emoji[level]} [${level.toUpperCase()}] ${message}`,
        context || ''
      );
    } else {
      // In production: JSON for log aggregators
      console.log(JSON.stringify(logData));
    }
  }

  info(message: string, context?: LogContext) {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext) {
    this.log('warn', message, context);
  }

  error(message: string, context?: LogContext) {
    this.log('error', message, context);
  }

  debug(message: string, context?: LogContext) {
    if (this.isDevelopment) {
      this.log('debug', message, context);
    }
  }
}

export const logger = new Logger();
