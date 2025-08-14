import { BaseAlgoliaAction, ActionOptions } from "../core/BaseAlgoliaAction";
import { ValidationService } from "../core/ValidationService";
import { Logger } from "../core/Logger";
import { AlgoliaRecord } from "../utils/types";
import { generateUid } from "../utils/uuidUtils";

interface FindInvalidRecordsOptions extends ActionOptions {
  keys: string;
}

interface FindInvalidRecordsResult {
  invalidRecords: AlgoliaRecord[];
  deletedRecords: number;
  checkedKeys: string[];
}

export class FindInvalidRecordsAction extends BaseAlgoliaAction<
  FindInvalidRecordsOptions,
  FindInvalidRecordsResult
> {
  protected override logger: Logger;
  private checkedKeys: string[];
  private invalidRecords: AlgoliaRecord[] = [];

  constructor(options: FindInvalidRecordsOptions) {
    super(options);
    this.logger = new Logger();
    this.validateOptions();
    this.checkedKeys = this.parseKeys(options.keys);
  }

  private validateOptions(): void {
    if (!this.options.keys || typeof this.options.keys !== "string") {
      throw new Error(
        "Missing required parameter: --keys must be a non-empty string"
      );
    }

    if (this.options.keys.trim().length === 0) {
      throw new Error("--keys parameter cannot be empty");
    }
  }

  private parseKeys(keysString: string): string[] {
    return keysString
      .split(",")
      .map((key) => key.trim())
      .filter((key) => key.length > 0);
  }

  private isValueInvalid(value: any): boolean {
    return (
      value === null ||
      value === undefined ||
      (typeof value === "string" && value.trim() === "")
    );
  }

  private recordHasInvalidKeys(record: AlgoliaRecord): boolean {
    return this.checkedKeys.every((key) => {
      // Check if key doesn't exist or has invalid value
      return !(key in record) || this.isValueInvalid(record[key]);
    });
  }

  private getInvalidKeysForRecord(record: AlgoliaRecord): string[] {
    return this.checkedKeys.filter((key) => {
      return !(key in record) || this.isValueInvalid(record[key]);
    });
  }

  protected async processRecords(): Promise<FindInvalidRecordsResult> {
    this.logActionStart(
      "Find invalid records action",
      `Find records with invalid values for keys: ${this.checkedKeys.join(
        ", "
      )}`
    );

    if (!this.options.dryRun) {
      await this.confirmDestructiveAction(
        `This action will delete records that have invalid values (null, undefined, empty string, or missing) for any of these keys: ${this.checkedKeys.join(
          ", "
        )}.`
      );
    }

    // First pass: Find invalid records
    for await (const records of this.browseRecords()) {
      for (const record of records) {
        this.metrics.processedRecords++;

        if (
          this.recordHasInvalidKeys(record) &&
          generateUid(record.title || "") === record.objectID
        ) {
          this.invalidRecords.push(record);
          this.metrics.recordsWithChanges++;

          const invalidKeys = this.getInvalidKeysForRecord(record);
          this.logger.info(`Found invalid record: ${record.objectID}`, {
            invalidKeys,
            title: record.title || "N/A",
            resourceType: record.resourceType || "N/A",
          });
        }
      }
    }

    // Second pass: Delete invalid records if not dry run
    let deletedCount = 0;
    if (!this.options.dryRun && this.invalidRecords.length > 0) {
      const objectIdsToDelete = this.invalidRecords.map(
        (record) => record.objectID
      );

      this.logger.info(
        `Deleting ${objectIdsToDelete.length} invalid records...`
      );
      await this.deleteRecords(objectIdsToDelete);
      deletedCount = objectIdsToDelete.length;
    }

    this.logInvalidRecordsSummary();

    return {
      invalidRecords: this.invalidRecords,
      deletedRecords: deletedCount,
      checkedKeys: this.checkedKeys,
    };
  }

  private logInvalidRecordsSummary(): void {
    this.logger.section("Invalid Records Analysis");
    this.logger.logRaw(`🔍 Checked keys: ${this.checkedKeys.join(", ")}`);
    this.logger.logRaw(
      `📊 Invalid records found: ${this.invalidRecords.length}`
    );

    if (this.invalidRecords.length > 0) {
      this.logger.logRaw("");
      this.logger.logRaw("🎯 Invalid Records (first 10):");

      this.invalidRecords.slice(0, 10).forEach((record, index) => {
        const title = record.title || "N/A";
        const resourceType = record.resourceType || "N/A";
        const invalidKeys = this.getInvalidKeysForRecord(record);

        this.logger.logRaw(
          `   ${index + 1}. ${record.objectID} - "${title}" [${resourceType}]`
        );
        this.logger.logRaw(`      Invalid keys: ${invalidKeys.join(", ")}`);

        // Show the invalid values for context
        invalidKeys.forEach((key) => {
          const value = key in record ? record[key] : "<missing>";
          const displayValue =
            value === null
              ? "<null>"
              : value === undefined
              ? "<undefined>"
              : value === ""
              ? "<empty string>"
              : "<missing>";
          this.logger.logRaw(`        ${key}: ${displayValue}`);
        });
      });

      if (this.invalidRecords.length > 10) {
        this.logger.logRaw(
          `   ... and ${this.invalidRecords.length - 10} more records`
        );
      }
    }
  }

  protected override validateRecord(record: unknown): record is AlgoliaRecord {
    return ValidationService.validateBasicRecord(record);
  }

  protected override logResults(): void {
    const duration = (Date.now() - this.startTime) / 1000;

    this.logger.logRaw("");
    this.logger.logRaw("📈 Invalid Records Analysis Complete!");
    this.logger.logRaw("━".repeat(50));
    this.logger.logRaw(
      `📊 Total records processed: ${this.metrics.processedRecords}`
    );
    this.logger.logRaw(
      `🎯 Invalid records found: ${this.invalidRecords.length}`
    );
    this.logger.logRaw(
      `🗑️  Records deleted: ${
        this.options.dryRun ? 0 : this.metrics.recordsWithChanges
      }`
    );
    this.logger.logRaw(
      `📦 Batches processed: ${this.metrics.batchesProcessed}`
    );
    this.logger.logRaw(`⏱️  Processing time: ${duration.toFixed(2)}s`);

    if (this.options.dryRun && this.invalidRecords.length > 0) {
      this.logger.logRaw("");
      this.logger.logRaw(
        "💡 This was a dry run. Use --execute to delete the invalid records."
      );
    } else if (!this.options.dryRun && this.metrics.recordsWithChanges > 0) {
      this.logger.logRaw("");
      this.logger.logRaw(
        "✅ Invalid records have been deleted from the index."
      );
    } else if (!this.options.dryRun && this.invalidRecords.length === 0) {
      this.logger.logRaw("");
      this.logger.logRaw("ℹ️  No invalid records found to delete.");
    }

    if (this.metrics.errors.length > 0) {
      this.logger.logRaw("");
      this.logger.logRaw("❌ Errors encountered:");
      this.logger.logRaw(`   ${this.metrics.errors.length} issues found`);
    }
  }
}

export async function findInvalidRecords(
  options: FindInvalidRecordsOptions
): Promise<void> {
  const action = new FindInvalidRecordsAction(options);
  const result = await action.execute();

  if (!result.success) {
    process.exit(1);
  }
}
