require('dotenv').config();
const { Client, IntentsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');
const { initializeDatabase } = require('./models/db');
const { measureCommand, performanceMonitor } = require('./utils/performanceMonitor');
const monthlyResetScheduler = require('./utils/monthlyReset');

const client = new Client({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.MessageContent,
        IntentsBitField.Flags.GuildMembers,
        IntentsBitField.Flags.GuildVoiceStates, // Required for voice channel detection
    ]
});

// Load commands asynchronously
client.commands = new Collection();

async function loadCommands() {
    const commandsPath = path.join(__dirname, 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    
    const loadPromises = commandFiles.map(async (file) => {
        try {
            const command = require(path.join(commandsPath, file));
            if (command.data && command.data.name) {
                client.commands.set(command.data.name, command);
                return command.data.name;
            } else {
                console.warn(`⚠️ Command file ${file} is missing data or data.name property`);
                return null;
            }
        } catch (error) {
            console.error(`❌ Error loading command file ${file}:`, error);
            return null;
        }
    });
    
    const commandNames = (await Promise.all(loadPromises)).filter(Boolean);
    console.log(`📋 Loaded ${commandNames.length} commands: ${commandNames.join(', ')}`);
}

async function loadEvents() {
    const eventsPath = path.join(__dirname, 'events');
    if (fs.existsSync(eventsPath)) {
        const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
        
        const loadPromises = eventFiles.map(async (file) => {
            try {
                const event = require(path.join(eventsPath, file));
                if (event.name && event.execute) {
                    client.on(event.name, (...args) => event.execute(...args));
                    return event.name;
                } else {
                    console.warn(`⚠️ Event file ${file} is missing name or execute property`);
                    return null;
                }
            } catch (error) {
                console.error(`❌ Error loading event file ${file}:`, error);
                return null;
            }
        });
        
        const eventNames = (await Promise.all(loadPromises)).filter(Boolean);
        if (eventNames.length > 0) {
            console.log(`🎯 Loaded ${eventNames.length} events: ${eventNames.join(', ')}`);
        }
    }
}

const activeVoiceTimers = new Map(); // key: voiceChannelId, value: { workTimeout, breakTimeout, phase, endTime }

// Bot login

client.on('ready', async (c) => {
    console.log(`🤖 ${c.user.tag} initializing...`);
    
    try {
        // Initialize database
        await initializeDatabase();
        
        // Start performance monitoring and monthly reset scheduler
        monthlyResetScheduler.start();
        
        console.log(`🚀 ${c.user.tag} is ready! | ${client.commands.size} commands | Performance monitoring active`);
    } catch (error) {
        console.error('❌ Failed to initialize bot:', error);
        process.exit(1);
    }
});

// Add voice state update logging for debugging (only when significant changes occur)
client.on('voiceStateUpdate', (oldState, newState) => {
    const user = newState.member?.user?.tag || oldState.member?.user?.tag || 'Unknown User';
    const oldChannel = oldState.channel?.name || null;
    const newChannel = newState.channel?.name || null;
    
    if (oldChannel !== newChannel && (oldChannel || newChannel)) {
        const action = !oldChannel ? 'joined' : !newChannel ? 'left' : 'moved to';
        const channel = newChannel || oldChannel;
        console.log(`🎤 ${user} ${action} "${channel}"`);
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    
    // Wrap command execution with performance monitoring
    const wrappedExecute = measureCommand(interaction.commandName, command.execute);
    
    try {
        await wrappedExecute(interaction, { activeVoiceTimers });
    } catch (error) {
        console.error(`Error executing command ${interaction.commandName}:`, error);
        if (!interaction.replied && !interaction.deferred) {
            try {
                await interaction.reply({
                    content: '❌ An error occurred. Please try again later.',
                    ephemeral: true,
                });
            } catch (err) {
                console.error('Error sending fallback error reply:', err);
            }
        }
    }
});

// Initialize bot asynchronously
async function initializeBot() {
    try {
        console.log('🔄 Loading bot components...');
        await Promise.all([loadCommands(), loadEvents()]);
        
        await client.login(process.env.DISCORD_TOKEN);
    } catch (error) {
        console.error('❌ Failed to initialize bot:', error);
        process.exit(1);
    }
}

// Start the bot
initializeBot();

// Graceful shutdown handlers
process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    monthlyResetScheduler.stop();
    performanceMonitor.cleanup();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    monthlyResetScheduler.stop();
    performanceMonitor.cleanup();
    process.exit(0);
});

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});