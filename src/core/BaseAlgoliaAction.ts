import { algoliasearch, SearchClient } from "algoliasearch";
import { promptUser } from "../utils/prompt";
import { AlgoliaRecord, ProcessingMetrics } from "../utils/types";
import { Logger, LogLevel } from "./Logger";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

export interface AlgoliaConfig {
  appId: string;
  apiKey: string;
  indexName: string;
}

export interface ActionOptions {
  indexName?: string | undefined;
  dryRun?: boolean | undefined;
  batchSize?: number | undefined;
  logFile?: boolean | undefined;
}

export interface ActionResult<T = any> {
  success: boolean;
  metrics: ProcessingMetrics;
  data?: T;
  duration: number;
}

export abstract class BaseAlgoliaAction<TOptions extends ActionOptions = ActionOptions, TResult = any> {
  protected client: SearchClient;
  protected config: AlgoliaConfig;
  protected options: TOptions;
  protected metrics: ProcessingMetrics;
  protected startTime: number;
  protected logger?: Logger;
  private logFilePath?: string;

  constructor(options: TOptions) {
    this.options = options;
    this.config = this.validateAndGetConfig();
    this.client = algoliasearch(this.config.appId, this.config.apiKey);
    this.metrics = this.initializeMetrics();
    this.startTime = 0;
    
    if (options.logFile) {
      this.initializeLogFile();
    }
  }

  protected validateAndGetConfig(): AlgoliaConfig {
    const appId = process.env.ALGOLIA_APP_ID;
    const apiKey = process.env.ALGOLIA_API_KEY;
    const indexName = this.options.indexName || process.env.ALGOLIA_INDEX_NAME;

    if (!appId || !apiKey || !indexName) {
      console.error("❌ Missing required environment variables:");
      console.error("   ALGOLIA_APP_ID, ALGOLIA_API_KEY, ALGOLIA_INDEX_NAME");
      console.error("   Or provide --index parameter");
      process.exit(1);
    }

    return { appId, apiKey, indexName };
  }

  protected initializeMetrics(): ProcessingMetrics {
    return {
      totalRecords: 0,
      processedRecords: 0,
      recordsWithChanges: 0,
      recordsWithoutTitle: 0,
      batchesProcessed: 0,
      errors: [],
    };
  }

  private initializeLogFile(): void {
    const actionName = this.constructor.name
      .replace('Action', '')
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()
      .substring(1);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const logDir = "logs";

    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }

    const fileName = `${actionName}-${timestamp}.log`;
    this.logFilePath = join(logDir, fileName);

    this.logToFile("INFO", `Started logging for action: ${actionName}`, {
      timestamp,
      actionName,
      indexName: this.config.indexName,
      dryRun: this.options.dryRun,
      batchSize: this.options.batchSize
    });
    
