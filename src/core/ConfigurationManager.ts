import { ResourceTypeConfig, ActionConfig } from "../utils/types";
import { ValidationService } from "./ValidationService";
import { AppErrorHandler, ErrorCode } from "./ErrorHandler";

export class ConfigurationManager {
  private errorHandler: AppErrorHandler;

  constructor(errorHandler: AppErrorHandler) {
    this.errorHandler = errorHandler;
  }

  getAlgoliaConfig(indexNameOverride?: string): ActionConfig {
    const appId = process.env.ALGOLIA_APP_ID;
    const apiKey = process.env.ALGOLIA_API_KEY;
    const indexName = indexNameOverride || process.env.ALGOLIA_INDEX_NAME;

    if (!appId) {
      throw this.errorHandler.handleConfigurationError(
        "Missing ALGOLIA_APP_ID environment variable"
      );
    }

    if (!apiKey) {
      throw this.errorHandler.handleConfigurationError(
        "Missing ALGOLIA_API_KEY environment variable"
      );
    }

    if (!indexName) {
      throw this.errorHandler.handleConfigurationError(
        "Missing ALGOLIA_INDEX_NAME environment variable or --index parameter"
      );
    }

    return {
      appId: appId.trim(),
      apiKey: apiKey.trim(),
      indexName: indexName.trim(),
    };
  }

  getResourceTypeConfigs(): ResourceTypeConfig[] {
    const mappingStr = process.env.RESOURCE_TYPE_SCHEMA_PATH_MAPPING;
    
    const validation = ValidationService.validateResourceTypeMapping(mappingStr);
    
    if (!validation.isValid) {
      validation.errors.forEach(error => 
        this.errorHandler.handleConfigurationError(error)
      );
      
      throw this.errorHandler.createError(
        ErrorCode.CONFIGURATION_ERROR,
        "Invalid resource type mapping configuration"
      );
    }

    try {
      const resourceMappingObj = JSON.parse(mappingStr!);
      return Object.entries(resourceMappingObj).map(([resourceType, config]) => ({
        resourceType,
        schemaPath: (config as any).schemaPath,
      }));
    } catch (error) {
      throw this.errorHandler.handleConfigurationError(
        "Failed to parse resource type mapping",
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  validateRequiredEnvVars(required: string[]): void {
    const validation = ValidationService.validateEnvironmentVariables(required);
    
    if (!validation.isValid) {
      validation.errors.forEach(error => 
        this.errorHandler.handleConfigurationError(error)
      );
      
      throw this.errorHandler.createError(
        ErrorCode.CONFIGURATION_ERROR,
        "Missing required environment variables"
      );
    }

    // Log warnings for empty variables
    validation.warnings.forEach(warning => 
      console.warn(`⚠️  ${warning}`)
    );
  }

  getBatchSize(override?: number): number {
    const defaultBatchSize = 1000;
    const envBatchSize = process.env.ALGOLIA_BATCH_SIZE;
    
    if (override && override > 0) {
      return Math.min(override, 10000); // Cap at 10k for safety
    }
    
    if (envBatchSize) {
      const parsed = parseInt(envBatchSize, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return Math.min(parsed, 10000);
      }
    }
    
    return defaultBatchSize;
  }

  getTimeout(override?: number): number {
    const defaultTimeout = 30000; // 30 seconds
    const envTimeout = process.env.ALGOLIA_TIMEOUT_MS;
    
    if (override && override > 0) {
      return override;
    }
    
    if (envTimeout) {
      const parsed = parseInt(envTimeout, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
    
    return defaultTimeout;
  }

  isDebugMode(): boolean {
    const debug = process.env.DEBUG || process.env.NODE_ENV === 'development';
    return Boolean(debug);
  }

  getLogLevel(): string {
    return process.env.LOG_LEVEL || (this.isDebugMode() ? 'debug' : 'info');
  }

  static create(errorHandler: AppErrorHandler): ConfigurationManager {
    return new ConfigurationManager(errorHandler);
  }
}