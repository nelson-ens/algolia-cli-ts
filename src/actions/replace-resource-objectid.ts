import { BaseAlgoliaAction, ActionOptions } from "../core/BaseAlgoliaAction";
import { ValidationService } from "../core/ValidationService";
import { Logger } from "../core/Logger";
import { AlgoliaRecord } from "../utils/types";
import { generateUid } from "../utils/uuidUtils";

interface ResourceConfig {
  resourceType: string;
  schemaPath: string;
}

interface ReplaceResourceObjectIdOptions extends ActionOptions {
  dryRun: boolean;
}

interface ReplaceResourceObjectIdResult {
  resourceConfigs: ResourceConfig[];
  updatedRecords: number;
  skippedRecords: number;
}

export class ReplaceResourceObjectIdAction extends BaseAlgoliaAction<
  ReplaceResourceObjectIdOptions,
  ReplaceResourceObjectIdResult
> {
  protected override logger: Logger;
  private resourceConfigs: ResourceConfig[] = [];

  constructor(options: ReplaceResourceObjectIdOptions) {
    super(options);
    this.logger = new Logger();
  }

  protected async processRecords(): Promise<ReplaceResourceObjectIdResult> {
    this.validateConfiguration();
    this.logActionStart("Replace resource objectID action", 
      "Target: Resource records using schemaPath+title+resourceType");

    await this.confirmDestructiveAction(
      `This will modify objectID values for records with resourceType="${this.resourceConfigs.map(c => c.resourceType).join('", "')}" in index "${this.config.indexName}".`
    );

    const result: ReplaceResourceObjectIdResult = {
      resourceConfigs: this.resourceConfigs,
      updatedRecords: 0,
      skippedRecords: 0,
    };

    const filters = this.buildResourceTypeFilters();
    
    for await (const records of this.browseRecords(filters)) {
      const updatedRecords: AlgoliaRecord[] = [];
      const oldObjectIds: string[] = [];

      for (const record of records) {
        this.metrics.processedRecords++;

        const updateResult = this.processRecord(record);
        if (updateResult) {
          updatedRecords.push(updateResult.newRecord);
          oldObjectIds.push(updateResult.oldObjectId);
          this.metrics.recordsWithChanges++;
          result.updatedRecords++;
        } else {
          result.skippedRecords++;
        }
      }

      if (!this.options.dryRun && updatedRecords.length > 0) {
        await this.saveRecords(updatedRecords);
        await this.deleteRecords(oldObjectIds);
      }
    }

    return result;
  }

  private validateConfiguration(): void {
    // Validate environment variables
    const envValidation = ValidationService.validateEnvironmentVariables([
      'ALGOLIA_APP_ID',
      'ALGOLIA_API_KEY',
      'ALGOLIA_INDEX_NAME',
    ]);

    if (!envValidation.isValid) {
      envValidation.errors.forEach(error => this.logger.error(error));
      process.exit(1);
    }

    // Validate resource type mapping
    const mappingValidation = ValidationService.validateResourceTypeMapping(
      process.env.RESOURCE_TYPE_SCHEMA_PATH_MAPPING
    );

    if (!mappingValidation.isValid) {
      mappingValidation.errors.forEach(error => this.logger.error(error));
      process.exit(1);
    }

    // Parse and store resource configurations
    const resourceMappingObj = JSON.parse(process.env.RESOURCE_TYPE_SCHEMA_PATH_MAPPING!);
    this.resourceConfigs = Object.entries(resourceMappingObj).map(([resourceType, config]) => ({
      resourceType,
      schemaPath: (config as any).schemaPath,
    }));

    this.logger.info("Target resource configurations:");
    this.resourceConfigs.forEach((config, index) => {
      this.logger.logRaw(`   ${index + 1}. resourceType: ${config.resourceType} → schemaPath: ${config.schemaPath}`);
    });
  }

  private buildResourceTypeFilters(): string {
    return this.resourceConfigs
      .map((config) => `resourceType:"${config.resourceType}"`)
      .join(" OR ");
  }

  private processRecord(record: AlgoliaRecord): { newRecord: AlgoliaRecord; oldObjectId: string } | null {
    // Validate record structure
    if (!ValidationService.validateRecordWithTitle(record) || 
        !ValidationService.validateRecordWithResourceType(record)) {
      this.metrics.recordsWithoutTitle++;
      this.logger.warn(`Record ${record.objectID} has invalid structure or missing title/resourceType`);
      return null;
    }

    // Find the correct configuration for this record's resource type
    const config = this.resourceConfigs.find(c => c.resourceType === (record as any).resourceType);
    if (!config) {
      this.metrics.errors.push(`No configuration found for resourceType: ${(record as any).resourceType}`);
      return null;
    }

    // Generate new object ID
    const extUrl = (record as any).extUrl || '';
    const uuidString = `${config.schemaPath};${config.resourceType};${record.title};${extUrl}`;
    const newObjectId = generateUid(uuidString);

    // Check if update is needed
    if (record.objectID === newObjectId) {
      return null;
    }

    // Log the change
    const action = this.options.dryRun ? "Would change" : "Changing";
    this.logger.info(`🔄 ${action}: "${record.objectID}" → "${newObjectId}"`);
    this.logger.debug(`UUID string: "${uuidString}"`);

    return {
      newRecord: { ...record, objectID: newObjectId },
      oldObjectId: record.objectID,
    };
  }

  protected override validateRecord(record: unknown): record is AlgoliaRecord {
    return ValidationService.validateRecordWithTitle(record) &&
           ValidationService.validateRecordWithResourceType(record);
  }
}

export async function replaceResourceObjectIds(
  options: ReplaceResourceObjectIdOptions
): Promise<void> {
  const action = new ReplaceResourceObjectIdAction(options);
  const result = await action.execute();
  
  if (!result.success) {
    process.exit(1);
  }
}