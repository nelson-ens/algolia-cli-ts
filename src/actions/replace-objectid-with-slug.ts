import { algoliasearch } from "algoliasearch";
import { promptUser } from "../utils/prompt";
import {
  AlgoliaRecord,
  ProcessingMetrics,
  validateRecordWhereResourceTypeIsNotEmpty,
} from "../utils/types";
import { generateUid } from "../utils/uuidUtils";

interface ReplaceObjectIdWithSlugOptions {
  indexName?: string;
  dryRun: boolean;
}

export async function replaceObjectIdWithSlug(
  options: ReplaceObjectIdWithSlugOptions
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

  console.log(
    `🔍 ${
      options.dryRun ? "DRY RUN" : "EXECUTING"
    } - Replace objectID with slug-based UUID`
  );
  console.log(`📊 Index: ${indexName}`);
  console.log(
    "🎯 Target: Records where objectID = generateUid(title) AND slug is defined"
  );
  console.log("");

  if (!options.dryRun) {
    const confirmation = await promptUser(
      `⚠️  This will replace objectID with generateUid(slug) for matching records in index "${indexName}".\n` +
        `This is a destructive operation that cannot be undone.\n` +
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

  let recordsWithoutSlug = 0;
  let recordsNotMatchingCriteria = 0;

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

        // Check if record has title
        if (!record.title || typeof record.title !== "string") {
          metrics.recordsWithoutTitle++;
          continue;
        }

        // Check if record has slug
        if (!record.slug || typeof record.slug !== "string") {
          recordsWithoutSlug++;
          continue;
        }

        // Check if current objectID matches generateUid(title)
        const expectedTitleBasedObjectId = generateUid(record.title);
        if (record.objectID !== expectedTitleBasedObjectId) {
          recordsNotMatchingCriteria++;
          continue;
        }

        // Generate new objectID based on slug
        const newObjectId = generateUid(record.slug);

        // Only update if the new objectID is different
        if (record.objectID !== newObjectId) {
          metrics.recordsWithChanges++;

          if (options.dryRun) {
            console.log(
              `🔄 Would change: "${record.objectID}" → "${newObjectId}" (slug: "${record.slug}")`
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

      // Apply updates if not in dry-run mode
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
    console.log(`📄 Records without slug: ${recordsWithoutSlug}`);
    console.log(
      `🎯 Records not matching criteria: ${recordsNotMatchingCriteria}`
    );
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
      // metrics.errors.forEach(error => console.log(`   ${error}`));
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
