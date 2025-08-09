import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(customParseFormat);

export function isValidUnixTimestamp(timestamp: number): boolean {
  if (!Number.isInteger(timestamp) || timestamp < 0) {
    return false;
  }
  
  const date = dayjs.unix(timestamp);
  return date.isValid() && timestamp >= 0 && timestamp <= 2147483647;
}

export function convertMsToSeconds(timestampMs: number): number {
  return Math.floor(timestampMs / 1000);
}

export function dateStringToUnixTimestamp(
  dateString: string, 
  format: string = 'YYYY-MM-DD'
): number {
  const date = dayjs(dateString, format, true);
  
  if (!date.isValid()) {
    throw new Error(`Invalid date string: ${dateString} with format: ${format}`);
  }
  
  return date.unix();
}

export function normalizeTimestamp(input: number): number {
  if (input > 9999999999) {
    return convertMsToSeconds(input);
  }
  return input;
}