import { generateUid } from "./uuidUtils";

export interface AlgoliaRecord {
  objectID: string;
  title?: string;
  slug?: string;
  resourceType?: string;
  extUrl?: string;
  publishedDate?: string | number;
  [key: string]: unknown;
}

export interface ProcessingMetrics {
  totalRecords: number;
  processedRecords: number;
  recordsWithChanges: number;
  recordsWithoutTitle: number;
  batchesProcessed: number;
  errors: string[];
}

export interface ResourceTypeConfig {
  resourceType: string;
  schemaPath: string;
}

export interface ActionConfig {
  appId: string;
  apiKey: string;
  indexName: string;
  dryRun?: boolean;
  batchSize?: number;
}

export interface DateProcessingMetrics extends ProcessingMetrics {
  fieldFound: number;
  fieldEmpty: number;
  fieldValidTimestamps: number;
  fieldConvertibleDates: number;
  fieldInvalidDates: number;
}

/**
 * Validate the record to ensure it is an AlgoliaRecord
 * @param record - The record to validate
 * @returns True if the record is an AlgoliaRecord, false otherwise
 */
export function validateRecordWhereResourceTypeIsNotEmpty(
  record: unknown
): record is AlgoliaRecord {
  return (
    typeof record === "object" &&
    record !== null &&
    "objectID" in record &&
    "resourceType" in record &&
    "title" in record &&
    typeof (record as { objectID: unknown }).objectID === "string" &&
    typeof (record as { resourceType: unknown }).resourceType === "string" &&
    typeof (record as { title: unknown }).title === "string" &&
    (record as { resourceType: unknown }).resourceType !== "" &&
    (record as { title: unknown }).title !== "" &&
    generateUid((record as { title: unknown }).title as string) ===
      record.objectID
  );
}

export function validateRecordWhereResourceTypeIsEmpty(
  record: unknown
): record is AlgoliaRecord {
  return (
    typeof record === "object" &&
    record !== null &&
    "objectID" in record &&
    "resourceType" in record &&
    "title" in record &&
    typeof (record as { objectID: unknown }).objectID === "string" &&
    typeof (record as { resourceType: unknown }).resourceType === "string" &&
    typeof (record as { title: unknown }).title === "string" &&
    (record as { resourceType: unknown }).resourceType === "" &&
    (record as { title: unknown }).title !== "" &&
    generateUid((record as { title: unknown }).title as string) ===
      record.objectID
  );
}

/**
 * Validate the record to ensure it is an AlgoliaRecord
 * @param record - The record to validate
 * @returns True if the record is an AlgoliaRecord, false otherwise
 */
export function validateRecordWithSlug(
  record: unknown
): record is AlgoliaRecord {
  return (
    typeof record === "object" &&
    record !== null &&
    "objectID" in record &&
    "slug" in record &&
    "title" in record &&
    typeof (record as { objectID: unknown }).objectID === "string" &&
    typeof (record as { slug: unknown }).slug === "string" &&
    typeof (record as { title: unknown }).title === "string" &&
    (record as { slug: unknown }).slug !== "" &&
    (record as { title: unknown }).title !== "" &&
    generateUid((record as { title: unknown }).title as string) ===
      record.objectID
  );
}
