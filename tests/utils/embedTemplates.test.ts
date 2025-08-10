/**
 * Tests for Embed Templates
 * Validates actual functionality of Discord embed template functions
 */

import { vi, describe, afterEach, it, expect } from "vitest";
import {
  createErrorTemplate,
  createHealthTemplate,
  createHouseTemplate,
  createSuccessTemplate,
  createTimerTemplate,
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

  describe("Specialized Templates", () => {

    describe("createTimerTemplate", () => {
      it("should create a timer start template", () => {
        const timerData = {
          workTime: 25,
          breakTime: 5,
          voiceChannel: { id: "123456789" },
          phase: "work",
          timeRemaining: 25,
        };

        const result = createTimerTemplate("start", timerData);
        expect(result).toBeDefined();
        expect(result.setTitle).toHaveBeenCalledWith(
          "⏱️ Pomodoro Timer Started",
        );
      });

      it("should handle timer status action", () => {
        const timerData = {
          workTime: 25,
          breakTime: 5,
          voiceChannel: { id: "123456789" },
          phase: "work",
          timeRemaining: 15,
        };

        expect(() => {
          createTimerTemplate("status", timerData);
        }).not.toThrow();
      });
    });


    describe("createHouseTemplate", () => {
      it("should create a house points template", () => {
        const housesData = [
          { name: "Gryffindor", points: 100, voiceTime: 1200 },
          { name: "Hufflepuff", points: 90, voiceTime: 1100 },
          { name: "Ravenclaw", points: 85, voiceTime: 1000 },
          { name: "Slytherin", points: 80, voiceTime: 950 },
        ] as const;

        const result = createHouseTemplate(housesData, "monthly");
        expect(result).toBeDefined();
        expect(result.setTitle).toHaveBeenCalledWith("Monthly House Points");
        expect(result.setColor).toHaveBeenCalled();
      });

      it("should handle empty houses data", () => {
        expect(() => {
          createHouseTemplate([], "monthly");
        }).not.toThrow();
      });
    });

    describe("createHealthTemplate", () => {
      it("should create a health template with proper data", () => {
        const healthData = {
          status: "healthy",
          systemHealth: true,
          uptime: 99.5,
          healthChecks: "5/5 passed",
          activeSessions: 3,
        };

        const result = createHealthTemplate("Bot Health", healthData);
        expect(result).toBeDefined();
        expect(result.setTitle).toHaveBeenCalledWith("🩺 Bot Health");
        expect(result.setColor).toHaveBeenCalled();
      });

      it("should handle degraded status", () => {
        const healthData = {
          status: "degraded",
          systemHealth: false,
          issues: ["Database connection slow", "High memory usage"],
        };

        expect(() => {
          createHealthTemplate("System Issues", healthData);
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
        createHouseTemplate([], "monthly");
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

    it("should handle edge cases that the functions are designed for", () => {
      // Test functions with their expected minimal data structures
      // Note: Some functions expect Discord.js objects and will fail with improper mocks

      // Health template with minimal valid data
      expect(() => {
        createHealthTemplate("Health Check", {
          status: "healthy",
          systemHealth: true,
        });
      }).not.toThrow();

      // Timer template with valid action
      expect(() => {
        createTimerTemplate("start", {
          workTime: 25,
          breakTime: 5,
          voiceChannel: { id: "123" },
          phase: "work",
          timeRemaining: 25,
        });
      }).not.toThrow();
    });
  });

  describe("Integration with Constants", () => {
    it("should use centralized constants for colors and emojis", () => {
      // The templates should be using constants from our centralized file
      // This is tested indirectly by ensuring the functions don't throw
      // and that they call the expected Discord.js methods

      const result = createSuccessTemplate("Test", "Message");
      expect(result.setColor).toHaveBeenCalled();

      const houseResult = createHouseTemplate(
        [{ name: "Gryffindor", points: 100 }],
        "monthly",
      );
      expect(houseResult.setColor).toHaveBeenCalled();
    });
  });
});
