import { BaseAlgoliaAction, ActionOptions } from "../core/BaseAlgoliaAction";
import { ValidationService } from "../core/ValidationService";
import { Logger } from "../core/Logger";
import { AlgoliaRecord } from "../utils/types";

interface DeleteRecordsByPatternOptions extends ActionOptions {
  key: string;
  pattern: string;
}

interface DeleteRecordsByPatternResult {
  matchingRecords: AlgoliaRecord[];
  deletedRecords: number;
  regex: RegExp;
}

export class DeleteRecordsByPatternAction extends BaseAlgoliaAction<
  DeleteRecordsByPatternOptions,
  DeleteRecordsByPatternResult
> {
  protected override logger: Logger;
  private regex: RegExp;
  private matchingRecords: AlgoliaRecord[] = [];

  constructor(options: DeleteRecordsByPatternOptions) {
    super(options);
    this.logger = new Logger();
    this.validateOptions();
    this.regex = new RegExp(options.pattern);
  }

  private validateOptions(): void {
    if (!this.options.key || typeof this.options.key !== 'string') {
      throw new Error("Missing required parameter: --key must be a non-empty string");
    }

    if (!this.options.pattern || typeof this.options.pattern !== 'string') {
      throw new Error("Missing required parameter: --pattern must be a non-empty string");
    }

    // Validate regex pattern
    try {
      new RegExp(this.options.pattern);
    } catch (error) {
      throw new Error(`Invalid regular expression pattern: ${this.options.pattern}. ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  protected async processRecords(): Promise<DeleteRecordsByPatternResult> {
    this.logActionStart(
      "Delete records by pattern action",
      `Delete records where field "${this.options.key}" matches pattern: ${this.options.pattern}`
    );

    if (!this.options.dryRun) {
      await this.confirmDestructiveAction(
        `This action will delete records where field "${this.options.key}" matches pattern "${this.options.pattern}".`
      );
    }

    // First pass: Find matching records
    for await (const records of this.browseRecords()) {
      for (const record of records) {
        this.metrics.processedRecords++;

        if (this.recordMatchesPattern(record)) {
          this.matchingRecords.push(record);
          this.metrics.recordsWithChanges++;
          
          this.logger.info(
            `Found matching record: ${record.objectID}`,
            {
              key: this.options.key,
              value: record[this.options.key],
              pattern: this.options.pattern,
            }
          );
        }
      }
    }

    // Second pass: Delete matching records if not dry run
    let deletedCount = 0;
    if (!this.options.dryRun && this.matchingRecords.length > 0) {
      const objectIdsToDelete = this.matchingRecords.map(record => record.objectID);
      
      this.logger.info(`Deleting ${objectIdsToDelete.length} matching records...`);
      await this.deleteRecords(objectIdsToDelete);
      deletedCount = objectIdsToDelete.length;
    }

    this.logMatchingSummary();

    return {
      matchingRecords: this.matchingRecords,
      deletedRecords: deletedCount,
      regex: this.regex,
    };
  }

  private recordMatchesPattern(record: AlgoliaRecord): boolean {
    const fieldValue = record[this.options.key];
    
    // Only process string values
    if (typeof fieldValue !== 'string') {
      return false;
    }

    return this.regex.test(fieldValue);
  }

  private logMatchingSummary(): void {
    this.logger.section("Pattern Matching Results");
    this.logger.logRaw(`🔍 Field: "${this.options.key}"`);
    this.logger.logRaw(`📝 Pattern: ${this.options.pattern}`);
    this.logger.logRaw(`📊 Matching records found: ${this.matchingRecords.length}`);

    if (this.matchingRecords.length > 0) {
      this.logger.logRaw("");
      this.logger.logRaw("🎯 Matching Records:");
      
      this.matchingRecords.slice(0, 10).forEach((record, index) => {
        const fieldValue = record[this.options.key];
        const title = record.title || "N/A";
        const resourceType = record.resourceType || "N/A";
        
        this.logger.logRaw(
          `   ${index + 1}. ${record.objectID} - "${title}" [${resourceType}]`
        );
        this.logger.logRaw(`      ${this.options.key}: "${fieldValue}"`);
      });

      if (this.matchingRecords.length > 10) {
        this.logger.logRaw(`   ... and ${this.matchingRecords.length - 10} more records`);
      }
    }
  }

  protected override validateRecord(record: unknown): record is AlgoliaRecord {
    return ValidationService.validateBasicRecord(record);
  }

  protected override logResults(): void {
    const duration = (Date.now() - this.startTime) / 1000;

    this.logger.logRaw("");
    this.logger.logRaw("📈 Pattern Deletion Complete!");
    this.logger.logRaw("━".repeat(50));
    this.logger.logRaw(`📊 Total records processed: ${this.metrics.processedRecords}`);
    this.logger.logRaw(`🎯 Matching records found: ${this.matchingRecords.length}`);
    this.logger.logRaw(`🗑️  Records deleted: ${this.options.dryRun ? 0 : this.metrics.recordsWithChanges}`);
    this.logger.logRaw(`📦 Batches processed: ${this.metrics.batchesProcessed}`);
    this.logger.logRaw(`⏱️  Processing time: ${duration.toFixed(2)}s`);

    if (this.options.dryRun && this.matchingRecords.length > 0) {
      this.logger.logRaw("");
      this.logger.logRaw("💡 This was a dry run. Use --execute to delete the matching records.");
    } else if (!this.options.dryRun && this.metrics.recordsWithChanges > 0) {
      this.logger.logRaw("");
      this.logger.logRaw("✅ Matching records have been deleted from the index.");
    } else if (!this.options.dryRun && this.matchingRecords.length === 0) {
      this.logger.logRaw("");
      this.logger.logRaw("ℹ️  No matching records found to delete.");
    }

    if (this.metrics.errors.length > 0) {
      this.logger.logRaw("");
      this.logger.logRaw("❌ Errors encountered:");
      this.logger.logRaw(`   ${this.metrics.errors.length} issues found`);
    }
  }
}

export async function deleteRecordsByPattern(
  options: DeleteRecordsByPatternOptions
): Promise<void> {
  const action = new DeleteRecordsByPatternAction(options);
  const result = await action.execute();

  if (!result.success) {
    process.exit(1);
  }
}