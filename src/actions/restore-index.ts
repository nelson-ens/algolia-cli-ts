import { BaseAlgoliaAction, ActionOptions, ActionResult, AlgoliaConfig } from "../core/BaseAlgoliaAction";
import { Logger } from "../core/Logger";
import { AppErrorHandler } from "../core/ErrorHandler";
import { promptUser } from "../utils/prompt";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

interface RestoreIndexOptions extends ActionOptions {
  inputDir?: string;
  backupPrefix?: string;
}

interface RestoreData {
  records?: any[];
  settings?: any;
  rules?: any[];
  synonyms?: any[];
}

interface RestoreIndexResult {
  recordsRestored: number;
  rulesRestored: number;
  synonymsRestored: number;
  settingsRestored: boolean;
  inputDirectory: string;
  filesProcessed: string[];
}

export class RestoreIndexAction extends BaseAlgoliaAction<RestoreIndexOptions, RestoreIndexResult> {
  protected override logger: Logger;
  private errorHandler: AppErrorHandler;
  private inputDir: string;
  private backupPrefix: string;

  constructor(options: RestoreIndexOptions) {
    super(options);
    this.logger = new Logger();
    this.errorHandler = new AppErrorHandler(this.logger);
    this.inputDir = options.inputDir || process.cwd();
    this.backupPrefix = options.backupPrefix || "";
  }

  protected override validateAndGetConfig(): AlgoliaConfig {
    const appId = process.env.ALGOLIA_APP_ID;
    const apiKey = process.env.ALGOLIA_API_KEY;
    let indexName = this.options.indexName || ""; // Allow empty index name for restore

    if (!appId || !apiKey) {
      console.error("❌ Missing required environment variables:");
      console.error("   ALGOLIA_APP_ID, ALGOLIA_API_KEY");
      process.exit(1);
    }

    // For restore action, index name can be prompted later
    return { appId, apiKey, indexName };
  }

  private async promptForIndexName(): Promise<string> {
    const indexName = await promptUser("📊 Enter the index name to restore to: ");
    if (!indexName.trim()) {
      console.error("❌ Index name cannot be empty");
      process.exit(1);
    }
    return indexName.trim();
  }

  private async promptForBackupPrefix(): Promise<string> {
    const backupPrefix = await promptUser("📂 Enter the backup prefix (e.g., 'my-index' for files like 'my-index-records-*.json'): ");
    if (!backupPrefix.trim()) {
      console.error("❌ Backup prefix cannot be empty");
      process.exit(1);
    }
    return backupPrefix.trim();
  }

  protected override async processRecords(): Promise<RestoreIndexResult> {
    // Prompt for index name if not provided
    if (!this.options.indexName || !this.config.indexName) {
      const indexName = await this.promptForIndexName();
      this.config.indexName = indexName;
    }

    // Prompt for backup prefix if not provided
    if (!this.options.backupPrefix) {
      const backupPrefix = await this.promptForBackupPrefix();
      this.backupPrefix = backupPrefix;
    }

    this.logger.section("Restore Algolia Index");
    this.logActionStart(
      "Restore Index", 
      `Restoring records, settings, rules and synonyms from ${this.inputDir}`
    );

    const restoreData = await this.loadBackupFiles();
    const result = await this.restoreIndex(restoreData);

    this.logRestoreResults(result);
    return result;
  }

  private async loadBackupFiles(): Promise<RestoreData> {
    this.logger.info("📂 Loading backup files...");
    
    const restoreData: RestoreData = {};
    const filesProcessed: string[] = [];

    // Load records
    const recordsFile = this.findBackupFile("records");
    if (recordsFile) {
      restoreData.records = this.loadJsonFile(recordsFile);
      filesProcessed.push(recordsFile);
      this.logger.info(`✅ Loaded ${restoreData.records?.length || 0} records from ${recordsFile}`);
    } else {
      this.logger.warn("⚠️  No records backup file found");
    }

    // Load settings
    const settingsFile = this.findBackupFile("settings");
    if (settingsFile) {
      restoreData.settings = this.loadJsonFile(settingsFile);
      filesProcessed.push(settingsFile);
      this.logger.info(`✅ Loaded settings from ${settingsFile}`);
    } else {
      this.logger.warn("⚠️  No settings backup file found");
    }

    // Load rules
    const rulesFile = this.findBackupFile("rules");
    if (rulesFile) {
      restoreData.rules = this.loadJsonFile(rulesFile);
      filesProcessed.push(rulesFile);
      this.logger.info(`✅ Loaded ${restoreData.rules?.length || 0} rules from ${rulesFile}`);
    } else {
      this.logger.warn("⚠️  No rules backup file found");
    }

    // Load synonyms
    const synonymsFile = this.findBackupFile("synonyms");
    if (synonymsFile) {
      restoreData.synonyms = this.loadJsonFile(synonymsFile);
      filesProcessed.push(synonymsFile);
      this.logger.info(`✅ Loaded ${restoreData.synonyms?.length || 0} synonyms from ${synonymsFile}`);
    } else {
      this.logger.warn("⚠️  No synonyms backup file found");
    }

    if (filesProcessed.length === 0) {
      throw new Error(`No backup files found in ${this.inputDir} with prefix "${this.backupPrefix}"`);
    }

    return restoreData;
  }

