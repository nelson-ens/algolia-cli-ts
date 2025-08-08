import { algoliasearch } from "algoliasearch";
import { promptUser } from "../utils/prompt";
import { AlgoliaRecord } from "../utils/types";

interface FixPublishedDateOptions {
  indexName?: string;
  resourceType: string;
  dryRun: boolean;
}

interface RecordToFix {
  record: AlgoliaRecord;
  originalDate: string;
}

interface PublishedDateAnalysis {
  totalRecords: number;
  stringDates: number;
  numericDates: number;
  nullUndefinedEmpty: number;
  invalidDates: number;
  recordsToFix: RecordToFix[];
  batchesProcessed: number;
  errors: string[];
}

function isValidDateString(value: string): boolean {
  const date = new Date(value);
  return !isNaN(date.getTime()) && value !== "";
}

function convertToTimestamp(value: string): number {
  return new Date(value).getTime();
}

export async function fixPublishedDate(
  options: FixPublishedDateOptions
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

  if (!options.resourceType) {
    console.error("❌ Resource type is required");
    process.exit(1);
  }

  console.log(
    `🔍 ${
      options.dryRun ? "DRY RUN" : "EXECUTING"
    } - Fix publishedDate for resourceType: ${options.resourceType}`
  );
  console.log(`📊 Index: ${indexName}`);
  console.log("");

  if (!options.dryRun) {
    const confirmation = await promptUser(
      `⚠️  This will convert string publishedDate values to timestamps for records with resourceType="${options.resourceType}" in index "${indexName}". This is a destructive operation that cannot be undone.\n` +
        `Are you sure you want to proceed? (yes/no): `
    );

    if (confirmation.toLowerCase() !== "yes") {
      console.log("❌ Operation cancelled by user.");
      process.exit(0);
    }
    console.log("");
  }

  const client = algoliasearch(appId, apiKey);

  const analysis: PublishedDateAnalysis = {
    totalRecords: 0,
    stringDates: 0,
    numericDates: 0,
    nullUndefinedEmpty: 0,
    invalidDates: 0,
    recordsToFix: [],
    batchesProcessed: 0,
    errors: [],
  };

  try {
    const startTime = Date.now();
    let cursor: string | undefined;
    const batchSize = 1000;

    // Phase 1: Analysis and collection of records to fix
    console.log("📈 Phase 1: Analyzing publishedDate fields...");
    console.log("");

    while (true) {
      console.log(`📦 Analyzing batch ${analysis.batchesProcessed + 1}...`);

      const response = await client.browse({
        indexName,
        browseParams: {
          hitsPerPage: batchSize,
          cursor,
          filters: `resourceType:"${options.resourceType}"`,
        },
      });

      for (const record of response.hits as unknown[]) {
        if (
          typeof record === "object" &&
          record !== null &&
          "objectID" in record &&
          "resourceType" in record &&
          typeof (record as { objectID: unknown }).objectID === "string" &&
          typeof (record as { resourceType: unknown }).resourceType === "string"
        ) {
          const algoliaRecord = record as AlgoliaRecord;
          analysis.totalRecords++;

          const publishedDate = algoliaRecord.publishedDate;

          if (
            publishedDate === null ||
            publishedDate === undefined ||
            publishedDate === ""
          ) {
            analysis.nullUndefinedEmpty++;
          } else if (typeof publishedDate === "string") {
            if (isValidDateString(publishedDate)) {
              analysis.stringDates++;
              // Store record with original date for potential conversion
              analysis.recordsToFix.push({
                record: algoliaRecord,
                originalDate: publishedDate,
              });
            } else {
              analysis.invalidDates++;
              analysis.errors.push(
                `Invalid date string in record ${algoliaRecord.objectID}: "${publishedDate}"`
              );
            }
          } else if (typeof publishedDate === "number") {
            analysis.numericDates++;
          } else {
            analysis.errors.push(
              `Unexpected publishedDate type in record ${
                algoliaRecord.objectID
              }: ${typeof publishedDate}`
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
    console.log(`📝 String dates found: ${analysis.stringDates}`);
    console.log(`🔢 Numeric dates found: ${analysis.numericDates}`);
    console.log(`❌ Null/undefined/empty: ${analysis.nullUndefinedEmpty}`);
    console.log(`⚠️  Invalid date strings: ${analysis.invalidDates}`);
    console.log(`📦 Batches processed: ${analysis.batchesProcessed}`);
    console.log("");

    // Phase 3: Apply fixes if not dry run and there are records to fix
    if (analysis.recordsToFix.length > 0) {
      if (options.dryRun) {
        console.log("🔄 Records that would be updated:");
        analysis.recordsToFix.slice(0, 10).forEach((item) => {
          const convertedTimestamp = convertToTimestamp(item.originalDate);
          console.log(
            `   ${item.record.objectID}: "${item.originalDate}" → ${convertedTimestamp}`
          );
        });
        if (analysis.recordsToFix.length > 10) {
          console.log(
            `   ... and ${analysis.recordsToFix.length - 10} more records`
          );
        }
      } else {
        console.log("🔄 Updating records with converted timestamps...");

        // Update records in batches
        const updateBatchSize = 1000;
        let updateBatchCount = 0;

        for (
          let i = 0;
          i < analysis.recordsToFix.length;
          i += updateBatchSize
        ) {
          const batchItems = analysis.recordsToFix.slice(i, i + updateBatchSize);
          updateBatchCount++;

          console.log(
            `📤 Updating batch ${updateBatchCount} (${batchItems.length} records)...`
          );

          // Convert the records with updated timestamps for this batch
          const batchRecords = batchItems.map(item => ({
            ...item.record,
            publishedDate: convertToTimestamp(item.originalDate),
          }));

          await client.saveObjects({
            indexName,
            objects: batchRecords,
          });
        }

        console.log(
          `✅ Updated ${analysis.recordsToFix.length} records with converted timestamps`
        );
      }
    } else {
      console.log("✅ No string dates found that need conversion");
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
