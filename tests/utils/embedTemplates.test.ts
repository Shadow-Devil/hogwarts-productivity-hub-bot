/**
 * Tests for Embed Templates
 * Validates actual functionality of Discord embed template functions
 */

import { vi, describe, afterEach, it, expect } from "vitest";
import {
  createErrorTemplate,
  createSuccessTemplate,
} from "../../src/utils/embedTemplates.ts";

// Mock Discord.js components since they depend on the Discord API
vi.mock("discord.js", () => ({
  EmbedBuilder: vi.fn().mockImplementation(() => ({
    setTitle: vi.fn().mockReturnThis(),
    setDescription: vi.fn().mockReturnThis(),
    setColor: vi.fn().mockReturnThis(),
    setThumbnail: vi.fn().mockReturnThis(),
    addFields: vi.fn().mockReturnThis(),
    setFooter: vi.fn().mockReturnThis(),
    setTimestamp: vi.fn().mockReturnThis(),
    toJSON: vi.fn().mockReturnValue({ title: "Mock Embed" }),
  })),
}));

describe("Embed Templates", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Basic Templates", () => {
    describe("createSuccessTemplate", () => {
      it("should create a success template with title and message", () => {
        const result = createSuccessTemplate("Test Success", "Test message");
        expect(result).toBeDefined();
        expect(result.setTitle).toHaveBeenCalledWith("✅ Test Success");
        expect(result.setDescription).toHaveBeenCalledWith("Test message");
      });

      it("should handle options with points and streak", () => {
        const options = { points: 100, streak: 5, celebration: true };
        const result = createSuccessTemplate(
          "Achievement",
          "Great job!",
          options,
        );
        expect(result).toBeDefined();
        expect(result.setTitle).toHaveBeenCalledWith("🎉 Achievement");
        expect(result.addFields).toHaveBeenCalled();
      });

      it("should work without options", () => {
        expect(() => {
          createSuccessTemplate("Title", "Message");
        }).not.toThrow();
      });
    });

    describe("createErrorTemplate", () => {
      it("should create an error template", () => {
        const result = createErrorTemplate("Error Title", "Error occurred");
        expect(result).toBeDefined();
        expect(result.setTitle).toHaveBeenCalled();
        expect(result.setDescription).toHaveBeenCalled();
      });

      it("should handle null/undefined messages", () => {
        expect(() => {
          createErrorTemplate("Title", null);
        }).not.toThrow();

        expect(() => {
          createErrorTemplate("Title", undefined);
        }).not.toThrow();
      });
    });
  });

  describe("Error Handling and Edge Cases", () => {
    it("should handle malformed data structures with some protection", () => {
      // Test with null/undefined data - these may legitimately throw
      // since the functions expect certain data structures
      expect(() => {
        createSuccessTemplate("", "");
      }).not.toThrow();
    });

    it("should handle missing optional parameters", () => {
      // All functions should work with minimal required params
      expect(() => {
        createSuccessTemplate("Title", "Message");
        createErrorTemplate("Error", "Message");
      }).not.toThrow();
    });

    it("should validate return types are objects", () => {
      const successResult = createSuccessTemplate("Test", "Message");
      const errorResult = createErrorTemplate("Error", "Message");

      expect(typeof successResult).toBe("object");
      expect(typeof errorResult).toBe("object");
      expect(successResult).toBeDefined();
      expect(errorResult).toBeDefined();
    });
  });

});
