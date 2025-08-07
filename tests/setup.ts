/**
 * Jest Test Setup
 * Global test configuration and mocks
 */
import { afterEach, jest } from '@jest/globals';

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'discord_bot_test';
process.env.DISCORD_TOKEN = 'test-token';

// Global test timeout
jest.setTimeout(30000);

// Mock console methods in tests to reduce noise
global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

// Mock Discord.js for testing
jest.mock('discord.js', () => ({
    Client: jest.fn(() => ({
        commands: new Map(),
        login: jest.fn(),
        on: jest.fn(),
        user: { id: 'test-bot-id' }
    })),
    IntentsBitField: {
        Flags: {
            Guilds: 1,
            GuildMessages: 2,
            MessageContent: 4,
            GuildMembers: 8,
            GuildVoiceStates: 16
        }
    },
    SlashCommandBuilder: jest.fn(() => ({
        setName: jest.fn().mockReturnThis(),
        setDescription: jest.fn().mockReturnThis(),
        addStringOption: jest.fn().mockReturnThis(),
        addIntegerOption: jest.fn().mockReturnThis(),
        addBooleanOption: jest.fn().mockReturnThis(),
        toJSON: jest.fn(() => ({}))
    })),
    EmbedBuilder: jest.fn(() => ({
        setTitle: jest.fn().mockReturnThis(),
        setDescription: jest.fn().mockReturnThis(),
        setColor: jest.fn().mockReturnThis(),
        addFields: jest.fn().mockReturnThis(),
        setFooter: jest.fn().mockReturnThis(),
        setTimestamp: jest.fn().mockReturnThis()
    })),
    Collection: Map
}));

// Cleanup after each test
afterEach(() => {
    jest.clearAllMocks();
});
