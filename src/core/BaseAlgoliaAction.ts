import { algoliasearch, SearchClient } from "algoliasearch";
import { promptUser } from "../utils/prompt";
import { AlgoliaRecord, ProcessingMetrics } from "../utils/types";

export interface AlgoliaConfig {
  appId: string;
  apiKey: string;
  indexName: string;
}

export interface ActionOptions {
  indexName?: string | undefined;
  dryRun?: boolean | undefined;
  batchSize?: number | undefined;
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

  constructor(options: TOptions) {
    this.options = options;
    this.config = this.validateAndGetConfig();
    this.client = algoliasearch(this.config.appId, this.config.apiKey);
    this.metrics = this.initializeMetrics();
    this.startTime = 0;
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

  protected async confirmDestructiveAction(message: string): Promise<void> {
    if (this.options.dryRun) {
      return;
    }

    const confirmation = await promptUser(
      `⚠️  ${message} This is a destructive operation that cannot be undone.\n` +
        `Are you sure you want to proceed? (yes/no): `
    );

    if (confirmation.toLowerCase() !== "yes") {
      console.log("❌ Operation cancelled by user.");
      process.exit(0);
    }
    console.log("");
  }

  protected logActionStart(actionName: string, description?: string): void {
    const mode = this.options.dryRun ? "DRY RUN" : "EXECUTING";
    console.log(`🔍 ${mode} - ${actionName}`);
    console.log(`📊 Index: ${this.config.indexName}`);
    if (description) {
      console.log(`🎯 ${description}`);
    }
    console.log("");
  }

  protected async *browseRecords(filters?: string): AsyncGenerator<AlgoliaRecord[], void, undefined> {
    let cursor: string | undefined;
    const batchSize = this.options.batchSize || 1000;

    while (true) {
      console.log(`📦 Processing batch ${this.metrics.batchesProcessed + 1}...`);

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
          this.metrics.errors.push(
            `Invalid record structure: ${JSON.stringify(record)}`
          );
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
    } else if (!this.options.dryRun && this.metrics.recordsWithChanges > 0) {
      console.log("");
      console.log("✅ Changes have been applied to the index.");
    }

    if (this.metrics.errors.length > 0) {
      console.log("");
      console.log("❌ Errors encountered:");
      console.log(`   ${this.metrics.errors.length} issues found`);
    }
  }

  protected abstract processRecords(): Promise<TResult>;

  public async execute(): Promise<ActionResult<TResult>> {
    try {
      this.startTime = Date.now();
      const data = await this.processRecords();
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
      
      return {
        success: false,
        metrics: this.metrics,
        duration: (Date.now() - this.startTime) / 1000,
      };
    }
  }
}