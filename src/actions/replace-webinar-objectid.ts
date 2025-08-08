import { algoliasearch } from "algoliasearch";
import { promptUser } from "../utils/prompt";
import {
  AlgoliaRecord,
  ProcessingMetrics,
  validateRecordWhereResourceTypeIsNotEmpty,
} from "../utils/types";
import { v5 as uuidv5 } from "uuid";

interface ReplaceWebinarObjectIdOptions {
  indexName?: string;
  dryRun: boolean;
}

const NAMESPACE = "6ba7b811-9dad-11d1-80b4-00c04fd430c8"; // Use a fixed namespace UUID
// Generate a UUID based on a given path using a fixed namespace
const generateUid = (s: string) => uuidv5(s, NAMESPACE);

export async function replaceWebinarObjectIds(
  options: ReplaceWebinarObjectIdOptions
): Promise<void> {
  const appId = process.env.ALGOLIA_APP_ID;
  const apiKey = process.env.ALGOLIA_API_KEY;
  const indexName = options.indexName || process.env.ALGOLIA_INDEX_NAME;
  const schemaPath = process.env.WEBINAR_SCHEMA_PATH;
  const resourceType = process.env.WEBINAR_RESOURCE_TYPE;

  if (!appId || !apiKey || !indexName) {
    console.error("❌ Missing required environment variables:");
    console.error("   ALGOLIA_APP_ID, ALGOLIA_API_KEY, ALGOLIA_INDEX_NAME");
    console.error("   Or provide --index parameter");
    process.exit(1);
  }

  if (!schemaPath || !resourceType) {
    console.error(
      "❌ Missing required environment variables for webinar demand:"
    );
    console.error("   WEBINAR_SCHEMA_PATH, WEBINAR_RESOURCE_TYPE");
    process.exit(1);
  }

  console.log(
    `🔍 ${
      options.dryRun ? "DRY RUN" : "EXECUTING"
    } - Replace webinar demand objectID action`
  );
  console.log(`📊 Index: ${indexName}`);
  console.log(`🎯 Target resourceType: ${resourceType}`);
  console.log("");

  if (!options.dryRun) {
    const confirmation = await promptUser(
      `⚠️  This will modify objectID values for records with resourceType="${resourceType}" in index "${indexName}". This is a destructive operation that cannot be undone.\n` +
        `Are you sure you want to proceed? (yes/no): `
    );

    if (confirmation.toLowerCase() !== "yes") {
      console.log("❌ Operation cancelled by user.");
      process.exit(0);
    }
    console.log("");
  }

  const client = algoliasearch(appId, apiKey);

  const metrics: ProcessingMetrics = {
    totalRecords: 0,
    processedRecords: 0,
    recordsWithChanges: 0,
    recordsWithoutTitle: 0,
    batchesProcessed: 0,
    errors: [],
  };

  try {
    const startTime = Date.now();
    let cursor: string | undefined;
    const batchSize = 1000;

    while (true) {
      console.log(`📦 Processing batch ${metrics.batchesProcessed + 1}...`);

      const response = await client.browse({
        indexName,
        browseParams: {
          hitsPerPage: batchSize,
          cursor,
          filters: `resourceType:"${resourceType}"`,
        },
      });

      const recordsToUpdate: AlgoliaRecord[] = [];
      const oldObjectIdsToDelete: string[] = [];

      for (const record of response.hits as unknown[]) {
        if (!validateRecordWhereResourceTypeIsNotEmpty(record)) {
          metrics.errors.push(
            `Invalid record structure: ${JSON.stringify(record)}`
          );
          continue;
        }
        metrics.totalRecords++;
        metrics.processedRecords++;

        if (!record.title || typeof record.title !== "string") {
          metrics.recordsWithoutTitle++;
          console.log(`⚠️  Record ${record.objectID} has no valid title field`);
          continue;
        }

        const newObjectId = generateUid(
          `${schemaPath}${record.title}${resourceType}`
        );

        if (record.objectID !== newObjectId) {
          metrics.recordsWithChanges++;

          if (options.dryRun) {
            console.log(
              `🔄 Would change: "${record.objectID}" → "${newObjectId}"`
            );
          } else {
            recordsToUpdate.push({
              ...record,
              objectID: newObjectId,
            });
            oldObjectIdsToDelete.push(record.objectID);
          }
        }
      }

      if (!options.dryRun && recordsToUpdate.length > 0) {
        await client.saveObjects({
          indexName,
          objects: recordsToUpdate,
        });

        await client.deleteObjects({
          indexName,
          objectIDs: oldObjectIdsToDelete,
        });
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
    console.log("📈 Processing Complete!");
    console.log("━".repeat(50));
    console.log(`📊 Total records processed: ${metrics.processedRecords}`);
    console.log(`🔄 Records that would change: ${metrics.recordsWithChanges}`);
    console.log(`⚠️  Records without title: ${metrics.recordsWithoutTitle}`);
    console.log(`📦 Batches processed: ${metrics.batchesProcessed}`);
    console.log(`⏱️  Processing time: ${duration.toFixed(2)}s`);

    if (options.dryRun) {
      console.log("");
      console.log("💡 This was a dry run. Use --execute to apply changes.");
    } else {
      console.log("");
      console.log("✅ Changes have been applied to the index.");
    }

    if (metrics.errors.length > 0) {
      console.log("");
      console.log("❌ Errors encountered:");
      metrics.errors.forEach((error) => console.log(`   ${error}`));
    }
  } catch (error) {
    console.error(
      "❌ Fatal error:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}
