type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogConfig {
  debugMode: boolean;
  includeTimestamp: boolean;
  includeMicroseconds: boolean;
  prefix?: string;
}

class LoggingService {
  private config: LogConfig;
  private originalConsole: {
    log: typeof console.log;
    info: typeof console.info;
    warn: typeof console.warn;
    error: typeof console.error;
    debug: typeof console.debug;
  };

  constructor(config: Partial<LogConfig> = {}) {
    // Debug mode: only enabled if explicitly set to true in localStorage
    // If not set (null) → PROD behavior (no log spam, errors/warnings only)
    const debugOverride = localStorage.getItem('gatekeeper-debug');
    const debugMode = debugOverride === 'true';
    
    this.config = {
      debugMode,
      includeTimestamp: true,
      includeMicroseconds: true,
      prefix: '[Gatekeeper]',
      ...config
    };

    this.originalConsole = {
      log: console.log.bind(console),
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
      debug: console.debug.bind(console)
    };

    this.overrideConsole();
  }

  private formatTimestamp(): string {
    if (!this.config.includeTimestamp) return '';
    
    const now = new Date();
    const timeString = now.toISOString().split('T')[1].slice(0, -1); // Remove 'Z'
    
    if (this.config.includeMicroseconds) {
      const microseconds = String(performance.now() % 1000).padStart(6, '0').slice(0, 3);
      return `${timeString}${microseconds}`;
    }
    
    return timeString;
  }

  private formatMessage(level: LogLevel, ...args: any[]): any[] {
    const parts: string[] = [];
    
    if (this.config.includeTimestamp) {
      parts.push(`[${this.formatTimestamp()}]`);
    }
    
    if (this.config.prefix) {
      parts.push(this.config.prefix);
    }
    
    parts.push(`[${level.toUpperCase()}]`);
    
    const prefix = parts.join(' ');
    return [prefix, ...args];
  }

  private shouldLog(level: LogLevel): boolean {
    if (level === 'error' || level === 'warn') {
      return true; // Always log errors and warnings
    }
    
    return this.config.debugMode;
  }

  private overrideConsole(): void {
    console.log = (...args: any[]) => {
      if (this.shouldLog('info')) {
        this.originalConsole.log(...this.formatMessage('info', ...args));
      }
    };

    console.info = (...args: any[]) => {
      if (this.shouldLog('info')) {
        this.originalConsole.info(...this.formatMessage('info', ...args));
      }
    };

    console.warn = (...args: any[]) => {
      if (this.shouldLog('warn')) {
        this.originalConsole.warn(...this.formatMessage('warn', ...args));
      }
    };

    console.error = (...args: any[]) => {
      if (this.shouldLog('error')) {
        this.originalConsole.error(...this.formatMessage('error', ...args));
      }
    };

    console.debug = (...args: any[]) => {
      if (this.shouldLog('debug')) {
        this.originalConsole.debug(...this.formatMessage('debug', ...args));
      }
    };
  }

  public setDebugMode(enabled: boolean): void {
    this.config.debugMode = enabled;
    localStorage.setItem('gatekeeper-debug', enabled.toString());
  }

  public getDebugMode(): boolean {
    return this.config.debugMode;
  }

  public restore(): void {
    console.log = this.originalConsole.log;
    console.info = this.originalConsole.info;
    console.warn = this.originalConsole.warn;
    console.error = this.originalConsole.error;
    console.debug = this.originalConsole.debug;
  }
}

export default LoggingService;