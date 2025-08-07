/**
 * Jest Test Setup
 * Global test configuration and mocks
 */
import { afterEach, vi } from "vitest";

// Mock environment variables for testing
process.env.NODE_ENV = "test";
process.env.DB_NAME = "discord_bot_test";
process.env.DISCORD_TOKEN = "test-token";

// Mock console methods in tests to reduce noise
global.console = {
  ...console,
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// Mock Discord.js for testing
vi.mock("discord.js", () => ({
  Client: vi.fn(() => ({
    commands: new Map(),
    login: vi.fn(),
    on: vi.fn(),
    user: { id: "test-bot-id" },
  })),
  IntentsBitField: {
    Flags: {
      Guilds: 1,
      GuildMessages: 2,
      MessageContent: 4,
      GuildMembers: 8,
      GuildVoiceStates: 16,
    },
  },
  SlashCommandBuilder: vi.fn(() => ({
    setName: vi.fn().mockReturnThis(),
    setDescription: vi.fn().mockReturnThis(),
    addStringOption: vi.fn().mockReturnThis(),
    addIntegerOption: vi.fn().mockReturnThis(),
    addBooleanOption: vi.fn().mockReturnThis(),
    toJSON: vi.fn(() => ({})),
  })),
  EmbedBuilder: vi.fn(() => ({
    setTitle: vi.fn().mockReturnThis(),
    setDescription: vi.fn().mockReturnThis(),
    setColor: vi.fn().mockReturnThis(),
    addFields: vi.fn().mockReturnThis(),
    setFooter: vi.fn().mockReturnThis(),
    setTimestamp: vi.fn().mockReturnThis(),
  })),
  Collection: Map,
}));

// Cleanup after each test
afterEach(() => {
  vi.clearAllMocks();
});
