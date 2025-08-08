#!/usr/bin/env node

import { Command } from "commander";
import dotenv from "dotenv";
// import { replaceObjectIds } from './actions/replace-objectid';
import { replaceResourceObjectIds } from "./actions/replace-resource-objectid";
import { findMatchingObjectId } from "./actions/find-matching-objectid";
import { replaceObjectIdWithSlug } from "./actions/replace-objectid-with-slug";
import { generateUuid } from "./actions/generate-uuid";
import { fixPublishedDate } from "./actions/fix-published-date";

dotenv.config();

const program = new Command();

program
  .name("algolia-cli")
  .description("CLI tool for common Algolia operations")
  .version("1.0.0");

// program
//   .command('replace-objectid')
//   .description('Replace objectID with title.toLowerCase() for all records (DESTRUCTIVE)')
//   .option('--dry-run', 'Run without making changes (default behavior)')
//   .option('--execute', 'Actually execute the changes')
//   .option('--index <name>', 'Index name (overrides .env)')
//   .action(async (options) => {
//     try {
//       // If --execute is explicitly set, run in execute mode
//       // Otherwise, default to dry-run mode
//       const dryRun = !options.execute;

//       await replaceObjectIds({
//         indexName: options.index,
//         dryRun
//       });
//     } catch (error) {
//       console.error('❌ Command failed:', error instanceof Error ? error.message : String(error));
//       process.exit(1);
//     }
//   });

program
  .command("replace-resource-objectid")
  .description(
    "Replace objectID for resource records using schemaPath+title+resourceType (DESTRUCTIVE)"
  )
  .option("--dry-run", "Run without making changes (default behavior)")
  .option("--execute", "Actually execute the changes")
  .option("--index <name>", "Index name (overrides .env)")
  .action(async (options) => {
    try {
      const dryRun = !options.execute;

      await replaceResourceObjectIds({
        indexName: options.index,
        dryRun,
      });
    } catch (error) {
      console.error(
        "❌ Command failed:",
        error instanceof Error ? error.message : String(error)
      );
      process.exit(1);
    }
  });

program
  .command("find-matching-objectid")
  .description("Find records where objectID equals generateUid(title)")
  .option("--index <name>", "Index name (overrides .env)")
  .action(async (options) => {
    try {
      await findMatchingObjectId({
        indexName: options.index,
      });
    } catch (error) {
      console.error(
        "❌ Command failed:",
        error instanceof Error ? error.message : String(error)
      );
      process.exit(1);
    }
  });

program
  .command("replace-objectid-with-slug")
  .description(
    "Replace objectID with generateUid(slug) for records where objectID = generateUid(title) and slug is defined (DESTRUCTIVE)"
  )
  .option("--dry-run", "Run without making changes (default behavior)")
  .option("--execute", "Actually execute the changes")
  .option("--index <name>", "Index name (overrides .env)")
  .action(async (options) => {
    try {
      const dryRun = !options.execute;

      await replaceObjectIdWithSlug({
        indexName: options.index,
        dryRun,
      });
    } catch (error) {
      console.error(
        "❌ Command failed:",
        error instanceof Error ? error.message : String(error)
      );
      process.exit(1);
    }
  });

program
  .command("generate-uuid")
  .description("Generate a UUID from an input string using interactive prompt")
  .action(async () => {
    try {
      await generateUuid();
    } catch (error) {
      console.error(
        "❌ Command failed:",
        error instanceof Error ? error.message : String(error)
      );
      process.exit(1);
    }
  });

program
  .command("fix-published-date")
  .description(
    "Analyze and fix publishedDate fields for a specific resourceType (converts string dates to timestamps)"
  )
  .requiredOption("--resource-type <type>", "Resource type to process")
  .option("--dry-run", "Run without making changes (default behavior)")
  .option("--execute", "Actually execute the changes")
  .option("--index <name>", "Index name (overrides .env)")
  .action(async (options) => {
    try {
      const dryRun = !options.execute;

      await fixPublishedDate({
        indexName: options.index,
        resourceType: options.resourceType,
        dryRun,
      });
    } catch (error) {
      console.error(
        "❌ Command failed:",
        error instanceof Error ? error.message : String(error)
      );
      process.exit(1);
    }
  });

program.parse();