  private findBackupFile(type: "records" | "settings" | "rules" | "synonyms"): string | null {
    const patterns = [
      `${this.backupPrefix}-${type}.json`,
      `${this.backupPrefix}_${type}.json`,
      `${this.config.indexName}-${type}.json`,
      `${this.config.indexName}_${type}.json`
    ];

    for (const pattern of patterns) {
      const filePath = join(this.inputDir, pattern);
      if (existsSync(filePath)) {
        return pattern;
      }
    }

    // Look for timestamped files
    try {
      const fs = require('fs');
      const files = fs.readdirSync(this.inputDir);
      const matchingFile = files.find((file: string) => 
        file.includes(`${type}`) && 
        (file.startsWith(this.backupPrefix) || file.startsWith(this.config.indexName)) &&
        file.endsWith('.json')
      );
      return matchingFile || null;
    } catch (error) {
      return null;
    }
  }

  private loadJsonFile(fileName: string): any {
    try {
      const filePath = join(this.inputDir, fileName);
      const content = readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      const errorMessage = `Failed to load file ${fileName}: ${error instanceof Error ? error.message : String(error)}`;
      this.metrics.errors.push(errorMessage);
      this.logger.error(errorMessage);
      throw this.errorHandler.handleProcessingError(`Failed to load backup file`, { fileName }, error instanceof Error ? error : undefined);
    }
  }

  private cleanRules(rules: any[]): any[] {
    return rules.map(rule => {
      const cleanRule = { ...rule };
      delete cleanRule._highlightResult;
      delete cleanRule._metadata;
      return cleanRule;
    });
  }

  private async restoreIndex(restoreData: RestoreData): Promise<RestoreIndexResult> {
    const result: RestoreIndexResult = {
      recordsRestored: 0,
      rulesRestored: 0,
      synonymsRestored: 0,
      settingsRestored: false,
      inputDirectory: this.inputDir,
      filesProcessed: []
    };

    try {
      // Restore records
      if (restoreData.records?.length) {
        this.logger.info("📦 Restoring records...");
        await this.client.replaceAllObjects({
          indexName: this.config.indexName,
          objects: restoreData.records,
          batchSize: this.options.batchSize || 1000
        });
        result.recordsRestored = restoreData.records.length;
        this.metrics.processedRecords = restoreData.records.length;
        this.logger.info(`✅ Restored ${restoreData.records.length} records`);
      }

      // Restore settings
      if (restoreData.settings) {
        this.logger.info("⚙️ Restoring settings...");
        await this.client.setSettings({
          indexName: this.config.indexName,
          indexSettings: restoreData.settings
        });
        result.settingsRestored = true;
        this.logger.info("✅ Settings restored");
      }

      // Restore rules
      if (restoreData.rules?.length) {
        this.logger.info("📋 Restoring rules...");
        const cleanedRules = this.cleanRules(restoreData.rules);
        await this.client.saveRules({
          indexName: this.config.indexName,
          rules: cleanedRules,
          clearExistingRules: true
        });
        result.rulesRestored = cleanedRules.length;
        this.logger.info(`✅ Restored ${cleanedRules.length} rules`);
      }

      // Restore synonyms
      if (restoreData.synonyms?.length) {
        this.logger.info("🔗 Restoring synonyms...");
        await this.client.saveSynonyms({
          indexName: this.config.indexName,
          synonymHit: restoreData.synonyms,
          replaceExistingSynonyms: true
        });
        result.synonymsRestored = restoreData.synonyms.length;
        this.logger.info(`✅ Restored ${restoreData.synonyms.length} synonyms`);
      }

    } catch (error) {
      const errorMessage = `Failed to restore index: ${error instanceof Error ? error.message : String(error)}`;
      this.metrics.errors.push(errorMessage);
      this.logger.error(errorMessage);
      throw this.errorHandler.handleProcessingError("Failed to restore index", { indexName: this.config.indexName }, error instanceof Error ? error : undefined);
    }

    return result;
  }

  private logRestoreResults(result: RestoreIndexResult): void {
    this.logger.logRaw("");
    this.logger.logRaw("🔄 Restore Complete!");
    this.logger.logRaw("━".repeat(50));
    this.logger.logRaw(`📊 Records restored: ${result.recordsRestored}`);
    this.logger.logRaw(`📋 Rules restored: ${result.rulesRestored}`);
    this.logger.logRaw(`🔗 Synonyms restored: ${result.synonymsRestored}`);
    this.logger.logRaw(`⚙️ Settings restored: ${result.settingsRestored ? 'Yes' : 'No'}`);
    this.logger.logRaw(`📁 Input directory: ${result.inputDirectory}`);

    if (this.metrics.errors.length === 0) {
      this.logger.logRaw("");
      this.logger.success("✅ Index restored successfully");
    }
  }
}

// Legacy function for backward compatibility
export async function restoreIndex(options: RestoreIndexOptions = {}): Promise<ActionResult<RestoreIndexResult>> {
  const action = new RestoreIndexAction(options);
  return action.execute();
}