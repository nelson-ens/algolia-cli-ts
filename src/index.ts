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
import { findDuplicateSlug } from "./actions/find-duplicate-slug";
import { sanitizeDateValues } from "./actions/sanitize-date-values";
import { deleteRecordsByPattern } from "./actions/delete-records-by-pattern";
import { findInvalidRecords } from "./actions/find-invalid-records";
import { backupIndex } from "./actions/backup-index";
import { restoreIndex } from "./actions/restore-index";

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
  .option(
    "--log-file",
    "Save results to log file in logs folder (automatically named)"
  )
  .action(async (options) => {
    try {
      const dryRun = !options.execute;
      const actionOptions = {
        indexName: options.index || undefined,
        dryRun,
        batchSize: options.batchSize ? parseInt(options.batchSize) : undefined,
        logFile: options.logFile || false,
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
  .option(
    "--log-file",
    "Save results to log file in logs folder (automatically named)"
  )
  .action(async (options) => {
    try {
      const actionOptions = {
        indexName: options.index || undefined,
        batchSize: options.batchSize ? parseInt(options.batchSize) : undefined,
        logFile: options.logFile || false,
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
  .option(
    "--log-file",
    "Save results to log file in logs folder (automatically named)"
  )
  .action(async (options) => {
    try {
      const dryRun = !options.execute;
      const actionOptions = {
        indexName: options.index || undefined,
        dryRun,
        batchSize: options.batchSize ? parseInt(options.batchSize) : undefined,
        logFile: options.logFile || false,
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
          interactive: false,
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
  .option(
    "--log-file",
    "Save results to log file in logs folder (automatically named)"
  )
  .action(async (options) => {
    try {
      const dryRun = !options.execute;
      const actionOptions = {
        indexName: options.index || undefined,
        resourceType: options.resourceType,
        dryRun,
        batchSize: options.batchSize ? parseInt(options.batchSize) : undefined,
        logFile: options.logFile || false,
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
  .requiredOption(
    "--field <name>",
    "Field name to normalize (e.g., publishedDate, createdAt)"
  )
  .option("--dry-run", "Run without making changes (default behavior)")
  .option("--execute", "Actually execute the changes")
  .option("--index <name>", "Index name (overrides .env)")
  .option("--batch-size <size>", "Batch size for processing (default: 1000)")
  .option(
    "--log-file",
    "Save results to log file in logs folder (automatically named)"
  )
  .action(async (options) => {
    try {
      const dryRun = !options.execute;
      const actionOptions = {
        indexName: options.index || undefined,
        fieldName: options.field,
        dryRun,
        batchSize: options.batchSize ? parseInt(options.batchSize) : undefined,
        logFile: options.logFile || false,
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

program
  .command("sanitize-date-values")
  .description(
    "Analyze and sanitize all date-like values across all record fields to Unix timestamps in seconds (DESTRUCTIVE)"
  )
  .option("--dry-run", "Run without making changes (default behavior)")
  .option("--execute", "Actually execute the changes")
  .option("--index <name>", "Index name (overrides .env)")
  .option("--batch-size <size>", "Batch size for processing (default: 1000)")
  .option(
    "--log-file",
    "Save results to log file in logs folder (automatically named)"
  )
  .action(async (options) => {
    try {
      const dryRun = !options.execute;
      const actionOptions = {
        indexName: options.index || undefined,
        dryRun,
        batchSize: options.batchSize ? parseInt(options.batchSize) : undefined,
        logFile: options.logFile || false,
      };
      await sanitizeDateValues(actionOptions);
    } catch (error) {
      console.error(
        "❌ Command failed:",
        error instanceof Error ? error.message : String(error)
      );
      process.exit(1);
    }
  });

program
  .command("find-duplicate-slug")
  .description(
    "Find and handle duplicate records with the same slug, replacing title-generated objectIDs with slug-generated content (DESTRUCTIVE)"
  )
  .option("--dry-run", "Run without making changes (default behavior)")
  .option("--execute", "Actually execute the changes")
  .option("--index <name>", "Index name (overrides .env)")
  .option("--batch-size <size>", "Batch size for processing (default: 1000)")
  .option(
    "--log-file",
    "Save results to log file in logs folder (automatically named)"
  )
  .action(async (options) => {
    try {
      const dryRun = !options.execute;
      const actionOptions = {
        indexName: options.index || undefined,
        dryRun,
        batchSize: options.batchSize ? parseInt(options.batchSize) : undefined,
        logFile: options.logFile || false,
      };
      await findDuplicateSlug(actionOptions);
    } catch (error) {
      console.error(
        "❌ Command failed:",
        error instanceof Error ? error.message : String(error)
      );
      process.exit(1);
    }
  });

program
  .command("delete-records-by-pattern")
  .description(
    "Delete records where a specific field matches a regular expression pattern (DESTRUCTIVE)"
  )
  .requiredOption("--key <name>", "Field name to match against (must be string field)")
  .requiredOption("--pattern <regex>", "Regular expression pattern to match")
  .option("--dry-run", "Run without making changes (default behavior)")
  .option("--execute", "Actually execute the deletions")
  .option("--index <name>", "Index name (overrides .env)")
  .option("--batch-size <size>", "Batch size for processing (default: 1000)")
  .option(
    "--log-file",
    "Save results to log file in logs folder (automatically named)"
  )
  .action(async (options) => {
    try {
      const dryRun = !options.execute;
      const actionOptions = {
        indexName: options.index || undefined,
        key: options.key,
        pattern: options.pattern,
        dryRun,
        batchSize: options.batchSize ? parseInt(options.batchSize) : undefined,
        logFile: options.logFile || false,
      };
      await deleteRecordsByPattern(actionOptions);
    } catch (error) {
      console.error(
        "❌ Command failed:",
        error instanceof Error ? error.message : String(error)
      );
      process.exit(1);
    }
  });

program
  .command("find-invalid-records")
  .description(
    "Find and optionally delete records with invalid values (null, undefined, empty string, or missing) for specified keys (DESTRUCTIVE)"
  )
  .requiredOption("--keys <list>", "Comma-delimited list of keys to check for invalid values")
  .option("--dry-run", "Run without making changes (default behavior)")
  .option("--execute", "Actually execute the deletions")
  .option("--index <name>", "Index name (overrides .env)")
  .option("--batch-size <size>", "Batch size for processing (default: 1000)")
  .option(
    "--log-file",
    "Save results to log file in logs folder (automatically named)"
  )
  .action(async (options) => {
    try {
      const dryRun = !options.execute;
      const actionOptions = {
        indexName: options.index || undefined,
        keys: options.keys,
        dryRun,
        batchSize: options.batchSize ? parseInt(options.batchSize) : undefined,
        logFile: options.logFile || false,
      };
      await findInvalidRecords(actionOptions);
    } catch (error) {
      console.error(
        "❌ Command failed:",
        error instanceof Error ? error.message : String(error)
      );
      process.exit(1);
    }
  });

program
  .command("backup-index")
  .description("Backup an Algolia index including records, settings, rules and synonyms")
  .option("--index <name>", "Index name (overrides .env, will be prompted if not provided)")
  .option("--batch-size <size>", "Batch size for processing (default: 1000)")
  .option("--output-dir <path>", "Output directory for backup files (default: current directory)")
  .option(
    "--log-file",
    "Save results to log file in logs folder (automatically named)"
  )
  .action(async (options) => {
    try {
      const actionOptions = {
        indexName: options.index || undefined,
        batchSize: options.batchSize ? parseInt(options.batchSize) : undefined,
        outputDir: options.outputDir || undefined,
        logFile: options.logFile || false,
      };
      await backupIndex(actionOptions);
    } catch (error) {
      console.error(
        "❌ Command failed:",
        error instanceof Error ? error.message : String(error)
      );
      process.exit(1);
    }
  });

program
  .command("restore-index")
  .description("Restore an Algolia index from backup files including records, settings, rules and synonyms")
  .option("--index <name>", "Index name (will be prompted if not provided)")
  .option("--batch-size <size>", "Batch size for processing (default: 1000)")
  .option("--input-dir <path>", "Input directory for backup files (default: current directory)")
  .option("--backup-prefix <prefix>", "Prefix for backup files (will be prompted if not provided)")
  .option(
    "--log-file",
    "Save results to log file in logs folder (automatically named)"
  )
  .action(async (options) => {
    try {
      const actionOptions = {
        indexName: options.index || undefined,
        batchSize: options.batchSize ? parseInt(options.batchSize) : undefined,
        inputDir: options.inputDir || undefined,
        backupPrefix: options.backupPrefix || undefined,
        logFile: options.logFile || false,
      };
      await restoreIndex(actionOptions);
    } catch (error) {
      console.error(
        "❌ Command failed:",
        error instanceof Error ? error.message : String(error)
      );
      process.exit(1);
    }
  });

program.parse();
