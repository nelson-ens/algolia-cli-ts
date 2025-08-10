import { Logger } from "../core/Logger";
import { AppErrorHandler, ErrorCode } from "../core/ErrorHandler";
import { promptUser } from "../utils/prompt";
import { generateUid } from "../utils/uuidUtils";

interface GenerateUuidOptions {
  input?: string;
  interactive?: boolean;
}

interface GenerateUuidResult {
  input: string;
  uuid: string;
  success: boolean;
}

export class GenerateUuidAction {
  private logger: Logger;
  private errorHandler: AppErrorHandler;
  private options: GenerateUuidOptions;

  constructor(options: GenerateUuidOptions = {}) {
    this.options = { interactive: true, ...options };
    this.logger = new Logger();
    this.errorHandler = new AppErrorHandler(this.logger);
  }

  async execute(): Promise<GenerateUuidResult> {
    try {
      this.logger.section("Generate UUID from String");

      const input = await this.getInput();
      
      if (!input) {
        this.errorHandler.handleValidationError("No input provided");
        return { input: "", uuid: "", success: false };
      }

      const uuid = this.generateUuidFromInput(input);
      this.logResult(input, uuid);

      return {
        input,
        uuid,
        success: true,
      };

    } catch (error) {
      this.errorHandler.handleUnknownError(error);
      return {
        input: "",
        uuid: "",
        success: false,
      };
    }
  }

  private async getInput(): Promise<string> {
    if (this.options.input) {
      // Non-interactive mode - input provided directly
      this.logger.info(`📝 Using provided input: ${this.options.input}`);
      return this.options.input.trim();
    }

    if (!this.options.interactive) {
      throw this.errorHandler.createError(
        ErrorCode.VALIDATION_ERROR,
        "No input provided and interactive mode is disabled"
      );
    }

    // Interactive mode - prompt user
    const input = await promptUser("Enter a string to generate UUID from: ");
    return input.trim();
  }

  private generateUuidFromInput(input: string): string {
    try {
      this.validateInput(input);
      return generateUid(input);
    } catch (error) {
      throw this.errorHandler.handleProcessingError(
        "Failed to generate UUID",
        { input },
        error instanceof Error ? error : undefined
      );
    }
  }

  private validateInput(input: string): void {
    if (!input || input.length === 0) {
      throw this.errorHandler.handleValidationError(
        "Input string cannot be empty"
      );
    }

    if (input.length > 10000) {
      this.logger.warn("Input string is very long, this might not be intended");
    }

    // Log input characteristics for debugging
    this.logger.debug("Input analysis", {
      length: input.length,
      hasSpecialChars: /[^a-zA-Z0-9\s]/.test(input),
      startsWithSpace: input.startsWith(' '),
      endsWithSpace: input.endsWith(' '),
    });
  }

  private logResult(input: string, uuid: string): void {
    console.log("");
    console.log("📈 Result:");
    console.log("━".repeat(50));
    console.log(`📝 Input: ${input}`);
    console.log(`🔑 Generated UUID: ${uuid}`);
    
    // Additional helpful information
    console.log("");
    console.log("💡 Additional Info:");
    console.log(`   - Input length: ${input.length} characters`);
    console.log(`   - UUID version: v5 (namespace-based)`);
    console.log(`   - Reproducible: Same input always generates same UUID`);
    
    if (this.logger.getErrors().length === 0) {
      this.logger.success("UUID generated successfully");
    }
  }

  // Static helper methods for different use cases
  static async interactive(): Promise<GenerateUuidResult> {
    const action = new GenerateUuidAction({ interactive: true });
    return action.execute();
  }

  static async fromString(input: string): Promise<GenerateUuidResult> {
    const action = new GenerateUuidAction({ input, interactive: false });
    return action.execute();
  }

  static async batch(inputs: string[]): Promise<GenerateUuidResult[]> {
    const results: GenerateUuidResult[] = [];
    
    for (const input of inputs) {
      const result = await GenerateUuidAction.fromString(input);
      results.push(result);
    }

    return results;
  }
}

// Legacy function for backward compatibility
export async function generateUuid(): Promise<void> {
  const action = new GenerateUuidAction({ interactive: true });
  const result = await action.execute();
  
  if (!result.success) {
    process.exit(1);
  }
}

// Enhanced version with more options
export async function generateUuidAdvanced(options: GenerateUuidOptions = {}): Promise<GenerateUuidResult> {
  const action = new GenerateUuidAction(options);
  return action.execute();
}