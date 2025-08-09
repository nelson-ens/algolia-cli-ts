import { algoliasearch } from "algoliasearch";
import { promptUser } from "../utils/prompt";
import { AlgoliaRecord } from "../utils/types";
import {
  dateStringToUnixTimestamp,
  normalizeTimestamp,
} from "../utils/dateUtils";

interface NormalizeDateFieldOptions {
  indexName?: string;
  fieldName: string;
  dryRun: boolean;
}

interface RecordToFix {
  record: AlgoliaRecord;
  originalValue: any;
  convertedValue: number;
}

interface DateFieldAnalysis {
  totalRecords: number;
  fieldFound: number;
  fieldEmpty: number;
  fieldValidTimestamps: number;
  fieldConvertibleDates: number;
  fieldInvalidDates: number;
  recordsToFix: RecordToFix[];
  batchesProcessed: number;
  errors: string[];
}

function attemptDateConversion(value: any): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  // If it's already a number, try to normalize it
  if (typeof value === "number") {
    // Check if it's a valid timestamp (either in seconds or milliseconds)
    if (value > 0) {
      const normalized = normalizeTimestamp(value);
      // More lenient validation - check if it's a reasonable timestamp
      if (normalized > 0 && normalized <= 2147483647) {
        return normalized;
      }
    }
    return null;
  }

  // If it's a string, first try to parse as numeric timestamp
  if (typeof value === "string") {
    // First, try to parse as a numeric timestamp (string representation)
    const trimmedValue = value.trim();
    const numericValue = parseFloat(trimmedValue);

    if (!isNaN(numericValue) && isFinite(numericValue) && numericValue > 0) {
      // Check if it looks like a timestamp (reasonable range)
      if (numericValue >= 946684800 && numericValue <= 2147483647) {
        // Looks like a timestamp in seconds
        return Math.floor(numericValue);
      } else if (
        numericValue >= 946684800000 &&
        numericValue <= 2147483647000
      ) {
        // Looks like a timestamp in milliseconds
        return Math.floor(numericValue / 1000);
      }
    }

    // If not a numeric timestamp, try to parse as date string
    try {
      // Try various common formats
      const formats = [
        "YYYY-MM-DD",
        "YYYY-MM-DD HH:mm:ss",
        "MM/DD/YYYY",
        "DD/MM/YYYY",
        "YYYY/MM/DD",
        "ISO",
      ];

      for (const format of formats) {
        try {
          if (format === "ISO") {
            // For ISO format, try direct parsing
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
              return Math.floor(date.getTime() / 1000);
            }
          } else {
            const timestamp = dateStringToUnixTimestamp(value, format);
            // More lenient validation for date strings
            if (timestamp > 0 && timestamp <= 2147483647) {
              return timestamp;
            }
          }
        } catch {
          continue; // Try next format
        }
      }
    } catch {
      // If all parsing fails, return null
    }
  }

  return null;
}

