import { Logger } from "./Logger";

export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  PROCESSING_ERROR = 'PROCESSING_ERROR',
  USER_CANCELLED = 'USER_CANCELLED',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export interface AppError {
  code: ErrorCode;
  message: string;
  details?: Record<string, any> | undefined;
  cause?: Error | undefined;
  timestamp: Date;
}

export class AppErrorHandler {
  private logger: Logger;
  private errors: AppError[] = [];

  constructor(logger?: Logger) {
    this.logger = logger || new Logger();
  }

  createError(code: ErrorCode, message: string, details?: Record<string, any>, cause?: Error): AppError {
    const error: AppError = {
      code,
      message,
      details: details || undefined,
      cause: cause || undefined,
      timestamp: new Date(),
    };

    this.errors.push(error);
    return error;
  }

  handleValidationError(message: string, details?: Record<string, any>): AppError {
    const error = this.createError(ErrorCode.VALIDATION_ERROR, message, details);
    this.logger.error(`Validation Error: ${message}`, details);
    return error;
  }

  handleNetworkError(message: string, cause?: Error): AppError {
    const error = this.createError(ErrorCode.NETWORK_ERROR, message, undefined, cause);
    this.logger.error(`Network Error: ${message}`);
    if (cause) {
      this.logger.debug(`Caused by: ${cause.message}`);
    }
    return error;
  }

  handleConfigurationError(message: string, details?: Record<string, any>): AppError {
    const error = this.createError(ErrorCode.CONFIGURATION_ERROR, message, details);
    this.logger.error(`Configuration Error: ${message}`, details);
    return error;
  }

  handleProcessingError(message: string, details?: Record<string, any>, cause?: Error): AppError {
    const error = this.createError(ErrorCode.PROCESSING_ERROR, message, details, cause);
    this.logger.error(`Processing Error: ${message}`, details);
    return error;
  }

  handleUserCancellation(): AppError {
    const error = this.createError(ErrorCode.USER_CANCELLED, "Operation cancelled by user");
    this.logger.warn("Operation cancelled by user");
    return error;
  }

  handleUnknownError(error: unknown): AppError {
    const message = error instanceof Error ? error.message : String(error);
    const appError = this.createError(
      ErrorCode.UNKNOWN_ERROR, 
      `Unexpected error: ${message}`,
      undefined,
      error instanceof Error ? error : undefined
    );
    
    this.logger.error(`Unknown Error: ${message}`);
    return appError;
  }

  getErrors(): AppError[] {
    return [...this.errors];
  }

  getErrorsByCode(code: ErrorCode): AppError[] {
    return this.errors.filter(error => error.code === code);
  }

  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  hasCriticalErrors(): boolean {
    return this.errors.some(error => 
      error.code === ErrorCode.CONFIGURATION_ERROR ||
      error.code === ErrorCode.NETWORK_ERROR
    );
  }

  clear(): void {
    this.errors = [];
  }

  exitOnError(error: AppError, exitCode: number = 1): never {
    this.logger.error(`Fatal error - exiting with code ${exitCode}`, {
      code: error.code,
      message: error.message,
    });
    process.exit(exitCode);
  }

  formatErrorSummary(): string {
    if (this.errors.length === 0) {
      return "No errors occurred";
    }

    const summary: string[] = [];
    const errorCounts = new Map<ErrorCode, number>();

    this.errors.forEach(error => {
      const count = errorCounts.get(error.code) || 0;
      errorCounts.set(error.code, count + 1);
    });

    errorCounts.forEach((count, code) => {
      summary.push(`${code}: ${count}`);
    });

    return `Errors encountered: ${summary.join(', ')}`;
  }

  static createWithLogger(logger: Logger): AppErrorHandler {
    return new AppErrorHandler(logger);
  }
}