/**
 * Tests for Visual Helper Utilities
 * Ensures visual formatting functions work correctly
 */

import { describe, expect, it } from "vitest";

import {
  createProgressBar,
} from "../../src/utils/visualHelpers.ts";

describe("Visual Helpers", () => {
  it("should export expected functions", () => {
    expect(typeof createProgressBar).toBe("function");
  });

  describe("createProgressBar", () => {
    it("should create a progress bar with correct percentage", () => {
      const result = createProgressBar(5, 10, 10);
      expect(result).toHaveProperty("bar");
      expect(result).toHaveProperty("percentage");
      expect(result.percentage).toBe("50.0");
    });

    it("should handle edge cases", () => {
      const full = createProgressBar(10, 10, 10);
      expect(full.percentage).toBe("100.0");

      const empty = createProgressBar(0, 10, 10);
      expect(empty.percentage).toBe("0.0");
    });
  });
});
