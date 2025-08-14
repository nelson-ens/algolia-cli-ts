import { BaseAlgoliaAction, ActionOptions } from "../core/BaseAlgoliaAction";
import { ValidationService } from "../core/ValidationService";
import { Logger } from "../core/Logger";
import { BatchProcessor } from "../core/BatchProcessor";
import { AlgoliaRecord } from "../utils/types";
import {
  dateStringToUnixTimestamp,
  normalizeTimestamp,
} from "../utils/dateUtils";

interface SanitizeDateValuesOptions extends ActionOptions {
  dryRun: boolean;
}

interface FieldSanitization {
  fieldPath: string;
  originalValue: any;
  convertedValue: number;
}

interface RecordToSanitize {
  record: AlgoliaRecord;
  sanitizations: FieldSanitization[];
}

interface SanitizationMetrics {
  totalRecords: number;
  processedRecords: number;
  recordsWithDates: number;
  totalFieldsFound: number;
  totalFieldsSanitized: number;
  batchesProcessed: number;
  errors: string[];
}

interface SanitizeDateValuesResult {
  metrics: SanitizationMetrics;
  recordsSanitized: number;
  invalidValues: string[];
}

export class SanitizeDateValuesAction extends BaseAlgoliaAction<
  SanitizeDateValuesOptions,
  SanitizeDateValuesResult
