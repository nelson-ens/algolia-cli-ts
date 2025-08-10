import { BaseAlgoliaAction, ActionOptions } from "../core/BaseAlgoliaAction";
import { ValidationService } from "../core/ValidationService";
import { Logger } from "../core/Logger";
import { BatchProcessor } from "../core/BatchProcessor";
import { AlgoliaRecord, DateProcessingMetrics } from "../utils/types";

interface FixPublishedDateOptions extends ActionOptions {
  resourceType: string;
  dryRun: boolean;
}

interface RecordToFix {
  record: AlgoliaRecord;
  originalDate: string;
  convertedTimestamp: number;
}

interface FixPublishedDateResult {
  analysis: DateProcessingMetrics;
  recordsFixed: number;
  invalidDates: string[];
}

export class FixPublishedDateAction extends BaseAlgoliaAction<
  FixPublishedDateOptions,
  FixPublishedDateResult
> {
  private logger: Logger;
  private batchProcessor: BatchProcessor<RecordToFix, void>;
  private analysis: DateProcessingMetrics;
  private recordsToFix: RecordToFix[] = [];

  constructor(options: FixPublishedDateOptions) {
    super(options);
    this.logger = new Logger();
    this.batchProcessor = new BatchProcessor({
      batchSize: options.batchSize || 1000,
      onBatchStart: (batchNumber) => {
        this.logger.progress(`Updating batch`, batchNumber, 0);
      },
    });
    this.analysis = this.initializeDateMetrics();
  }

  protected async processRecords(): Promise<FixPublishedDateResult> {
    this.validateResourceType();
    this.logActionStart(
      `Fix publishedDate for resourceType: ${this.options.resourceType}`,
      "Convert string publishedDate values to timestamps"
    );

    await this.confirmDestructiveAction(
      `This will convert string publishedDate values to timestamps for records with resourceType="${this.options.resourceType}" in index "${this.config.indexName}".`
    );

    // Phase 1: Analysis
    await this.analyzePublishedDates();
    this.logAnalysisResults();

    // Phase 2: Apply fixes if records need fixing
    let recordsFixed = 0;
    if (this.recordsToFix.length > 0) {
      recordsFixed = await this.applyFixes();
    } else {
      this.logger.success("No string dates found that need conversion");
    }

    return {
      analysis: this.analysis,
      recordsFixed,
      invalidDates: this.analysis.errors,
    };
  }

  private validateResourceType(): void {
    if (!this.options.resourceType || this.options.resourceType.trim() === '') {
      this.logger.error("Resource type is required");
      process.exit(1);
    }
  }

  private initializeDateMetrics(): DateProcessingMetrics {
    return {
      ...this.initializeMetrics(),
      fieldFound: 0,
      fieldEmpty: 0,
      fieldValidTimestamps: 0,
      fieldConvertibleDates: 0,
      fieldInvalidDates: 0,
    };
  }

  private async analyzePublishedDates(): Promise<void> {
    this.logger.section("Phase 1: Analyzing publishedDate fields");

    const filter = `resourceType:"${this.options.resourceType}"`;
    
    for await (const records of this.browseRecords(filter)) {
      for (const record of records) {
        this.analysis.processedRecords++;
        this.analyzeRecord(record);
      }
    }
  }

  private analyzeRecord(record: AlgoliaRecord): void {
    if (!ValidationService.validateBasicRecord(record)) {
      this.analysis.errors.push(
        `Invalid record structure: ${JSON.stringify(record)}`
      );
      return;
    }

    const publishedDate = (record as any).publishedDate;

    if (this.isNullOrEmpty(publishedDate)) {
      this.analysis.fieldEmpty++;
      return;
    }

    this.analysis.fieldFound++;

    if (typeof publishedDate === "string") {
      if (this.isValidDateString(publishedDate)) {
        this.analysis.fieldConvertibleDates++;
        const convertedTimestamp = this.convertToTimestamp(publishedDate);
        this.recordsToFix.push({
          record,
          originalDate: publishedDate,
          convertedTimestamp,
        });
      } else {
        this.analysis.fieldInvalidDates++;
        this.analysis.errors.push(
          `Invalid date string in record ${record.objectID}: "${publishedDate}"`
        );
      }
    } else if (typeof publishedDate === "number") {
      this.analysis.fieldValidTimestamps++;
    } else {
      this.analysis.errors.push(
        `Unexpected publishedDate type in record ${record.objectID}: ${typeof publishedDate}`
      );
    }
  }

  private isNullOrEmpty(value: any): boolean {
    return value === null || value === undefined || value === "";
  }

  private isValidDateString(value: string): boolean {
    const date = new Date(value);
    return !isNaN(date.getTime()) && value !== "";
  }

  private convertToTimestamp(value: string): number {
    return new Date(value).getTime();
  }

  private logAnalysisResults(): void {
    this.logger.section("Analysis Complete");
    console.log(`📊 Total records analyzed: ${this.analysis.processedRecords}`);
    console.log(`📝 String dates found: ${this.analysis.fieldConvertibleDates}`);
    console.log(`🔢 Numeric dates found: ${this.analysis.fieldValidTimestamps}`);
    console.log(`❌ Null/undefined/empty: ${this.analysis.fieldEmpty}`);
    console.log(`⚠️  Invalid date strings: ${this.analysis.fieldInvalidDates}`);
    console.log(`📦 Batches processed: ${this.analysis.batchesProcessed}`);
    console.log("");
  }

  private async applyFixes(): Promise<number> {
    if (this.options.dryRun) {
      this.logDryRunResults();
      return 0;
    }

    this.logger.info("🔄 Updating records with converted timestamps...");

    await this.batchProcessor.processItems(
      this.recordsToFix,
      async (batch, batchNumber) => {
        const batchRecords = batch.map(item => ({
          ...item.record,
          publishedDate: item.convertedTimestamp,
        }));

        await this.saveRecords(batchRecords);
        this.logger.info(`📤 Updated batch ${batchNumber} (${batch.length} records)`);
      }
    );

    const totalFixed = this.recordsToFix.length;
    this.logger.success(`Updated ${totalFixed} records with converted timestamps`);
    return totalFixed;
  }

  private logDryRunResults(): void {
    this.logger.info("🔄 Records that would be updated:");
    
    const samplesToShow = Math.min(10, this.recordsToFix.length);
    
    for (let i = 0; i < samplesToShow; i++) {
      const item = this.recordsToFix[i];
      if (item) {
        console.log(
          `   ${item.record.objectID}: "${item.originalDate}" → ${item.convertedTimestamp}`
        );
      }
    }

    if (this.recordsToFix.length > samplesToShow) {
      console.log(
        `   ... and ${this.recordsToFix.length - samplesToShow} more records`
      );
    }
  }

  protected override validateRecord(record: unknown): record is AlgoliaRecord {
    return ValidationService.validateBasicRecord(record);
  }

  protected override logResults(): void {
    const duration = (Date.now() - this.startTime) / 1000;

    console.log("");
    console.log(`⏱️  Processing time: ${duration.toFixed(2)}s`);

    if (this.options.dryRun && this.recordsToFix.length > 0) {
      console.log("");
      console.log("💡 This was a dry run. Use --execute to apply changes.");
    }

    if (this.analysis.errors.length > 0) {
      console.log("");
      console.log("❌ Errors encountered:");
      console.log(`   ${this.analysis.errors.length} issues found`);
      if (this.analysis.errors.length <= 5) {
        this.analysis.errors.forEach((error) => console.log(`   ${error}`));
      }
    }
  }
}

export async function fixPublishedDate(
  options: FixPublishedDateOptions
): Promise<void> {
  const action = new FixPublishedDateAction(options);
  const result = await action.execute();
  
  if (!result.success) {
    process.exit(1);
  }
}