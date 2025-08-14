import { BaseAlgoliaAction, ActionOptions } from "../core/BaseAlgoliaAction";
import { ValidationService } from "../core/ValidationService";
import { Logger } from "../core/Logger";
import { AlgoliaRecord } from "../utils/types";
import { generateUid } from "../utils/uuidUtils";

interface FindDuplicateSlugOptions extends ActionOptions {
  // No additional options needed for this action
}

interface DuplicateSlugGroup {
  slug: string;
  records: AlgoliaRecord[];
  titleGeneratedRecord?: AlgoliaRecord;
  slugGeneratedRecord?: AlgoliaRecord;
}

interface FindDuplicateSlugResult {
  duplicateGroups: DuplicateSlugGroup[];
  totalDuplicateRecords: number;
  recordsToReplace: number;
}

export class FindDuplicateSlugAction extends BaseAlgoliaAction<
  FindDuplicateSlugOptions,
  FindDuplicateSlugResult
> {
  protected override logger: Logger;
  private slugGroups: Map<string, AlgoliaRecord[]> = new Map();
  private duplicateGroups: DuplicateSlugGroup[] = [];

  constructor(options: FindDuplicateSlugOptions) {
    super(options);
    this.logger = new Logger();
  }

  protected async processRecords(): Promise<FindDuplicateSlugResult> {
    this.logActionStart(
      "Find duplicate slug records action",
      "Find records with same slug, identify which should replace which based on objectID generation method"
    );

    if (!this.options.dryRun) {
      await this.confirmDestructiveAction(
        "This action will replace records with duplicate slugs."
      );
    }

    // First pass: Group records by slug
    for await (const records of this.browseRecords()) {
      for (const record of records) {
        this.metrics.processedRecords++;

        if (this.hasValidSlug(record)) {
          const slug = record.slug!;
          if (!this.slugGroups.has(slug)) {
            this.slugGroups.set(slug, []);
          }
          this.slugGroups.get(slug)!.push(record);
        }
      }
    }

    // Second pass: Identify duplicates and categorize them
    this.identifyDuplicates();

    // Third pass: Process replacements if not dry run
    if (!this.options.dryRun && this.duplicateGroups.length > 0) {
      await this.processDuplicateReplacements();
    }

    this.logDuplicatesSummary();

    return {
      duplicateGroups: this.duplicateGroups,
      totalDuplicateRecords: this.duplicateGroups.reduce(
        (sum, group) => sum + group.records.length,
        0
      ),
      recordsToReplace: this.duplicateGroups.filter(
        (group) => group.titleGeneratedRecord && group.slugGeneratedRecord
      ).length,
    };
  }

  private hasValidSlug(record: AlgoliaRecord): boolean {
    return (
      ValidationService.validateRecordWithSlug(record) ||
      (typeof record.slug === "string" && record.slug.trim() !== "")
    );
  }

  private identifyDuplicates(): void {
    for (const [slug, records] of this.slugGroups) {
      if (records.length > 1) {
        const duplicateGroup: DuplicateSlugGroup = {
          slug,
          records,
        };

        // Categorize records based on how their objectID was generated
        for (const record of records) {
          if (record.title) {
            const titleGeneratedId = generateUid(record.title);
            const slugGeneratedId = generateUid(slug);

            if (record.objectID === titleGeneratedId) {
              duplicateGroup.titleGeneratedRecord = record;
            } else if (record.objectID === slugGeneratedId) {
              duplicateGroup.slugGeneratedRecord = record;
            }
          }
        }

        this.duplicateGroups.push(duplicateGroup);
        this.logDuplicateGroup(duplicateGroup);
      }
    }
  }

  private async processDuplicateReplacements(): Promise<void> {
    const recordsToSave: AlgoliaRecord[] = [];
    const recordsToDelete: string[] = [];

    for (const group of this.duplicateGroups) {
      if (group.titleGeneratedRecord && group.slugGeneratedRecord) {
        // Copy content from title-generated record (newer) to slug-generated record (correct ID)
        const updatedRecord: AlgoliaRecord = {
          ...group.titleGeneratedRecord,
          objectID: group.slugGeneratedRecord.objectID, // Keep the slug-generated objectID
        };

        recordsToSave.push(updatedRecord);
        recordsToDelete.push(group.titleGeneratedRecord.objectID);

        this.metrics.recordsWithChanges++;

        this.logger.info(
          `Replacing duplicate: ${group.titleGeneratedRecord.objectID} → ${group.slugGeneratedRecord.objectID}`,
          {
            slug: group.slug,
            titleGeneratedId: group.titleGeneratedRecord.objectID,
            slugGeneratedId: group.slugGeneratedRecord.objectID,
          }
        );
      }
    }

    // Perform batch operations
    if (recordsToSave.length > 0) {
      this.logger.info(`Saving ${recordsToSave.length} updated records...`);
      await this.saveRecords(recordsToSave);
    }

    if (recordsToDelete.length > 0) {
      this.logger.info(
        `Deleting ${recordsToDelete.length} duplicate records...`
      );
      await this.deleteRecords(recordsToDelete);
    }
  }

  private logDuplicateGroup(group: DuplicateSlugGroup): void {
    this.logger.warn(
      `Duplicate slug found: "${group.slug}" (${group.records.length} records)`
    );

    group.records.forEach((record, index) => {
      const title = record.title || "N/A";
      const resourceType = record.resourceType || "N/A";
      const generationType = this.getObjectIdGenerationType(record, group.slug);

      this.logger.logRaw(
        `   ${index + 1}. ${
          record.objectID
        } - "${title}" [${generationType}] (${resourceType})`
      );
    });

    if (group.titleGeneratedRecord && group.slugGeneratedRecord) {
      this.logger.success(
        `   → Can replace: ${group.titleGeneratedRecord.objectID} content → ${group.slugGeneratedRecord.objectID}`
      );
    } else {
      this.logger.info(
        "   → No clear replacement strategy (missing title or slug generated record)"
      );
    }

    this.logger.logRaw("");
  }

  private getObjectIdGenerationType(
    record: AlgoliaRecord,
    slug: string
  ): string {
    if (record.title) {
      const titleGeneratedId = generateUid(record.title);
      const slugGeneratedId = generateUid(slug);

      if (record.objectID === titleGeneratedId) {
        return "title-generated";
      } else if (record.objectID === slugGeneratedId) {
        return "slug-generated";
      }
    }
    return "unknown";
  }

  private logDuplicatesSummary(): void {
    this.logger.section("Duplicate Analysis Results");
    this.logger.logRaw(
      `🔍 Duplicate slug groups found: ${this.duplicateGroups.length}`
    );

    const replaceableGroups = this.duplicateGroups.filter(
      (group) => group.titleGeneratedRecord && group.slugGeneratedRecord
    );

    this.logger.logRaw(
      `✅ Groups with clear replacement strategy: ${replaceableGroups.length}`
    );
    this.logger.logRaw(
      `⚠️  Groups without clear strategy: ${
        this.duplicateGroups.length - replaceableGroups.length
      }`
    );

    if (replaceableGroups.length > 0) {
      this.logger.logRaw("");
      this.logger.logRaw("🎯 Replaceable Duplicate Groups:");
      replaceableGroups.forEach((group, index) => {
        this.logger.logRaw(
          `   ${index + 1}. Slug: "${group.slug}" - Replace ${
            group.titleGeneratedRecord!.objectID
          } → ${group.slugGeneratedRecord!.objectID}`
        );
      });
    }
  }

  protected override validateRecord(record: unknown): record is AlgoliaRecord {
    // We want to include records with slugs for this analysis
    return ValidationService.validateBasicRecord(record);
  }

  protected override logResults(): void {
    const duration = (Date.now() - this.startTime) / 1000;
    const totalDuplicateRecords = this.duplicateGroups.reduce(
      (sum, group) => sum + group.records.length,
      0
    );

    this.logger.logRaw("");
    this.logger.logRaw("📈 Duplicate Analysis Complete!");
    this.logger.logRaw("━".repeat(50));
    this.logger.logRaw(
      `📊 Total records processed: ${this.metrics.processedRecords}`
    );
    this.logger.logRaw(
      `🔍 Duplicate slug groups: ${this.duplicateGroups.length}`
    );
    this.logger.logRaw(`📋 Total duplicate records: ${totalDuplicateRecords}`);
    this.logger.logRaw(
      `🔄 Records replaced: ${this.metrics.recordsWithChanges}`
    );
    this.logger.logRaw(
      `📦 Batches processed: ${this.metrics.batchesProcessed}`
    );
    this.logger.logRaw(`⏱️  Processing time: ${duration.toFixed(2)}s`);

    if (this.options.dryRun && this.duplicateGroups.length > 0) {
      this.logger.logRaw("");
      this.logger.logRaw(
        "💡 This was a dry run. Use --execute to apply changes."
      );
    } else if (!this.options.dryRun && this.metrics.recordsWithChanges > 0) {
      this.logger.logRaw("");
      this.logger.logRaw(
        "✅ Duplicate replacements have been applied to the index."
      );
    }

    if (this.metrics.errors.length > 0) {
      this.logger.logRaw("");
      this.logger.logRaw("❌ Errors encountered:");
      this.logger.logRaw(`   ${this.metrics.errors.length} issues found`);
    }
  }
}

export async function findDuplicateSlug(
  options: FindDuplicateSlugOptions
): Promise<void> {
  const action = new FindDuplicateSlugAction(options);
  const result = await action.execute();

  if (!result.success) {
    process.exit(1);
  }
}