> {
  protected override logger: Logger;
  private batchProcessor: BatchProcessor<RecordToSanitize, void>;
  private sanitizationMetrics: SanitizationMetrics;
  private recordsToSanitize: RecordToSanitize[] = [];

  constructor(options: SanitizeDateValuesOptions) {
    super(options);
    this.logger = new Logger();
    this.batchProcessor = new BatchProcessor({
      batchSize: options.batchSize || 1000,
      onBatchStart: (batchNumber) => {
        const estimatedTotalBatches = Math.ceil(
          this.recordsToSanitize.length / (options.batchSize || 1000)
        );
        this.logger.progress(
          `Sanitizing batch`,
          batchNumber,
          estimatedTotalBatches
        );
      },
    });
    this.sanitizationMetrics = this.initializeSanitizationMetrics();
  }

  protected async processRecords(): Promise<SanitizeDateValuesResult> {
    this.logActionStart(
      "Sanitize Date Values",
      "Identify and normalize date values across all record fields"
    );

    await this.confirmDestructiveAction(
      `This will sanitize all date-like values across all fields in index "${this.config.indexName}" to Unix timestamps (seconds).`
    );

    // Phase 1: Analysis
    await this.analyzeAllRecords();
    this.logAnalysisResults();

    // Phase 2: Apply sanitizations if records need fixing
    let recordsSanitized = 0;
    if (this.recordsToSanitize.length > 0) {
      recordsSanitized = await this.applySanitizations();
    } else {
      this.logger.success("No date values found that need sanitization");
    }

    return {
      metrics: this.sanitizationMetrics,
      recordsSanitized,
      invalidValues: this.sanitizationMetrics.errors,
    };
  }

  private initializeSanitizationMetrics(): SanitizationMetrics {
    return {
      totalRecords: 0,
      processedRecords: 0,
      recordsWithDates: 0,
      totalFieldsFound: 0,
      totalFieldsSanitized: 0,
      batchesProcessed: 0,
      errors: [],
    };
  }

  private async analyzeAllRecords(): Promise<void> {
    this.logger.section("Phase 1: Analyzing all records for date-like values");

    for await (const records of this.browseRecords()) {
      for (const record of records) {
        this.sanitizationMetrics.processedRecords++;
        this.analyzeRecord(record);
      }
      this.sanitizationMetrics.batchesProcessed++;
    }

    this.sanitizationMetrics.totalRecords =
      this.sanitizationMetrics.processedRecords;
  }

  private analyzeRecord(record: AlgoliaRecord): void {
    if (!ValidationService.validateBasicRecord(record)) {
      this.sanitizationMetrics.errors.push(
        `Invalid record structure: ${JSON.stringify(record)}`
      );
      return;
    }

    const sanitizations = this.findDateFieldsInObject(record, "");

    if (sanitizations.length > 0) {
      this.sanitizationMetrics.recordsWithDates++;
      this.sanitizationMetrics.totalFieldsSanitized += sanitizations.length;
      this.recordsToSanitize.push({
        record,
        sanitizations,
      });
    }
  }

  private findDateFieldsInObject(
    obj: any,
    parentPath: string
  ): FieldSanitization[] {
    const sanitizations: FieldSanitization[] = [];

    for (const [key, value] of Object.entries(obj)) {
      // Skip objectID and other system fields
      if (
        key === "objectID" ||
        key === "_highlightResult" ||
        key === "_snippetResult"
      ) {
        continue;
      }

      const fieldPath = parentPath ? `${parentPath}.${key}` : key;
      this.sanitizationMetrics.totalFieldsFound++;

      // Handle nested objects recursively
      if (value && typeof value === "object" && !Array.isArray(value)) {
        // const nestedSanitizations = this.findDateFieldsInObject(value, fieldPath);
        // sanitizations.push(...nestedSanitizations);
        continue;
      }

      // Handle arrays
      if (Array.isArray(value)) {
        // value.forEach((item, index) => {
        //   const arrayPath = `${fieldPath}[${index}]`;
        //   if (item && typeof item === "object") {
        //     const nestedSanitizations = this.findDateFieldsInObject(item, arrayPath);
        //     sanitizations.push(...nestedSanitizations);
        //   } else {
        //     const convertedValue = this.attemptDateConversion(item);
        //     if (convertedValue !== null && !this.isAlreadyNormalizedTimestamp(item, convertedValue)) {
        //       sanitizations.push({
        //         fieldPath: arrayPath,
        //         originalValue: item,
        //         convertedValue,
        //       });
        //     }
        //   }
        // });
        continue;
      }

      // Check if this field contains a date value
      const convertedValue = this.attemptDateConversion(value);
      if (
        convertedValue !== null &&
        !this.isAlreadyNormalizedTimestamp(value, convertedValue)
      ) {
        sanitizations.push({
          fieldPath,
          originalValue: value,
          convertedValue,
        });
      }
    }

    return sanitizations;
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
      // Explicitly check for Infinity and NaN
      if (!isFinite(value) || value <= 0) {
        return null;
      }
      const normalized = normalizeTimestamp(value);
      if (isFinite(normalized) && normalized > 0 && normalized <= 2147483647) {
        return normalized;
      }
      return null;
    }

    // If it's a string, try various parsing strategies
    if (typeof value === "string") {
      const result = this.parseStringDate(value);
      // Additional validation to ensure no Infinity values pass through
      return result !== null && isFinite(result) ? result : null;
    }

    return null;
  }

  private isNullOrEmpty(value: any): boolean {
    return value === null || value === undefined || value === "";
  }

  private parseStringDate(value: string): number | null {
    const trimmedValue = value.trim();

    // Skip very short strings that are unlikely to be dates
    if (trimmedValue.length < 4) {
      return null;
    }

    // First, try to parse as numeric timestamp
    const numericValue = parseFloat(trimmedValue);
    if (!isNaN(numericValue) && isFinite(numericValue) && numericValue > 0) {
      // Microsecond timestamp (16+ digits, >= 946684800000000)
      if (numericValue >= 946684800000000 && numericValue <= 2147483647000000) {
        return Math.floor(numericValue / 1000000); // Convert microseconds to seconds
      }
      // Millisecond timestamp (10-13 digits)
      else if (numericValue >= 946684800000 && numericValue <= 2147483647000) {
        return Math.floor(numericValue / 1000); // Convert milliseconds to seconds
      }
      // Second timestamp (9-10 digits)
      else if (numericValue >= 946684800 && numericValue <= 2147483647) {
        return Math.floor(numericValue); // Already in seconds
      }
    }

    // Handle YYYY-MM-DD format specifically first (most common)
    const isoDateMatch = trimmedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoDateMatch) {
      const [, year, month, day] = isoDateMatch;
      const date = new Date(
        parseInt(year!),
        parseInt(month!) - 1,
        parseInt(day!)
      );
      if (!isNaN(date.getTime())) {
        return Math.floor(date.getTime() / 1000);
      }
    }

    // Check for other common date patterns
    const datePatterns = [
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, // ISO datetime
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/, // YYYY-MM-DD HH:mm:ss
      /^\d{1,2}\/\d{1,2}\/\d{4}/, // MM/DD/YYYY or DD/MM/YYYY
      /^\d{4}\/\d{1,2}\/\d{1,2}/, // YYYY/MM/DD
      /^\d{1,2}-\d{1,2}-\d{4}/, // MM-DD-YYYY or DD-MM-YYYY
    ];

    const hasDatePattern = datePatterns.some((pattern) =>
      pattern.test(trimmedValue)
    );
    if (!hasDatePattern) {
      return null;
    }

    // Try various date format parsing
    const formats = [
      "YYYY-MM-DD HH:mm:ss",
      "MM/DD/YYYY",
      "DD/MM/YYYY",
      "YYYY/MM/DD",
      "YYYY-MM-DD HH:mm",
      "MM-DD-YYYY",
      "DD-MM-YYYY",
    ];

    for (const format of formats) {
      try {
        const timestamp = dateStringToUnixTimestamp(trimmedValue, format);
        if (timestamp > 0 && timestamp <= 2147483647) {
          return timestamp;
        }
      } catch {
        continue;
      }
    }

    // Try ISO format parsing as fallback
    try {
      const date = new Date(trimmedValue);
      if (!isNaN(date.getTime()) && date.getTime() > 0) {
        return Math.floor(date.getTime() / 1000);
      }
    } catch {
      // Ignore parsing error
    }

    return null;
  }

  private logAnalysisResults(): void {
    this.logger.section("Analysis Complete");
    this.logger.logRaw(
      `📊 Total records analyzed: ${this.sanitizationMetrics.processedRecords}`
    );
    this.logger.logRaw(
      `🔍 Total fields examined: ${this.sanitizationMetrics.totalFieldsFound}`
    );
    this.logger.logRaw(
      `📅 Records with date values: ${this.sanitizationMetrics.recordsWithDates}`
    );
    this.logger.logRaw(
      `🔄 Total fields to sanitize: ${this.sanitizationMetrics.totalFieldsSanitized}`
    );
    this.logger.logRaw(
      `📦 Batches processed: ${this.sanitizationMetrics.batchesProcessed}`
    );
    this.logger.logRaw("");

    if (this.sanitizationMetrics.errors.length > 0) {
      this.logger.logRaw(
        `⚠️  Errors encountered: ${this.sanitizationMetrics.errors.length}`
      );
      this.logger.logRaw("");
    }
  }

  private async applySanitizations(): Promise<number> {
    if (this.options.dryRun) {
      this.logDryRunResults();
      return 0;
    }

    this.logger.info("🔄 Updating records with sanitized date values...");

    await this.batchProcessor.processItems(
      this.recordsToSanitize,
      async (batch, batchNumber) => {
        const batchRecords = batch.map((item) => {
          const updatedRecord = { ...item.record };

          // Apply all sanitizations to this record
          for (const sanitization of item.sanitizations) {
            // Final validation before applying
            if (
              !isFinite(sanitization.convertedValue) ||
              sanitization.convertedValue <= 0 ||
              sanitization.convertedValue > 2147483647
            ) {
              throw new Error(
                `Invalid timestamp value ${sanitization.convertedValue} for field ${sanitization.fieldPath} in record ${item.record.objectID}`
              );
            }

            this.setNestedValue(
              updatedRecord,
              sanitization.fieldPath,
              sanitization.convertedValue
            );
          }

          return updatedRecord;
        });

        await this.saveRecords(batchRecords);
        this.logger.info(
          `📤 Updated batch ${batchNumber} (${batch.length} records)`
        );
      }
    );

    const totalSanitized = this.recordsToSanitize.length;
    this.logger.success(
      `Sanitized ${totalSanitized} records with normalized date timestamps`
    );
    return totalSanitized;
  }

  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split(".");
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i]!;

      // Handle array notation like "field[0]"
      const arrayMatch = key.match(/^(.+)\[(\d+)\]$/);
      if (arrayMatch) {
        const [, arrayKey, indexStr] = arrayMatch;
        const index = parseInt(indexStr!);
        current = current[arrayKey!][index];
      } else {
        current = current[key];
      }
    }

    const finalKey = keys[keys.length - 1]!;
    const arrayMatch = finalKey.match(/^(.+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, arrayKey, indexStr] = arrayMatch;
      const index = parseInt(indexStr!);
      current[arrayKey!][index] = value;
    } else {
      current[finalKey] = value;
    }
  }

  private logDryRunResults(): void {
    this.logger.info("🔄 Records that would be sanitized:");

    const samplesToShow = Math.min(2000, this.recordsToSanitize.length);

    for (let i = 0; i < samplesToShow; i++) {
      const item = this.recordsToSanitize[i];
      if (item) {
        this.logger.logRaw(`   Record ${item.record.objectID}:`);
        for (const sanitization of item.sanitizations) {
          this.logger.logRaw(
            `     ${sanitization.fieldPath}: "${sanitization.originalValue}" → ${sanitization.convertedValue}`
          );
        }
        this.logger.logRaw("");
      }
    }

    if (this.recordsToSanitize.length > samplesToShow) {
      this.logger.logRaw(
        `   ... and ${
          this.recordsToSanitize.length - samplesToShow
        } more records`
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

    if (this.options.dryRun && this.recordsToSanitize.length > 0) {
      this.logger.logRaw("");
      this.logger.logRaw(
        "💡 This was a dry run. Use --execute to apply changes."
      );
    }

    if (this.sanitizationMetrics.errors.length > 0) {
      this.logger.logRaw("");
      this.logger.logRaw("❌ Errors encountered:");
      this.logger.logRaw(
        `   ${this.sanitizationMetrics.errors.length} issues found`
      );
      this.sanitizationMetrics.errors.forEach((error) =>
        this.logger.logRaw(`   ${error}`)
      );
    }
  }
}

export async function sanitizeDateValues(
  options: SanitizeDateValuesOptions
): Promise<void> {
  const action = new SanitizeDateValuesAction(options);
  const result = await action.execute();

  if (!result.success) {
    process.exit(1);
  }
}
