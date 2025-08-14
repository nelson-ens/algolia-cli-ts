import { BaseAlgoliaAction, ActionOptions } from "../core/BaseAlgoliaAction";
import { ValidationService } from "../core/ValidationService";
import { Logger } from "../core/Logger";
import { AlgoliaRecord } from "../utils/types";
import { generateUid } from "../utils/uuidUtils";

interface FindMatchingObjectIdOptions extends ActionOptions {
  // No additional options needed for this read-only action
}

interface FindMatchingObjectIdResult {
  matchingRecords: AlgoliaRecord[];
  totalScanned: number;
}

export class FindMatchingObjectIdAction extends BaseAlgoliaAction<
  FindMatchingObjectIdOptions,
  FindMatchingObjectIdResult
> {
  protected override logger: Logger;
  private matchingRecords: AlgoliaRecord[] = [];

  constructor(options: FindMatchingObjectIdOptions) {
    super(options);
    this.logger = new Logger();
  }

  protected async processRecords(): Promise<FindMatchingObjectIdResult> {
    this.logActionStart(
      "Find records with matching objectID action",
      "Find records where objectID equals generateUid(title)"
    );

    for await (const records of this.browseRecords()) {
      for (const record of records) {
        this.metrics.processedRecords++;

        if (this.isMatchingRecord(record)) {
          this.matchingRecords.push(record);
          this.logMatchingRecord(record);
        }
      }
    }

    this.logMatchingRecordsSummary();

    return {
      matchingRecords: this.matchingRecords,
      totalScanned: this.metrics.processedRecords,
    };
  }

  private isMatchingRecord(record: AlgoliaRecord): boolean {
    // Validate record has title
    if (!ValidationService.validateRecordWithTitle(record)) {
      this.metrics.recordsWithoutTitle++;
      return false;
    }

    // Check if objectID matches generated UID from title
    const expectedObjectId = generateUid(record.title);
    return record.objectID === expectedObjectId;
  }

  private logMatchingRecord(record: AlgoliaRecord): void {
    const title = (record as any).title || "N/A";
    const slug = (record as any).slug || "N/A";
    const resourceType = (record as any).resourceType || "N/A";

    this.logger.success(`Match found: ${record.objectID}`, {
      title,
      slug,
      resourceType,
    });
  }

  private logMatchingRecordsSummary(): void {
    this.logger.section("Search Results");
    this.logger.logRaw(
      `✅ Matching records found: ${this.matchingRecords.length}`
    );

    if (this.matchingRecords.length > 0) {
      this.logger.logRaw("");
      this.logger.logRaw("🎯 Matching Records:");
      this.matchingRecords.forEach((record, index) => {
        const title = (record as any).title || "N/A";
        this.logger.logRaw(`   ${index + 1}. ${record.objectID} - "${title}"`);
      });
    }
  }

  protected override validateRecord(record: unknown): record is AlgoliaRecord {
    // For this action, we want to include records even without resourceType
    return ValidationService.validateBasicRecord(record);
  }

  protected override logResults(): void {
    const duration = (Date.now() - this.startTime) / 1000;

    this.logger.logRaw("");
    this.logger.logRaw("📈 Search Complete!");
    this.logger.logRaw("━".repeat(50));
    this.logger.logRaw(
      `📊 Total records processed: ${this.metrics.processedRecords}`
    );
    this.logger.logRaw(
      `✅ Matching records found: ${this.matchingRecords.length}`
    );
    this.logger.logRaw(
      `⚠️  Records without title: ${this.metrics.recordsWithoutTitle}`
    );
    this.logger.logRaw(
      `📦 Batches processed: ${this.metrics.batchesProcessed}`
    );
    this.logger.logRaw(`⏱️  Processing time: ${duration.toFixed(2)}s`);

    if (this.metrics.errors.length > 0) {
      this.logger.logRaw("");
      this.logger.logRaw("❌ Errors encountered:");
      this.logger.logRaw(`   ${this.metrics.errors.length} issues found`);
    }
  }
}

export async function findMatchingObjectId(
  options: FindMatchingObjectIdOptions
): Promise<void> {
  const action = new FindMatchingObjectIdAction(options);
  const result = await action.execute();

  if (!result.success) {
    process.exit(1);
  }
}
