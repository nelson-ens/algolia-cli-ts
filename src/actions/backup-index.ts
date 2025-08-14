import { BaseAlgoliaAction, ActionOptions, ActionResult, AlgoliaConfig } from "../core/BaseAlgoliaAction";
import { Logger } from "../core/Logger";
import { AppErrorHandler } from "../core/ErrorHandler";
import { promptUser } from "../utils/prompt";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

interface BackupIndexOptions extends ActionOptions {
  outputDir?: string;
}

interface BackupData {
  records: any[];
  settings: any;
  rules: any[];
  synonyms: any[];
}

interface BackupIndexResult {
  recordsCount: number;
  rulesCount: number;
  synonymsCount: number;
  outputDirectory: string;
  files: string[];
}

export class BackupIndexAction extends BaseAlgoliaAction<BackupIndexOptions, BackupIndexResult> {
  protected override logger: Logger;
  private errorHandler: AppErrorHandler;
  private outputDir: string;

  constructor(options: BackupIndexOptions) {
    super(options);
    this.logger = new Logger();
    this.errorHandler = new AppErrorHandler(this.logger);
    this.outputDir = options.outputDir || process.cwd();
  }

  protected override validateAndGetConfig(): AlgoliaConfig {
    const appId = process.env.ALGOLIA_APP_ID;
    const apiKey = process.env.ALGOLIA_API_KEY;
    let indexName = this.options.indexName;

    if (!appId || !apiKey) {
      console.error("❌ Missing required environment variables:");
      console.error("   ALGOLIA_APP_ID, ALGOLIA_API_KEY");
      process.exit(1);
    }

    if (!indexName) {
      throw new Error("Index name will be prompted during execution");
    }

    return { appId, apiKey, indexName };
  }

  private async promptForIndexName(): Promise<string> {
    const indexName = await promptUser("📊 Enter the index name to backup: ");
    if (!indexName.trim()) {
      console.error("❌ Index name cannot be empty");
      process.exit(1);
    }
    return indexName.trim();
  }

  protected override async processRecords(): Promise<BackupIndexResult> {
    // Prompt for index name if not provided
    if (!this.options.indexName) {
      const indexName = await this.promptForIndexName();
      this.config.indexName = indexName;
    }

    this.logger.section("Backup Algolia Index");
    this.logActionStart(
      "Backup Index", 
      `Exporting records, settings, rules and synonyms to ${this.outputDir}`
    );

    const backupData: BackupData = {
      records: [],
      settings: {},
      rules: [],
      synonyms: []
    };

    // Step 1: Retrieve all records
    this.logger.info("📦 Retrieving records...");
    await this.retrieveRecords(backupData);

    // Step 2: Retrieve index settings
    this.logger.info("⚙️ Retrieving settings...");
    await this.retrieveSettings(backupData);

    // Step 3: Retrieve index rules
    this.logger.info("📋 Retrieving rules...");
    await this.retrieveRules(backupData);

    // Step 4: Retrieve index synonyms
    this.logger.info("🔗 Retrieving synonyms...");
    await this.retrieveSynonyms(backupData);

    // Step 5: Create backup files
    this.logger.info("💾 Creating backup files...");
    const files = await this.createBackupFiles(backupData);

    const result: BackupIndexResult = {
      recordsCount: backupData.records.length,
      rulesCount: backupData.rules.length,
      synonymsCount: backupData.synonyms.length,
      outputDirectory: this.outputDir,
      files
    };

    this.logBackupResults(result);
    return result;
  }

  private async retrieveRecords(backupData: BackupData): Promise<void> {
    try {
      let cursor: string | undefined;
      const batchSize = this.options.batchSize || 1000;

      while (true) {
        const response = await this.client.browse({
          indexName: this.config.indexName,
          browseParams: {
            hitsPerPage: batchSize,
            cursor,
          },
        });

        backupData.records = backupData.records.concat(response.hits);
        this.metrics.processedRecords += response.hits.length;
        cursor = response.cursor;

        if (!cursor) {
          break;
        }
      }

      this.logger.info(`✅ ${backupData.records.length} records retrieved`);
    } catch (error) {
      const errorMessage = `Failed to retrieve records: ${error instanceof Error ? error.message : String(error)}`;
      this.metrics.errors.push(errorMessage);
      this.logger.error(errorMessage);
      throw this.errorHandler.handleProcessingError("Failed to retrieve records", { indexName: this.config.indexName }, error instanceof Error ? error : undefined);
    }
  }

  private async retrieveSettings(backupData: BackupData): Promise<void> {
    try {
      backupData.settings = await this.client.getSettings({
        indexName: this.config.indexName
      });
      this.logger.info("✅ Settings retrieved");
    } catch (error) {
      const errorMessage = `Failed to retrieve settings: ${error instanceof Error ? error.message : String(error)}`;
      this.metrics.errors.push(errorMessage);
      this.logger.error(errorMessage);
      throw this.errorHandler.handleProcessingError("Failed to retrieve settings", { indexName: this.config.indexName }, error instanceof Error ? error : undefined);
    }
  }