export async function normalizeDateField(
  options: NormalizeDateFieldOptions
): Promise<void> {
  const appId = process.env.ALGOLIA_APP_ID;
  const apiKey = process.env.ALGOLIA_API_KEY;
  const indexName = options.indexName || process.env.ALGOLIA_INDEX_NAME;

  if (!appId || !apiKey || !indexName) {
    console.error("❌ Missing required environment variables:");
    console.error("   ALGOLIA_APP_ID, ALGOLIA_API_KEY, ALGOLIA_INDEX_NAME");
    console.error("   Or provide --index parameter");
    process.exit(1);
  }

  if (!options.fieldName) {
    console.error("❌ Field name is required");
    process.exit(1);
  }

  console.log(
    `🔍 ${options.dryRun ? "DRY RUN" : "EXECUTING"} - Normalize date field: ${
      options.fieldName
    }`
  );
  console.log(`📊 Index: ${indexName}`);
  console.log("");

  if (!options.dryRun) {
    const confirmation = await promptUser(
      `⚠️  This will normalize date values in field "${options.fieldName}" to Unix timestamps (seconds) in index "${indexName}". This is a destructive operation that cannot be undone.\n` +
        `Are you sure you want to proceed? (yes/no): `
    );

    if (confirmation.toLowerCase() !== "yes") {
      console.log("❌ Operation cancelled by user.");
      process.exit(0);
    }
    console.log("");
  }

  const client = algoliasearch(appId, apiKey);

  const analysis: DateFieldAnalysis = {
    totalRecords: 0,
    fieldFound: 0,
    fieldEmpty: 0,
    fieldValidTimestamps: 0,
    fieldConvertibleDates: 0,
    fieldInvalidDates: 0,
    recordsToFix: [],
    batchesProcessed: 0,
    errors: [],
  };

  try {
    const startTime = Date.now();
    let cursor: string | undefined;
    const batchSize = 1000;

    // Phase 1: Analysis and collection of records to fix
    console.log(`📈 Phase 1: Analyzing ${options.fieldName} fields...`);
    console.log("");

    while (true) {
      console.log(`📦 Analyzing batch ${analysis.batchesProcessed + 1}...`);

      const response = await client.browse({
        indexName,
        browseParams: {
          hitsPerPage: batchSize,
          cursor,
        },
      });

      for (const record of response.hits as unknown[]) {
        if (
          typeof record === "object" &&
          record !== null &&
          "objectID" in record &&
          typeof (record as { objectID: unknown }).objectID === "string"
        ) {
          const algoliaRecord = record as AlgoliaRecord;
          analysis.totalRecords++;

          const fieldValue = (algoliaRecord as any)[options.fieldName];

          if (
            fieldValue === null ||
            fieldValue === undefined ||
            fieldValue === ""
          ) {
            analysis.fieldEmpty++;
            continue; // Skip empty fields as requested
          }

          analysis.fieldFound++;

          // Try to convert the field value
          const convertedValue = attemptDateConversion(fieldValue);

          if (convertedValue !== null) {
            // Check if this is already a normalized timestamp that doesn't need conversion
            if (
              typeof fieldValue === "number" &&
              fieldValue > 0 &&
              fieldValue <= 2147483647 &&
              fieldValue === convertedValue
            ) {
              // Already a valid timestamp in seconds, no conversion needed
              analysis.fieldValidTimestamps++;
            } else {
              // This is a convertible date/timestamp that needs normalization
              analysis.fieldConvertibleDates++;
              analysis.recordsToFix.push({
                record: algoliaRecord,
                originalValue: fieldValue,
                convertedValue: convertedValue,
              });
            }
          } else {
            analysis.fieldInvalidDates++;
            analysis.errors.push(
              `Cannot convert ${options.fieldName} in record ${algoliaRecord.objectID}: "${fieldValue}"`
            );
          }
        } else {
          analysis.errors.push(
            `Invalid record structure: ${JSON.stringify(record)}`
          );
        }
      }

      analysis.batchesProcessed++;
      cursor = response.cursor;

      if (!cursor) {
        break;
      }
    }

    // Phase 2: Report analysis results
    console.log("");
    console.log("📊 Analysis Complete!");
    console.log("━".repeat(50));
    console.log(`📊 Total records analyzed: ${analysis.totalRecords}`);
    console.log(
      `📝 Field "${options.fieldName}" found: ${analysis.fieldFound}`
    );
    console.log(`❌ Field empty/null/undefined: ${analysis.fieldEmpty}`);
    console.log(
      `✅ Already valid timestamps: ${analysis.fieldValidTimestamps}`
    );
    console.log(
      `🔄 Convertible dates found: ${analysis.fieldConvertibleDates}`
    );
    console.log(
      `⚠️  Invalid/unconvertible values: ${analysis.fieldInvalidDates}`
    );
    console.log(`📦 Batches processed: ${analysis.batchesProcessed}`);
    console.log("");

    // Phase 3: Apply fixes if not dry run and there are records to fix
    if (analysis.recordsToFix.length > 0) {
      if (options.dryRun) {
        console.log("🔄 Records that would be updated:");
        analysis.recordsToFix.slice(0, 10).forEach((item) => {
          console.log(
            `   ${item.record.objectID}: "${item.originalValue}" → ${item.convertedValue}`
          );
        });
        if (analysis.recordsToFix.length > 10) {
          console.log(
            `   ... and ${analysis.recordsToFix.length - 10} more records`
          );
        }
      } else {
        console.log("🔄 Updating records with normalized timestamps...");

        // Update records in batches
        const updateBatchSize = 1000;
        let updateBatchCount = 0;

        for (
          let i = 0;
          i < analysis.recordsToFix.length;
          i += updateBatchSize
        ) {
          const batchItems = analysis.recordsToFix.slice(
            i,
            i + updateBatchSize
          );
          updateBatchCount++;

          console.log(
            `📤 Updating batch ${updateBatchCount} (${batchItems.length} records)...`
          );

          // Convert the records with updated timestamps for this batch
          const batchRecords = batchItems.map((item) => ({
            ...item.record,
            [options.fieldName]: item.convertedValue,
          }));

          await client.saveObjects({
            indexName,
            objects: batchRecords,
          });
        }

        console.log(
          `✅ Updated ${analysis.recordsToFix.length} records with normalized timestamps`
        );
      }
    } else {
      console.log("✅ No dates found that need normalization");
    }

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    console.log("");
    console.log(`⏱️  Processing time: ${duration.toFixed(2)}s`);

    if (options.dryRun && analysis.recordsToFix.length > 0) {
      console.log("");
      console.log("💡 This was a dry run. Use --execute to apply changes.");
    }

    if (analysis.errors.length > 0) {
      console.log("");
      console.log("❌ Errors encountered:");
      console.log(`   ${analysis.errors.length} issues found`);
      if (analysis.errors.length <= 5) {
        analysis.errors.forEach((error) => console.log(`   ${error}`));
      }
    }
  } catch (error) {
    console.error(
      "❌ Fatal error:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}
