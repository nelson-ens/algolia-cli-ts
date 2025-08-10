import { BaseAlgoliaAction, ActionOptions } from "../core/BaseAlgoliaAction";
import { ValidationService } from "../core/ValidationService";
import { Logger } from "../core/Logger";
import { BatchProcessor } from "../core/BatchProcessor";
import { AlgoliaRecord, DateProcessingMetrics } from "../utils/types";
import {
  dateStringToUnixTimestamp,
  normalizeTimestamp,
} from "../utils/dateUtils";

interface NormalizeDateFieldOptions extends ActionOptions {
  fieldName: string;
  dryRun: boolean;
}

interface RecordToFix {
  record: AlgoliaRecord;
  originalValue: any;
  convertedValue: number;
}

interface NormalizeDateFieldResult {
  analysis: DateProcessingMetrics;
  recordsFixed: number;
  fieldName: string;
  invalidValues: string[];
}

export class NormalizeDateFieldAction extends BaseAlgoliaAction<
  NormalizeDateFieldOptions,
  NormalizeDateFieldResult
> {
  protected override logger: Logger;
  private batchProcessor: BatchProcessor<RecordToFix, void>;
  private analysis: DateProcessingMetrics;
  private recordsToFix: RecordToFix[] = [];

  constructor(options: NormalizeDateFieldOptions) {
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

  protected async processRecords(): Promise<NormalizeDateFieldResult> {
    this.validateFieldName();
    this.logActionStart(
      `Normalize date field: ${this.options.fieldName}`,
      "Convert various date formats to Unix timestamps (seconds)"
    );

    await this.confirmDestructiveAction(
      `This will normalize date values in field "${this.options.fieldName}" to Unix timestamps (seconds) in index "${this.config.indexName}".`
    );

    // Phase 1: Analysis
    await this.analyzeDateField();
    this.logAnalysisResults();

    // Phase 2: Apply fixes if records need fixing
    let recordsFixed = 0;
    if (this.recordsToFix.length > 0) {
      recordsFixed = await this.applyFixes();
    } else {
      this.logger.success("No dates found that need normalization");
    }

    return {
      analysis: this.analysis,
      recordsFixed,
      fieldName: this.options.fieldName,
      invalidValues: this.analysis.errors,
    };
  }

  private validateFieldName(): void {
    if (!this.options.fieldName || this.options.fieldName.trim() === "") {
      this.logger.error("Field name is required");
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

  private async analyzeDateField(): Promise<void> {
    this.logger.section(`Phase 1: Analyzing ${this.options.fieldName} fields`);

    for await (const records of this.browseRecords()) {
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

    const fieldValue = (record as any)[this.options.fieldName];

    if (this.isNullOrEmpty(fieldValue)) {
      this.analysis.fieldEmpty++;
      return;
    }

    this.analysis.fieldFound++;

    const convertedValue = this.attemptDateConversion(fieldValue);

    if (convertedValue !== null) {
      if (this.isAlreadyNormalizedTimestamp(fieldValue, convertedValue)) {
        this.analysis.fieldValidTimestamps++;
      } else {
        this.analysis.fieldConvertibleDates++;
        this.recordsToFix.push({
          record,
          originalValue: fieldValue,
          convertedValue: convertedValue,
        });
      }
    } else {
      this.analysis.fieldInvalidDates++;
      this.analysis.errors.push(
        `Cannot convert ${this.options.fieldName} in record ${record.objectID}: "${fieldValue}"`
      );
    }
  }

  private isNullOrEmpty(value: any): boolean {
    return value === null || value === undefined || value === "";
  }

  private isAlreadyNormalizedTimestamp(
    originalValue: any,
    convertedValue: number
  ): boolean {
    return (
      typeof originalValue === "number" &&
      originalValue > 0 &&
      originalValue <= 2147483647 &&
      originalValue === convertedValue
    );
  }

  private attemptDateConversion(value: any): number | null {
    if (this.isNullOrEmpty(value)) {
      return null;
    }

    // If it's already a number, try to normalize it
    if (typeof value === "number") {
      if (value > 0) {
        const normalized = normalizeTimestamp(value);
        if (normalized > 0 && normalized <= 2147483647) {
          return normalized;
        }
      }
      return null;
    }

    // If it's a string, try various parsing strategies
    if (typeof value === "string") {
      return this.parseStringDate(value);
    }

    return null;
  }

  private parseStringDate(value: string): number | null {
    const trimmedValue = value.trim();

    // First, try to parse as numeric timestamp
    const numericValue = parseFloat(trimmedValue);
    if (!isNaN(numericValue) && isFinite(numericValue) && numericValue > 0) {
      if (numericValue >= 946684800 && numericValue <= 2147483647) {
        return Math.floor(numericValue); // Timestamp in seconds
      } else if (
        numericValue >= 946684800000 &&
        numericValue <= 2147483647000
      ) {
        return Math.floor(numericValue / 1000); // Timestamp in milliseconds
      }
    }

    // Try various date format parsing
    const formats = [
      "YYYY-MM-DD",
      "YYYY-MM-DD HH:mm:ss",
      "MM/DD/YYYY",
      "DD/MM/YYYY",
      "YYYY/MM/DD",
    ];

    for (const format of formats) {
      try {
        const timestamp = dateStringToUnixTimestamp(value, format);
        if (timestamp > 0 && timestamp <= 2147483647) {
          return timestamp;
        }
      } catch {
        continue;
      }
    }

    // Try ISO format parsing as fallback
    try {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return Math.floor(date.getTime() / 1000);
      }
    } catch {
      // Ignore parsing error
    }

    return null;
  }

  private logAnalysisResults(): void {
    this.logger.section("Analysis Complete");
    this.logger.logRaw(`📊 Total records analyzed: ${this.analysis.processedRecords}`);
    this.logger.logRaw(
      `📝 Field "${this.options.fieldName}" found: ${this.analysis.fieldFound}`
    );
    this.logger.logRaw(`❌ Field empty/null/undefined: ${this.analysis.fieldEmpty}`);
    this.logger.logRaw(
      `✅ Already valid timestamps: ${this.analysis.fieldValidTimestamps}`
    );
    this.logger.logRaw(
      `🔄 Convertible dates found: ${this.analysis.fieldConvertibleDates}`
    );
    this.logger.logRaw(
      `⚠️  Invalid/unconvertible values: ${this.analysis.fieldInvalidDates}`
    );
    this.logger.logRaw(`📦 Batches processed: ${this.analysis.batchesProcessed}`);
    this.logger.logRaw("");
  }

  private async applyFixes(): Promise<number> {
    if (this.options.dryRun) {
      this.logDryRunResults();
      return 0;
    }

    this.logger.info("🔄 Updating records with normalized timestamps...");

    await this.batchProcessor.processItems(
      this.recordsToFix,
      async (batch, batchNumber) => {
        const batchRecords = batch.map((item) => ({
          ...item.record,
          [this.options.fieldName]: item.convertedValue,
        }));

        await this.saveRecords(batchRecords);
        this.logger.info(
          `📤 Updated batch ${batchNumber} (${batch.length} records)`
        );
      }
    );

    const totalFixed = this.recordsToFix.length;
    this.logger.success(
      `Updated ${totalFixed} records with normalized timestamps`
    );
    return totalFixed;
  }

  private logDryRunResults(): void {
    this.logger.info("🔄 Records that would be updated:");

    const samplesToShow = Math.min(10, this.recordsToFix.length);

    for (let i = 0; i < samplesToShow; i++) {
      const item = this.recordsToFix[i];
      if (item) {
        this.logger.logRaw(
          `   ${item.record.objectID}: "${item.originalValue}" → ${item.convertedValue}`
        );
      }
    }

    if (this.recordsToFix.length > samplesToShow) {
      this.logger.logRaw(
        `   ... and ${this.recordsToFix.length - samplesToShow} more records`
      );
    }
  }

  protected override validateRecord(record: unknown): record is AlgoliaRecord {
    return ValidationService.validateBasicRecord(record);
  }

  protected override logResults(): void {
    const duration = (Date.now() - this.startTime) / 1000;

    this.logger.logRaw("");
    this.logger.logRaw(`⏱️  Processing time: ${duration.toFixed(2)}s`);

    if (this.options.dryRun && this.recordsToFix.length > 0) {
      this.logger.logRaw("");
      this.logger.logRaw("💡 This was a dry run. Use --execute to apply changes.");
    }

    if (this.analysis.errors.length > 0) {
      this.logger.logRaw("");
      this.logger.logRaw("❌ Errors encountered:");
      this.logger.logRaw(`   ${this.analysis.errors.length} issues found`);
      if (this.analysis.errors.length <= 5) {
        this.analysis.errors.forEach((error) => this.logger.logRaw(`   ${error}`));
      }
    }
  }
}

export async function normalizeDateField(
  options: NormalizeDateFieldOptions
): Promise<void> {
  const action = new NormalizeDateFieldAction(options);
  const result = await action.execute();

  if (!result.success) {
    process.exit(1);
  }
}
