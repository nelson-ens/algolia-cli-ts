#!/usr/bin/env node

import { Command } from "commander";
import dotenv from "dotenv";

// Refactored action implementations (now the default)
import { replaceResourceObjectIds } from "./actions/replace-resource-objectid";
import { findMatchingObjectId } from "./actions/find-matching-objectid";
import { replaceObjectIdWithSlug } from "./actions/replace-objectid-with-slug";
import { generateUuid, generateUuidAdvanced } from "./actions/generate-uuid";
import { fixPublishedDate } from "./actions/fix-published-date";
import { normalizeDateField } from "./actions/normalize-date-field";

dotenv.config();

const program = new Command();

program
  .name("algolia-cli")
  .description("CLI tool for common Algolia operations")
  .version("1.0.0");

program
  .command("replace-resource-objectid")
  .description(
    "Replace objectID for resource records using schemaPath+title+resourceType (DESTRUCTIVE)"
  )
  .option("--dry-run", "Run without making changes (default behavior)")
  .option("--execute", "Actually execute the changes")
  .option("--index <name>", "Index name (overrides .env)")
  .option("--batch-size <size>", "Batch size for processing (default: 1000)")
  .action(async (options) => {
    try {
      const dryRun = !options.execute;
      const actionOptions = {
        indexName: options.index || undefined,
        dryRun,
        batchSize: options.batchSize ? parseInt(options.batchSize) : undefined,
      };
      await replaceResourceObjectIds(actionOptions);
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
  .option("--batch-size <size>", "Batch size for processing (default: 1000)")
  .action(async (options) => {
    try {
      const actionOptions = {
        indexName: options.index || undefined,
        batchSize: options.batchSize ? parseInt(options.batchSize) : undefined,
      };
      await findMatchingObjectId(actionOptions);
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
  .option("--batch-size <size>", "Batch size for processing (default: 1000)")
  .action(async (options) => {
    try {
      const dryRun = !options.execute;
      const actionOptions = {
        indexName: options.index || undefined,
        dryRun,
        batchSize: options.batchSize ? parseInt(options.batchSize) : undefined,
      };
      await replaceObjectIdWithSlug(actionOptions);
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
  .description("Generate a UUID from an input string")
  .option("--input <string>", "Input string (non-interactive mode)")
  .action(async (options) => {
    try {
      if (options.input) {
        // Use advanced version for non-interactive mode
        const result = await generateUuidAdvanced({
          input: options.input,
          interactive: false
        });
        if (!result.success) {
          process.exit(1);
        }
      } else {
        // Use legacy-compatible version for interactive mode
        await generateUuid();
      }
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
  .option("--batch-size <size>", "Batch size for processing (default: 1000)")
  .action(async (options) => {
    try {
      const dryRun = !options.execute;
      const actionOptions = {
        indexName: options.index || undefined,
        resourceType: options.resourceType,
        dryRun,
        batchSize: options.batchSize ? parseInt(options.batchSize) : undefined,
      };
      await fixPublishedDate(actionOptions);
    } catch (error) {
      console.error(
        "❌ Command failed:",
        error instanceof Error ? error.message : String(error)
      );
      process.exit(1);
    }
  });

program
  .command("normalize-date-field")
  .description(
    "Browse all records and normalize a specific date field to Unix timestamps in seconds (DESTRUCTIVE)"
  )
  .requiredOption("--field <name>", "Field name to normalize (e.g., publishedDate, createdAt)")
  .option("--dry-run", "Run without making changes (default behavior)")
  .option("--execute", "Actually execute the changes")
  .option("--index <name>", "Index name (overrides .env)")
  .option("--batch-size <size>", "Batch size for processing (default: 1000)")
  .action(async (options) => {
    try {
      const dryRun = !options.execute;
      const actionOptions = {
        indexName: options.index || undefined,
        fieldName: options.field,
        dryRun,
        batchSize: options.batchSize ? parseInt(options.batchSize) : undefined,
      };
      await normalizeDateField(actionOptions);
    } catch (error) {
      console.error(
        "❌ Command failed:",
        error instanceof Error ? error.message : String(error)
      );
      process.exit(1);
    }
  });

program.parse();