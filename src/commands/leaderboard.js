const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const voiceService = require('../services/voiceService');
const { createLeaderboardTemplate, createErrorTemplate } = require('../utils/embedTemplates');
const { BotColors, StatusEmojis } = require('../utils/visualHelpers');
const { safeDeferReply, safeErrorReply } = require('../utils/interactionUtils');

module.exports = {
    data: new SlashCommandBuilder()
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
    async execute(interaction) {
        try {
            // Immediately defer to prevent timeout
            const deferred = await safeDeferReply(interaction);
            if (!deferred) {
                console.warn('Failed to defer leaderboard interaction');
                return;
            }

            const leaderboardType = interaction.options.getString('type');
            const leaderboard = await voiceService.getLeaderboard(leaderboardType);

            if (!leaderboard || leaderboard.length === 0) {
                const embed = createErrorTemplate(
                    `${StatusEmojis.INFO} No Leaderboard Data`,
                    'No data is available for the leaderboard yet. Be the first to start tracking your voice time!',
                    { 
                        helpText: 'Join a voice channel to start accumulating hours',
                        additionalInfo: 'Your time in voice channels automatically contributes to both monthly and all-time rankings.'
                    }
                );
                await interaction.editReply({ embeds: [embed] });
                return;
            }

            // Get current user's position
            const currentUserId = interaction.user.id;
            const userPosition = leaderboard.findIndex(entry => entry.discord_id === currentUserId) + 1;

            // Create enhanced leaderboard using our template with new features
            const embed = createLeaderboardTemplate(leaderboardType, leaderboard, {
                id: currentUserId,
                username: interaction.user.username
            }, {
                maxEntries: 10,
                showUserPosition: true,
                includeMedals: true,
                includeStats: true,
                useEnhancedLayout: true,
                useTableFormat: true
            });

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in /leaderboard:', error);
            
            const embed = createErrorTemplate(
                'Leaderboard Load Failed',
                'An error occurred while fetching the leaderboard data. Please try again in a moment.',
                { helpText: 'If this problem persists, contact support' }
            );
            
            await safeErrorReply(interaction, embed);
        }
    }
};
