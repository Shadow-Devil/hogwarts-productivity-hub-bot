const { REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const commands = [
    new SlashCommandBuilder()
        .setName('timer')
        .setDescription('Start a work + break timer')
        .addIntegerOption(opt =>
            opt.setName('work')
                .setDescription('Work time in minutes (min 20)')
                .setRequired(true)
                .setMinValue(20))
        .addIntegerOption(opt =>
            opt.setName('break')
                .setDescription('Break time in minutes (optional, min 5)')
                .setRequired(false)
                .setMinValue(5)),

    new SlashCommandBuilder()
        .setName('stoptimer')
        .setDescription('Stop the active timer in your voice channel'),

    new SlashCommandBuilder()
        .setName('time')
        .setDescription('Check remaining time of current work/break session'),

    new SlashCommandBuilder()
        .setName('debug')
        .setDescription('Debug voice channel detection'),

    new SlashCommandBuilder()
        .setName('stats')
        .setDescription('View your voice channel time and streak statistics'),

    new SlashCommandBuilder()
        .setName('performance')
        .setDescription('Check bot health and performance status'),

    new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View voice channel time leaderboards')
        .addStringOption(option =>
            option
                .setName('type')
                .setDescription('Choose leaderboard type')
                .setRequired(true)
                .addChoices(
                    { name: '📅 Monthly', value: 'monthly' },
                    { name: '🌟 All Time', value: 'alltime' }
                )),

    new SlashCommandBuilder()
        .setName('housepoints')
        .setDescription('View house point leaderboards and champions')
        .addStringOption(option =>
            option
                .setName('type')
                .setDescription('Choose leaderboard type')
                .setRequired(true)
                .addChoices(
                    { name: '🏆 Monthly House Rankings', value: 'monthly' },
                    { name: '⭐ All Time House Rankings', value: 'alltime' },
                    { name: '👑 House Champions', value: 'housechampion' }
                )),

    new SlashCommandBuilder()
        .setName('addtask')
        .setDescription('Add a new task to your personal to-do list')
        .addStringOption(option =>
            option
                .setName('title')
                .setDescription('The task description')
                .setRequired(true)
                .setMaxLength(500)),

    new SlashCommandBuilder()
        .setName('removetask')
        .setDescription('Remove a task from your to-do list')
        .addIntegerOption(option =>
            option
                .setName('number')
                .setDescription('The task number to remove (use /viewtasks to see numbers)')
                .setRequired(true)
                .setMinValue(1)),

    new SlashCommandBuilder()
        .setName('viewtasks')
        .setDescription('View all your tasks with their numbers'),

    new SlashCommandBuilder()
        .setName('completetask')
        .setDescription('Mark a task as complete and earn 2 points')
        .addIntegerOption(option =>
            option
                .setName('number')
                .setDescription('The task number to complete (use /viewtasks to see numbers)')
                .setRequired(true)
                .setMinValue(1)),

    new SlashCommandBuilder()
        .setName('cache')
        .setDescription('Manage bot cache system (Admin only)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('View cache statistics and performance metrics'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Clear all cached data')),

    new SlashCommandBuilder()
        .setName('health')
        .setDescription('Check bot health and system status')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type of health check to perform')
                .addChoices(
                    { name: 'Overview', value: 'overview' },
                    { name: 'Detailed', value: 'detailed' },
                    { name: 'Database', value: 'database' },
                    { name: 'Performance', value: 'performance' }
                )),

    new SlashCommandBuilder()
        .setName('memory')
        .setDescription('Show detailed memory usage information'),

    new SlashCommandBuilder()
        .setName('recovery')
        .setDescription('View session recovery system status and force operations')
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('View session recovery system status'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('save')
                .setDescription('Force save current session states')),

].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('🚀 Discord Bot Command Registration');
        console.log('═'.repeat(50));
        console.log('⏳ Starting command registration process...');
        console.log(`📝 Registering ${commands.length} slash commands`);
        console.log('🎯 Target: Guild-specific commands');
        console.log('');
        
        // List all commands being registered
        console.log('📋 Commands to register:');
        commands.forEach((cmd, index) => {
            console.log(`   ${(index + 1).toString().padStart(2, '0')}. /${cmd.name} - ${cmd.description}`);
        });
        console.log('');

        console.log('🔄 Sending registration request to Discord API...');
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands },
        );

        console.log('✅ Successfully registered all slash commands!');
        console.log('🎉 Bot commands are now available in your Discord server');
        console.log('═'.repeat(50));
    } catch (error) {
        console.log('❌ Command Registration Failed');
        console.log('═'.repeat(50));
        console.error('💥 Error details:', error.message);
        console.error('🔍 Full error:', error);
        console.log('🔧 Check your bot token, client ID, and guild ID in .env file');
        console.log('═'.repeat(50));
        process.exit(1);
    }
})();
