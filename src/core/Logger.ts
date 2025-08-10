export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: Record<string, any> | undefined;
}

export class Logger {
  private level: LogLevel;
  private entries: LogEntry[] = [];

  constructor(level: LogLevel = LogLevel.INFO) {
    this.level = level;
  }

  private log(level: LogLevel, message: string, context?: Record<string, any>): void {
    if (level < this.level) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      context: context || undefined,
    };

    this.entries.push(entry);

    const emoji = this.getLevelEmoji(level);
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    console.log(`${emoji} ${message}${contextStr}`);
  }

  private getLevelEmoji(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG: return '🐛';
      case LogLevel.INFO: return 'ℹ️';
      case LogLevel.WARN: return '⚠️';
      case LogLevel.ERROR: return '❌';
      default: return '📝';
    }
  }

  debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, context);
  }

  success(message: string, context?: Record<string, any>): void {
    const entry: LogEntry = {
      level: LogLevel.INFO,
      message,
      timestamp: new Date(),
      context: context || undefined,
    };

    this.entries.push(entry);

    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    console.log(`✅ ${message}${contextStr}`);
  }

  progress(message: string, current: number, total: number): void {
    const percentage = Math.round((current / total) * 100);
    const progressBar = '█'.repeat(Math.floor(percentage / 5)) + '░'.repeat(20 - Math.floor(percentage / 5));
    console.log(`📦 ${message} [${progressBar}] ${percentage}% (${current}/${total})`);
  }

  section(title: string): void {
    console.log("");
    console.log(`🔍 ${title}`);
    console.log("━".repeat(50));
  }

  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  getErrors(): LogEntry[] {
    return this.entries.filter(entry => entry.level === LogLevel.ERROR);
  }

  clear(): void {
    this.entries = [];
  }
}