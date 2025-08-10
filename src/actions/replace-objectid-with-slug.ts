import { BaseAlgoliaAction, ActionOptions } from "../core/BaseAlgoliaAction";
import { ValidationService } from "../core/ValidationService";
import { Logger } from "../core/Logger";
import { AlgoliaRecord } from "../utils/types";
import { generateUid } from "../utils/uuidUtils";

interface ReplaceObjectIdWithSlugOptions extends ActionOptions {
  dryRun: boolean;
}

interface ReplaceObjectIdWithSlugResult {
  updatedRecords: number;
  skippedRecords: number;
  recordsWithoutSlug: number;
  recordsNotMatchingCriteria: number;
}

export class ReplaceObjectIdWithSlugAction extends BaseAlgoliaAction<
  ReplaceObjectIdWithSlugOptions,
  ReplaceObjectIdWithSlugResult
> {
  private logger: Logger;

  constructor(options: ReplaceObjectIdWithSlugOptions) {
    super(options);
    this.logger = new Logger();
  }

  protected async processRecords(): Promise<ReplaceObjectIdWithSlugResult> {
    this.logActionStart("Replace objectID with slug-based UUID action", 
      "Target: Records where objectID = generateUid(title) AND slug is defined");

    await this.confirmDestructiveAction(
      `This will replace objectID with generateUid(slug) for matching records in index "${this.config.indexName}".`
    );

    const result: ReplaceObjectIdWithSlugResult = {
      updatedRecords: 0,
      skippedRecords: 0,
      recordsWithoutSlug: 0,
      recordsNotMatchingCriteria: 0,
    };

    for await (const records of this.browseRecords()) {
      const updatedRecords: AlgoliaRecord[] = [];
      const oldObjectIds: string[] = [];

      for (const record of records) {
        this.metrics.processedRecords++;

        const updateResult = this.processRecord(record, result);
        if (updateResult) {
          updatedRecords.push(updateResult.newRecord);
          oldObjectIds.push(updateResult.oldObjectId);
          this.metrics.recordsWithChanges++;
          result.updatedRecords++;
        } else {
          result.skippedRecords++;
        }
      }

      if (!this.options.dryRun && updatedRecords.length > 0) {
        await this.saveRecords(updatedRecords);
        await this.deleteRecords(oldObjectIds);
      }
    }

    this.logResults();
    this.logDetailedResults(result);
    return result;
  }

  private processRecord(
    record: AlgoliaRecord, 
    result: ReplaceObjectIdWithSlugResult
  ): { newRecord: AlgoliaRecord; oldObjectId: string } | null {
    // Validate record has title
    if (!ValidationService.validateRecordWithTitle(record)) {
      this.metrics.recordsWithoutTitle++;
      return null;
    }

    // Check if record has slug
    if (!ValidationService.validateRecordWithSlug(record)) {
      result.recordsWithoutSlug++;
      return null;
    }

    // Check if current objectID matches generateUid(title)
    if (!ValidationService.validateObjectIdMatchesTitle(record)) {
      result.recordsNotMatchingCriteria++;
      return null;
    }

    // Generate new objectID based on slug
    const newObjectId = generateUid((record as any).slug);

    // Only update if the new objectID is different
    if (record.objectID === newObjectId) {
      return null;
    }

    // Log the change
    const action = this.options.dryRun ? "Would change" : "Changing";
    const slug = (record as any).slug;
    this.logger.info(`🔄 ${action}: "${record.objectID}" → "${newObjectId}" (slug: "${slug}")`);

    return {
      newRecord: { ...record, objectID: newObjectId },
      oldObjectId: record.objectID,
    };
  }

  protected override validateRecord(record: unknown): record is AlgoliaRecord {
    return ValidationService.validateRecordWithTitle(record) &&
           ValidationService.validateRecordWithResourceType(record);
  }

  protected override logResults(): void {
    const duration = (Date.now() - this.startTime) / 1000;

    console.log("");
    console.log("📈 Processing Complete!");
    console.log("━".repeat(50));
    console.log(`📊 Total records processed: ${this.metrics.processedRecords}`);
    console.log(`🔄 Records that would change: ${this.metrics.recordsWithChanges}`);
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

  private logDetailedResults(result: ReplaceObjectIdWithSlugResult): void {
    console.log(`📄 Records without slug: ${result.recordsWithoutSlug}`);
    console.log(`🎯 Records not matching criteria: ${result.recordsNotMatchingCriteria}`);
  }
}

export async function replaceObjectIdWithSlug(
  options: ReplaceObjectIdWithSlugOptions
): Promise<void> {
  const action = new ReplaceObjectIdWithSlugAction(options);
  const result = await action.execute();
  
  if (!result.success) {
    process.exit(1);
  }
}