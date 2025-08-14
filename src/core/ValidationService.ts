import { AlgoliaRecord } from "../utils/types";
import { generateUid } from "../utils/uuidUtils";

export interface ValidationRule<T = any> {
  name: string;
  validate: (value: T) => boolean;
  message?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class ValidationService {
  static validateBasicRecord(record: unknown): record is AlgoliaRecord {
    return (
      typeof record === "object" &&
      record !== null &&
      "objectID" in record &&
      typeof (record as { objectID: unknown }).objectID === "string"
    );
  }

  static validateRecordWithTitle(
    record: unknown
  ): record is AlgoliaRecord & { title: string } {
    return (
      this.validateBasicRecord(record) &&
      "title" in record &&
      typeof (record as { title: unknown }).title === "string" &&
      (record as { title: string }).title.trim() !== ""
    );
  }

  static validateRecordWithResourceType(
    record: unknown
  ): record is AlgoliaRecord & { resourceType: string } {
    return (
      this.validateBasicRecord(record) &&
      "resourceType" in record &&
      typeof (record as { resourceType: unknown }).resourceType === "string" &&
      (record as { resourceType: string }).resourceType.trim() !== ""
    );
  }

  static validateRecordWithSlug(
    record: unknown
  ): record is AlgoliaRecord & { slug: string } {
    return (
      this.validateBasicRecord(record) &&
      "slug" in record &&
      typeof (record as { slug: unknown }).slug === "string" &&
      (record as { slug: string }).slug.trim() !== ""
    );
  }

  static validateObjectIdMatchesTitle(
    record: AlgoliaRecord & { title: string }
  ): boolean {
    return record.objectID === generateUid(record.title);
  }

  static validateObjectIdMatchesSlug(
    record: AlgoliaRecord & { slug: string }
  ): boolean {
    return record.objectID === generateUid(record.slug);
  }

  static validateEnvironmentVariables(required: string[]): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const envVar of required) {
      const value = process.env[envVar];
      if (!value) {
        errors.push(`Missing required environment variable: ${envVar}`);
      } else if (value.trim() === "") {
        warnings.push(`Environment variable ${envVar} is empty`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  static validateResourceTypeMapping(
    mappingStr: string | undefined
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!mappingStr) {
      errors.push(
        "RESOURCE_TYPE_SCHEMA_PATH_MAPPING environment variable is required"
      );
      return { isValid: false, errors, warnings };
    }

    try {
      const mapping = JSON.parse(mappingStr);

      if (typeof mapping !== "object" || mapping === null) {
        errors.push(
          "RESOURCE_TYPE_SCHEMA_PATH_MAPPING must be a valid JSON object"
        );
        return { isValid: false, errors, warnings };
      }

      const entries = Object.entries(mapping);
      if (entries.length === 0) {
        warnings.push("RESOURCE_TYPE_SCHEMA_PATH_MAPPING is empty");
      }

      for (const [resourceType, config] of entries) {
        if (!resourceType || resourceType.trim() === "") {
          errors.push("Resource type cannot be empty");
          continue;
        }

        if (typeof config !== "object" || config === null) {
          errors.push(
            `Invalid configuration for resource type: ${resourceType}`
          );
          continue;
        }

        if (
          !("schemaPath" in config) ||
          typeof (config as any).schemaPath !== "string"
        ) {
          errors.push(
            `Missing or invalid schemaPath for resource type: ${resourceType}`
          );
        }
      }
    } catch (error) {
      errors.push(
        `Invalid JSON format in RESOURCE_TYPE_SCHEMA_PATH_MAPPING: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  static createCustomValidator<T>(
    rules: ValidationRule<T>[]
  ): (value: T) => ValidationResult {
    return (value: T) => {
      const errors: string[] = [];
      const warnings: string[] = [];

      for (const rule of rules) {
        if (!rule.validate(value)) {
          errors.push(
            rule.message || `Validation failed for rule: ${rule.name}`
          );
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
      };
    };
  }
}
