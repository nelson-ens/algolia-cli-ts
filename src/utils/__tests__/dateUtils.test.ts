import dayjs from "dayjs";
import {
  isValidUnixTimestamp,
  convertMsToSeconds,
  convertMicrosecondsToSeconds,
  dateStringToUnixTimestamp,
  normalizeTimestamp,
} from "../dateUtils";

describe("dateUtils", () => {
  describe("isValidUnixTimestamp", () => {
    it("should return true for valid Unix timestamps", () => {
      expect(isValidUnixTimestamp(0)).toBe(true);
      expect(isValidUnixTimestamp(1609459200)).toBe(true); // 2021-01-01 00:00:00 UTC
      expect(isValidUnixTimestamp(1735689600)).toBe(true); // 2025-01-01 00:00:00 UTC
      expect(isValidUnixTimestamp(2147483647)).toBe(true); // Maximum 32-bit signed integer
    });

    it("should return false for negative timestamps", () => {
      expect(isValidUnixTimestamp(-1)).toBe(false);
      expect(isValidUnixTimestamp(-1000)).toBe(false);
    });

    it("should return false for non-integer values", () => {
      expect(isValidUnixTimestamp(1609459200.5)).toBe(false);
      expect(isValidUnixTimestamp(3.14159)).toBe(false);
    });

    it("should return false for timestamps beyond 32-bit limit", () => {
      expect(isValidUnixTimestamp(2147483648)).toBe(false); // Beyond 32-bit limit
      expect(isValidUnixTimestamp(9999999999)).toBe(false); // Far future timestamp
    });

    it("should return false for invalid numbers", () => {
      expect(isValidUnixTimestamp(NaN)).toBe(false);
      expect(isValidUnixTimestamp(Infinity)).toBe(false);
      expect(isValidUnixTimestamp(-Infinity)).toBe(false);
    });

    it("should handle edge cases around boundaries", () => {
      expect(isValidUnixTimestamp(1)).toBe(true);
      expect(isValidUnixTimestamp(2147483646)).toBe(true);
      expect(isValidUnixTimestamp(2147483647)).toBe(true);
      expect(isValidUnixTimestamp(2147483648)).toBe(false);
    });
  });

  describe("convertMsToSeconds", () => {
    it("should convert milliseconds to seconds correctly", () => {
      expect(convertMsToSeconds(1000)).toBe(1);
      expect(convertMsToSeconds(5000)).toBe(5);
      expect(convertMsToSeconds(1609459200000)).toBe(1609459200);
    });

    it("should floor fractional results", () => {
      expect(convertMsToSeconds(1500)).toBe(1);
      expect(convertMsToSeconds(999)).toBe(0);
      expect(convertMsToSeconds(1999)).toBe(1);
    });

    it("should handle zero and negative values", () => {
      expect(convertMsToSeconds(0)).toBe(0);
      expect(convertMsToSeconds(-1000)).toBe(-1);
      expect(convertMsToSeconds(-1500)).toBe(-2);
    });

    it("should handle large values", () => {
      expect(convertMsToSeconds(9999999999999)).toBe(9999999999);
      expect(convertMsToSeconds(2147483647000)).toBe(2147483647);
      expect(convertMsToSeconds(1386170668800000)).toBe(1386170668800);
    });
  });

  describe("convertMicrosecondsToSeconds", () => {
    it("should convert microseconds to seconds correctly", () => {
      expect(convertMicrosecondsToSeconds(1000000)).toBe(1);
      expect(convertMicrosecondsToSeconds(5000000)).toBe(5);
      expect(convertMicrosecondsToSeconds(1609459200000000)).toBe(1609459200);
    });

    it("should floor fractional results", () => {
      expect(convertMicrosecondsToSeconds(1500000)).toBe(1);
      expect(convertMicrosecondsToSeconds(999999)).toBe(0);
      expect(convertMicrosecondsToSeconds(1999999)).toBe(1);
    });

    it("should handle zero and negative values", () => {
      expect(convertMicrosecondsToSeconds(0)).toBe(0);
      expect(convertMicrosecondsToSeconds(-1000000)).toBe(-1);
      expect(convertMicrosecondsToSeconds(-1500000)).toBe(-2);
    });

    it("should handle large values", () => {
      expect(convertMicrosecondsToSeconds(1386170668800000)).toBe(1386170668);
      expect(convertMicrosecondsToSeconds(2147483647000000)).toBe(2147483647);
    });
  });

  describe("dateStringToUnixTimestamp", () => {
    it("should convert valid date strings with default format", () => {
      const timestamp = dateStringToUnixTimestamp("2021-01-01");
      expect(timestamp).toBe(dayjs("2021-01-01", "YYYY-MM-DD", true).unix());
    });

    it("should convert valid date strings with custom formats", () => {
      expect(dateStringToUnixTimestamp("01/01/2021", "MM/DD/YYYY")).toBe(
        dayjs("01/01/2021", "MM/DD/YYYY", true).unix()
      );
      expect(dateStringToUnixTimestamp("2021-12-25", "YYYY-MM-DD")).toBe(
        dayjs("2021-12-25", "YYYY-MM-DD", true).unix()
      );
      expect(dateStringToUnixTimestamp("25-12-2021", "DD-MM-YYYY")).toBe(
        dayjs("25-12-2021", "DD-MM-YYYY", true).unix()
      );
    });

    it("should handle various date formats", () => {
      expect(dateStringToUnixTimestamp("2021/01/01", "YYYY/MM/DD")).toBe(
        dayjs("2021/01/01", "YYYY/MM/DD", true).unix()
      );
      expect(dateStringToUnixTimestamp("Jan 1, 2021", "MMM D, YYYY")).toBe(
        dayjs("Jan 1, 2021", "MMM D, YYYY", true).unix()
      );
    });

    it("should throw error for invalid date strings", () => {
      expect(() => dateStringToUnixTimestamp("invalid-date")).toThrow(
        "Invalid date string: invalid-date with format: YYYY-MM-DD"
      );
      expect(() => dateStringToUnixTimestamp("2021-13-01")).toThrow(
        "Invalid date string: 2021-13-01 with format: YYYY-MM-DD"
      );
      expect(() => dateStringToUnixTimestamp("2021-02-30")).toThrow(
        "Invalid date string: 2021-02-30 with format: YYYY-MM-DD"
      );
    });

    it("should throw error for date string that does not match format", () => {
      expect(() =>
        dateStringToUnixTimestamp("2021-01-01", "MM/DD/YYYY")
      ).toThrow("Invalid date string: 2021-01-01 with format: MM/DD/YYYY");
      expect(() =>
        dateStringToUnixTimestamp("01/01/2021", "YYYY-MM-DD")
      ).toThrow("Invalid date string: 01/01/2021 with format: YYYY-MM-DD");
    });

    it("should handle empty and null inputs", () => {
      expect(() => dateStringToUnixTimestamp("")).toThrow(
        "Invalid date string:  with format: YYYY-MM-DD"
      );
    });

    it("should handle leap years correctly", () => {
      expect(dateStringToUnixTimestamp("2020-02-29")).toBe(
        dayjs("2020-02-29", "YYYY-MM-DD", true).unix()
      );
      expect(() => dateStringToUnixTimestamp("2021-02-29")).toThrow();
    });
  });

  describe("normalizeTimestamp", () => {
    it("should return timestamp as-is if it is in seconds (10 digits or less)", () => {
      expect(normalizeTimestamp(1609459200)).toBe(1609459200); // 10 digits
      expect(normalizeTimestamp(1000000000)).toBe(1000000000); // 10 digits
      expect(normalizeTimestamp(999999999)).toBe(999999999); // 9 digits
      expect(normalizeTimestamp(0)).toBe(0);
    });

    it("should convert milliseconds to seconds if timestamp is greater than 9999999999", () => {
      expect(normalizeTimestamp(1609459200000)).toBe(1609459200); // 13 digits -> 10 digits
      expect(normalizeTimestamp(10000000000)).toBe(10000000); // 11 digits -> 8 digits
      expect(normalizeTimestamp(99999999999)).toBe(99999999); // 11 digits -> 8 digits
    });

    it("should convert microseconds to seconds if timestamp is greater than 999999999999999", () => {
      expect(normalizeTimestamp(1609459200000000)).toBe(1609459200); // 16 digits -> 10 digits
      expect(normalizeTimestamp(1000000000000000)).toBe(1000000000); // 16 digits -> 10 digits
      expect(normalizeTimestamp(1386170668800000)).toBe(1386170668); // 16 digits -> 10 digits
    });

    it("should handle boundary value correctly", () => {
      expect(normalizeTimestamp(9999999999)).toBe(9999999999); // Exactly 10 digits, should not convert
      expect(normalizeTimestamp(10000000000)).toBe(10000000); // 11 digits, should convert
    });

    it("should handle very large timestamps", () => {
      expect(normalizeTimestamp(2147483647000)).toBe(2147483647); // Max 32-bit int in ms
      expect(normalizeTimestamp(9999999999999)).toBe(9999999999); // Very large ms timestamp
    });

    it("should handle negative values (though not typical for timestamps)", () => {
      expect(normalizeTimestamp(-1)).toBe(-1); // Small negative, return as-is
      expect(normalizeTimestamp(-10000000000)).toBe(-10000000000); // Large negative, return as-is (condition only checks > 9999999999)
    });

    it("should handle zero and small positive values", () => {
      expect(normalizeTimestamp(0)).toBe(0);
      expect(normalizeTimestamp(1)).toBe(1);
      expect(normalizeTimestamp(999)).toBe(999);
    });

    it("should be consistent with convertMsToSeconds for large values", () => {
      const msTimestamp = 1609459200000;
      expect(normalizeTimestamp(msTimestamp)).toBe(
        convertMsToSeconds(msTimestamp)
      );

      const largeMsTimestamp = 9999999999999;
      expect(normalizeTimestamp(largeMsTimestamp)).toBe(
        convertMsToSeconds(largeMsTimestamp)
      );
    });

    it("should be consistent with convertMicrosecondsToSeconds for very large values", () => {
      const microTimestamp = 1609459200000000;
      expect(normalizeTimestamp(microTimestamp)).toBe(
        convertMicrosecondsToSeconds(microTimestamp)
      );

      const largeMicroTimestamp = 1386170668800000;
      expect(normalizeTimestamp(largeMicroTimestamp)).toBe(
        convertMicrosecondsToSeconds(largeMicroTimestamp)
      );

      const largeMicroTimestamp2 = 1384813756800000;
      expect(normalizeTimestamp(largeMicroTimestamp2)).toBe(
        convertMicrosecondsToSeconds(largeMicroTimestamp2)
      );
    });
  });

  describe("integration tests", () => {
    it("should work together for date string normalization workflow", () => {
      const dateString = "2021-01-01";
      const timestamp = dateStringToUnixTimestamp(dateString);
      expect(isValidUnixTimestamp(timestamp)).toBe(true);
      expect(normalizeTimestamp(timestamp)).toBe(timestamp);
    });

    it("should work together for millisecond timestamp normalization", () => {
      const msTimestamp = Date.now();
      const normalized = normalizeTimestamp(msTimestamp);
      expect(isValidUnixTimestamp(normalized)).toBe(true);
      expect(normalized).toBe(convertMsToSeconds(msTimestamp));
    });

    it("should work together for microsecond timestamp normalization", () => {
      const microTimestamp = 1609459200000000; // 16 digits
      const normalized = normalizeTimestamp(microTimestamp);
      expect(isValidUnixTimestamp(normalized)).toBe(true);
      expect(normalized).toBe(convertMicrosecondsToSeconds(microTimestamp));
    });

    it("should handle real-world date scenarios", () => {
      const dates = [
        { string: "2020-01-01", format: "YYYY-MM-DD" },
        { string: "12/25/2021", format: "MM/DD/YYYY" },
        { string: "31-12-2022", format: "DD-MM-YYYY" },
      ];

      dates.forEach(({ string, format }) => {
        const timestamp = dateStringToUnixTimestamp(string, format);
        expect(isValidUnixTimestamp(timestamp)).toBe(true);
        expect(normalizeTimestamp(timestamp * 1000)).toBe(timestamp);
      });
    });
  });
});