    if (this.logger) {
      this.logger.info(`📝 Logging to file: ${this.logFilePath}`);
    } else {
      console.log(`📝 Logging to file: ${this.logFilePath}`);
    }
  }

  private logToFile(
    level: "INFO" | "ERROR" | "DEBUG" | "WARN",
    message: string,
    data?: any
  ): void {
    if (!this.logFilePath) return;

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data
    };

    const logLine = JSON.stringify(entry) + "\n";
    writeFileSync(this.logFilePath, logLine, { flag: "a" });
  }

  protected async confirmDestructiveAction(message: string): Promise<void> {
    if (this.options.dryRun) {
      return;
    }

    const confirmation = await promptUser(
      `⚠️  ${message} This is a destructive operation that cannot be undone.\n` +
        `Are you sure you want to proceed? (yes/no): `
    );

    if (confirmation.toLowerCase() !== "yes") {
      if (this.logger) {
        this.logger.error("❌ Operation cancelled by user.");
      } else {
        console.log("❌ Operation cancelled by user.");
      }
      process.exit(0);
    }
    if (this.logger) {
      this.logger.logRaw("");
    } else {
      console.log("");
    }
  }

  protected logActionStart(actionName: string, description?: string): void {
    const mode = this.options.dryRun ? "DRY RUN" : "EXECUTING";
    const startMessage = `🔍 ${mode} - ${actionName}`;
    const indexMessage = `📊 Index: ${this.config.indexName}`;
    
    if (this.logger) {
      this.logger.info(startMessage);
      this.logger.info(indexMessage);
      if (description) {
        this.logger.info(`🎯 ${description}`);
      }
      this.logger.logRaw("");
    } else {
      // Fallback for actions that don't have logger initialized
      console.log(startMessage);
      console.log(indexMessage);
      if (description) {
        console.log(`🎯 ${description}`);
      }
      console.log("");
      
      this.logToFile("INFO", startMessage);
      this.logToFile("INFO", indexMessage);
      if (description) {
        this.logToFile("INFO", `🎯 ${description}`);
      }
      this.logToFile("INFO", "");
    }
  }

  protected async *browseRecords(filters?: string): AsyncGenerator<AlgoliaRecord[], void, undefined> {
    let cursor: string | undefined;
    const batchSize = this.options.batchSize || 1000;

    while (true) {
      const batchMessage = `📦 Processing batch ${this.metrics.batchesProcessed + 1}...`;
      if (this.logger) {
        this.logger.info(batchMessage);
      } else {
        console.log(batchMessage);
        this.logToFile("INFO", batchMessage);
      }

      const response = await this.client.browse({
        indexName: this.config.indexName,
        browseParams: {
          hitsPerPage: batchSize,
          cursor,
          ...(filters && { filters }),
        },
      });

      const validRecords: AlgoliaRecord[] = [];
      
      for (const record of response.hits as unknown[]) {
        if (this.validateRecord(record)) {
          validRecords.push(record);
          this.metrics.totalRecords++;
        } else {
          const errorMessage = `Invalid record structure: ${JSON.stringify(record)}`;
          this.metrics.errors.push(errorMessage);
          this.logToFile("ERROR", errorMessage);
        }
      }

      this.metrics.batchesProcessed++;
      cursor = response.cursor;

      yield validRecords;

      if (!cursor) {
        break;
      }
    }
  }

  protected validateRecord(record: unknown): record is AlgoliaRecord {
    return (
      typeof record === "object" &&
      record !== null &&
      "objectID" in record &&
      typeof (record as { objectID: unknown }).objectID === "string"
    );
  }

  protected async saveRecords(records: AlgoliaRecord[]): Promise<void> {
    if (records.length === 0) return;

    await this.client.saveObjects({
      indexName: this.config.indexName,
      objects: records,
    });
  }

  protected async deleteRecords(objectIds: string[]): Promise<void> {
    if (objectIds.length === 0) return;

    await this.client.deleteObjects({
      indexName: this.config.indexName,
      objectIDs: objectIds,
    });
  }

  protected logResults(): void {
    const duration = (Date.now() - this.startTime) / 1000;
    const resultsData = {
      totalRecords: this.metrics.processedRecords,
      recordsWithChanges: this.metrics.recordsWithChanges,
      recordsWithoutTitle: this.metrics.recordsWithoutTitle,
      batchesProcessed: this.metrics.batchesProcessed,
      processingTime: `${duration.toFixed(2)}s`,
      dryRun: this.options.dryRun,
      errors: this.metrics.errors
    };

    this.logToFile("INFO", "Processing Complete", resultsData);

    if (this.logger) {
      this.logger.logRaw("");
      this.logger.logRaw("📈 Processing Complete!");
      this.logger.logRaw("━".repeat(50));
      this.logger.logRaw(`📊 Total records processed: ${this.metrics.processedRecords}`);
      this.logger.logRaw(`🔄 Records with changes: ${this.metrics.recordsWithChanges}`);
      this.logger.logRaw(`⚠️  Records without title: ${this.metrics.recordsWithoutTitle}`);
      this.logger.logRaw(`📦 Batches processed: ${this.metrics.batchesProcessed}`);
      this.logger.logRaw(`⏱️  Processing time: ${duration.toFixed(2)}s`);

      if (this.options.dryRun && this.metrics.recordsWithChanges > 0) {
        this.logger.logRaw("");
        this.logger.logRaw("💡 This was a dry run. Use --execute to apply changes.");
      } else if (!this.options.dryRun && this.metrics.recordsWithChanges > 0) {
        this.logger.logRaw("");
        this.logger.logRaw("✅ Changes have been applied to the index.");
      }

      if (this.metrics.errors.length > 0) {
        this.logger.logRaw("");
        this.logger.logRaw("❌ Errors encountered:");
        this.logger.logRaw(`   ${this.metrics.errors.length} issues found`);
      }
    } else {
      // Fallback for actions without logger
      console.log("");
      console.log("📈 Processing Complete!");
      console.log("━".repeat(50));
      console.log(`📊 Total records processed: ${this.metrics.processedRecords}`);
      console.log(`🔄 Records with changes: ${this.metrics.recordsWithChanges}`);
      console.log(`⚠️  Records without title: ${this.metrics.recordsWithoutTitle}`);
      console.log(`📦 Batches processed: ${this.metrics.batchesProcessed}`);
      console.log(`⏱️  Processing time: ${duration.toFixed(2)}s`);

      if (this.options.dryRun && this.metrics.recordsWithChanges > 0) {
        console.log("");
        console.log("💡 This was a dry run. Use --execute to apply changes.");
        this.logToFile("INFO", "This was a dry run. Use --execute to apply changes.");
      } else if (!this.options.dryRun && this.metrics.recordsWithChanges > 0) {
        console.log("");
        console.log("✅ Changes have been applied to the index.");
        this.logToFile("INFO", "Changes have been applied to the index.");
      }

      if (this.metrics.errors.length > 0) {
        console.log("");
        console.log("❌ Errors encountered:");
        console.log(`   ${this.metrics.errors.length} issues found`);
        this.logToFile("ERROR", `${this.metrics.errors.length} errors encountered`, { errors: this.metrics.errors });
      }
    }

    if (this.logFilePath) {
      if (this.logger) {
        this.logger.logRaw(`📝 Full results logged to: ${this.logFilePath}`);
      } else {
        console.log(`📝 Full results logged to: ${this.logFilePath}`);
      }
    }
  }

  protected writeLoggerEntriesToFile(): void {
    if (!this.logger || !this.logFilePath) return;

    const entries = this.logger.getEntries();
    for (const entry of entries) {
      const logData = {
        timestamp: entry.timestamp.toISOString(),
        level: LogLevel[entry.level],
        message: entry.message,
        ...(entry.context && { data: entry.context })
      };
      
      const logLine = JSON.stringify(logData) + "\n";
      writeFileSync(this.logFilePath, logLine, { flag: "a" });
    }
  }

  protected abstract processRecords(): Promise<TResult>;

  public async execute(): Promise<ActionResult<TResult>> {
    try {
      this.startTime = Date.now();
      const data = await this.processRecords();
      
      // Call logResults and write logger entries to file
      this.logResults();
      this.writeLoggerEntriesToFile();
      
      const duration = (Date.now() - this.startTime) / 1000;

      return {
        success: true,
        metrics: this.metrics,
        data,
        duration,
      };
    } catch (error) {
      console.error(
        "❌ Fatal error:",
        error instanceof Error ? error.message : String(error)
      );
      
      // Still try to write logger entries on error
      this.writeLoggerEntriesToFile();
      
      return {
        success: false,
        metrics: this.metrics,
        duration: (Date.now() - this.startTime) / 1000,
      };
    }
  }
}