  private async retrieveRules(backupData: BackupData): Promise<void> {
    try {
      const response = await this.client.searchRules({
        indexName: this.config.indexName,
        searchRulesParams: {
          hitsPerPage: 1000
        }
      });
      
      backupData.rules = response.hits;
      this.logger.info(`✅ ${backupData.rules.length} rules retrieved`);
    } catch (error) {
      const errorMessage = `Failed to retrieve rules: ${error instanceof Error ? error.message : String(error)}`;
      this.metrics.errors.push(errorMessage);
      this.logger.error(errorMessage);
      throw this.errorHandler.handleProcessingError("Failed to retrieve rules", { indexName: this.config.indexName }, error instanceof Error ? error : undefined);
    }
  }

  private async retrieveSynonyms(backupData: BackupData): Promise<void> {
    try {
      const response = await this.client.searchSynonyms({
        indexName: this.config.indexName,
        searchSynonymsParams: {
          hitsPerPage: 1000
        }
      });
      
      backupData.synonyms = response.hits;
      this.logger.info(`✅ ${backupData.synonyms.length} synonyms retrieved`);
    } catch (error) {
      const errorMessage = `Failed to retrieve synonyms: ${error instanceof Error ? error.message : String(error)}`;
      this.metrics.errors.push(errorMessage);
      this.logger.error(errorMessage);
      throw this.errorHandler.handleProcessingError("Failed to retrieve synonyms", { indexName: this.config.indexName }, error instanceof Error ? error : undefined);
    }
  }

  private async createBackupFiles(backupData: BackupData): Promise<string[]> {
    const files: string[] = [];
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const indexName = this.config.indexName;

    // Ensure output directory exists
    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true });
    }

    try {
      // Create records file
      if (backupData.records && backupData.records.length > 0) {
        const recordsFile = this.createJsonFile(
          backupData.records, 
          `${indexName}-records-${timestamp}.json`
        );
        files.push(recordsFile);
      }

      // Create settings file
      if (backupData.settings && Object.keys(backupData.settings).length > 0) {
        const settingsFile = this.createJsonFile(
          backupData.settings, 
          `${indexName}-settings-${timestamp}.json`
        );
        files.push(settingsFile);
      }

      // Create rules file
      if (backupData.rules && backupData.rules.length > 0) {
        const rulesFile = this.createJsonFile(
          backupData.rules, 
          `${indexName}-rules-${timestamp}.json`
        );
        files.push(rulesFile);
      }

      // Create synonyms file
      if (backupData.synonyms && backupData.synonyms.length > 0) {
        const synonymsFile = this.createJsonFile(
          backupData.synonyms, 
          `${indexName}-synonyms-${timestamp}.json`
        );
        files.push(synonymsFile);
      }

      this.logger.info(`✅ Created ${files.length} backup files`);
      return files;

    } catch (error) {
      const errorMessage = `Failed to create backup files: ${error instanceof Error ? error.message : String(error)}`;
      this.metrics.errors.push(errorMessage);
      this.logger.error(errorMessage);
      throw this.errorHandler.handleProcessingError("Failed to create backup files", { outputDir: this.outputDir }, error instanceof Error ? error : undefined);
    }
  }

  private createJsonFile(data: any, fileName: string): string {
    const filePath = join(this.outputDir, fileName);
    const jsonContent = JSON.stringify(data, null, 2);
    
    writeFileSync(filePath, jsonContent, 'utf8');
    this.logger.info(`📄 Created: ${fileName}`);
    
    return filePath;
  }

  private logBackupResults(result: BackupIndexResult): void {
    this.logger.logRaw("");
    this.logger.logRaw("📈 Backup Complete!");
    this.logger.logRaw("━".repeat(50));
    this.logger.logRaw(`📊 Records backed up: ${result.recordsCount}`);
    this.logger.logRaw(`📋 Rules backed up: ${result.rulesCount}`);
    this.logger.logRaw(`🔗 Synonyms backed up: ${result.synonymsCount}`);
    this.logger.logRaw(`📁 Output directory: ${result.outputDirectory}`);
    this.logger.logRaw(`📄 Files created: ${result.files.length}`);
    
    if (result.files.length > 0) {
      this.logger.logRaw("");
      this.logger.logRaw("📄 Backup Files:");
      result.files.forEach(file => {
        const fileName = file.split('/').pop() || file;
        this.logger.logRaw(`   - ${fileName}`);
      });
    }

    if (this.metrics.errors.length === 0) {
      this.logger.logRaw("");
      this.logger.success("✅ Backup completed successfully");
    }
  }
}

// Legacy function for backward compatibility
export async function backupIndex(options: BackupIndexOptions = {}): Promise<ActionResult<BackupIndexResult>> {
  const action = new BackupIndexAction(options);
  return action.execute();
}