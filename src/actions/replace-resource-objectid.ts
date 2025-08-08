import { algoliasearch } from "algoliasearch";
import { promptUser } from "../utils/prompt";
import {
  AlgoliaRecord,
  ProcessingMetrics,
  validateRecordWhereResourceTypeIsNotEmpty,
} from "../utils/types";
import { generateUid } from "../utils/uuidUtils";

interface ReplaceResourceObjectIdOptions {
  indexName?: string;
  dryRun: boolean;
}

export async function replaceResourceObjectIds(
  options: ReplaceResourceObjectIdOptions
): Promise<void> {
  const appId = process.env.ALGOLIA_APP_ID;
  const apiKey = process.env.ALGOLIA_API_KEY;
  const indexName = options.indexName || process.env.ALGOLIA_INDEX_NAME;
  const resourceMappingStr = process.env.RESOURCE_TYPE_SCHEMA_PATH_MAPPING;

  if (!appId || !apiKey || !indexName) {
    console.error("❌ Missing required environment variables:");
    console.error("   ALGOLIA_APP_ID, ALGOLIA_API_KEY, ALGOLIA_INDEX_NAME");
    console.error("   Or provide --index parameter");
    process.exit(1);
  }

  if (!resourceMappingStr) {
    console.error(
      "❌ Missing required environment variable for resource processing:"
    );
    console.error("   RESOURCE_TYPE_SCHEMA_PATH_MAPPING");
    process.exit(1);
  }

  // Parse JSON resourceType mapping
  let resourceMappingObj: Record<string, { schemaPath: string }>;
  try {
    resourceMappingObj = JSON.parse(resourceMappingStr);
  } catch (error) {
    console.error(`❌ Invalid JSON format in RESOURCE_TYPE_SCHEMA_PATH_MAPPING:`);
    console.error(`   ${error instanceof Error ? error.message : String(error)}`);
    console.error(`   Expected format: {"resourceType":{"schemaPath":"/path/to/schema.json"}}`);
    process.exit(1);
  }

  const resourceConfigs = Object.entries(resourceMappingObj).map(([resourceType, config]) => {
    if (!config.schemaPath) {
      console.error(`❌ Missing schemaPath for resourceType: "${resourceType}"`);
      process.exit(1);
    }
    return {
      resourceType,
      schemaPath: config.schemaPath,
    };
  });

  const resourceTypes = resourceConfigs.map((config) => config.resourceType);

  console.log(
    `🔍 ${
      options.dryRun ? "DRY RUN" : "EXECUTING"
    } - Replace resource objectID action`
  );
  console.log(`📊 Index: ${indexName}`);
  console.log(`🎯 Target resource configurations:`);
  resourceConfigs.forEach((config, index) => {
    console.log(
      `   ${index + 1}. resourceType: ${config.resourceType} → schemaPath: ${
        config.schemaPath
      }`
    );
  });
  console.log("");

  if (!options.dryRun) {
    const resourceTypesList = resourceTypes.join('", "');
    const confirmation = await promptUser(
      `⚠️  This will modify objectID values for records with resourceType="${resourceTypesList}" in index "${indexName}". This is a destructive operation that cannot be undone.\n` +
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

      // Build filter for all resource types
      const resourceTypeFilters = resourceTypes
        .map((type) => `resourceType:"${type}"`)
        .join(" OR ");

      const response = await client.browse({
        indexName,
        browseParams: {
          hitsPerPage: batchSize,
          cursor,
          filters: resourceTypeFilters,
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

        // Find the correct schema path for this record's resource type
        const config = resourceConfigs.find(
          (c) => c.resourceType === record.resourceType
        );
        if (!config) {
          metrics.errors.push(
            `No configuration found for resourceType: ${record.resourceType}`
          );
          continue;
        }

        const uuidString = `${config.schemaPath};${config.resourceType};${record.title};${record.extUrl}`;
        const newObjectId = generateUid(uuidString);

        if (record.objectID !== newObjectId) {
          metrics.recordsWithChanges++;

          if (options.dryRun) {
            console.log(
              `🔄 Would change: "${record.objectID}" → "${newObjectId}"`
            );
            console.log(`   UUID string: "${uuidString}"`);
          } else {
            console.log(`🔄 Changing: "${record.objectID}" → "${newObjectId}"`);
            console.log(`   UUID string: "${uuidString}"`);
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
