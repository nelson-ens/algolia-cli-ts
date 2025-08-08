import { algoliasearch } from "algoliasearch";
import {
  AlgoliaRecord,
  ProcessingMetrics,
  validateRecordWhereResourceTypeIsEmpty,
} from "../utils/types";
import { generateUid } from "../utils/uuidUtils";

interface FindMatchingObjectIdOptions {
  indexName?: string;
}

export async function findMatchingObjectId(
  options: FindMatchingObjectIdOptions
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

  console.log("🔍 Find records with matching objectID action");
  console.log(`📊 Index: ${indexName}`);
  console.log("");

  const client = algoliasearch(appId, apiKey);

  const metrics: ProcessingMetrics = {
    totalRecords: 0,
    processedRecords: 0,
    recordsWithChanges: 0,
    recordsWithoutTitle: 0,
    batchesProcessed: 0,
    errors: [],
  };

  const matchingRecords: AlgoliaRecord[] = [];

  try {
    const startTime = Date.now();
    let cursor: string | undefined;
    const batchSize = 1000;

    while (true) {
      console.log(`📦 Processing batch ${metrics.batchesProcessed + 1}...`);

      // Only get records with resourceType is not null
      const response = await client.browse({
        indexName,
        browseParams: {
          hitsPerPage: batchSize,
          cursor,
        },
      });

      for (const record of response.hits as unknown[]) {
        if (!validateRecordWhereResourceTypeIsEmpty(record)) {
          metrics.errors.push(
            `Invalid record structure: ${JSON.stringify(record)}`
          );
          continue;
        }
        metrics.totalRecords++;
        metrics.processedRecords++;

        if (!record.title || typeof record.title !== "string") {
          metrics.recordsWithoutTitle++;
          continue;
        }

        const expectedObjectId = generateUid(record.title);

        if (record.objectID === expectedObjectId) {
          matchingRecords.push(record);
          console.log(
            `✅ Match found: ${record.objectID} (title: "${record.title}", slug: "${record.slug}", resourceType: "${record.resourceType}")`
          );
        }
      }

      metrics.batchesProcessed++;
      cursor = response.cursor;

      if (!cursor) {
        break;
      }
    }

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    console.log("");
    console.log("📈 Search Complete!");
    console.log("━".repeat(50));
    console.log(`📊 Total records processed: ${metrics.processedRecords}`);
    console.log(`✅ Matching records found: ${matchingRecords.length}`);
    console.log(`⚠️  Records without title: ${metrics.recordsWithoutTitle}`);
    console.log(`📦 Batches processed: ${metrics.batchesProcessed}`);
    console.log(`⏱️  Processing time: ${duration.toFixed(2)}s`);

    if (matchingRecords.length > 0) {
      console.log("");
      console.log("🎯 Matching Records:");
      matchingRecords.forEach((record, index) => {
        console.log(`   ${index + 1}. ${record.objectID} - "${record.title}"`);
      });
    }

    if (metrics.errors.length > 0) {
      console.log("");
      console.log("❌ Errors encountered:");
      // metrics.errors.forEach((error) => console.log(`   ${error}`));
      console.log(`   ${metrics.errors.length} invalid records encountered`);
    }
  } catch (error) {
    console.error(
      "❌ Fatal error:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}
