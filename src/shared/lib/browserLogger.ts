type BrowserLogContext = Record<string, unknown>;

class BrowserLogger {
  private readonly isDevelopment = import.meta.env.MODE === 'development';

  warn(message: string, context?: BrowserLogContext): void {
    if (this.isDevelopment) {
      console.warn(`⚠️ [WARN] ${message}`, context ?? '');
      return;
    }

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      message,
      ...context,
    }));
  }
}

export const browserLogger = new BrowserLogger();
