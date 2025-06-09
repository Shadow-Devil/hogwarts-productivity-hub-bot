const { SlashCommandBuilder } = require('discord.js');
const voiceService = require('../services/voiceService');
const { createHouseTemplate, createChampionTemplate, createErrorTemplate } = require('../utils/embedTemplates');
const { BotColors, StatusEmojis } = require('../utils/visualHelpers');
const { safeDeferReply, safeReply, safeErrorReply, fastMemberFetch } = require('../utils/interactionUtils');

module.exports = {
    data: new SlashCommandBuilder()
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
    async execute(interaction) {
        try {
            // Immediately defer to prevent timeout
            const deferred = await safeDeferReply(interaction);
            if (!deferred) {
                console.warn('Failed to defer housepoints interaction');
                return;
            }

            const leaderboardType = interaction.options.getString('type');
            
            if (leaderboardType === 'housechampion') {
                await showHouseChampions(interaction);
            } else {
                await showHouseLeaderboard(interaction, leaderboardType);
            }

        } catch (error) {
            console.error('Error in housepoints command:', error);
            
            const embed = createErrorTemplate(
                'House Points Load Failed',
                'An error occurred while fetching house leaderboard data. Please try again in a moment.',
                { helpText: 'If this problem persists, contact support' }
            );
            
            await safeErrorReply(interaction, embed);
        }
    }
};

async function showHouseLeaderboard(interaction, type) {
    const houseLeaderboard = await voiceService.getHouseLeaderboard(type);

    if (!houseLeaderboard || houseLeaderboard.length === 0) {
        const embed = createErrorTemplate(
            `${StatusEmojis.INFO} No House Data`,
            'No house data is available yet. Houses need to earn points first!',
            { 
                helpText: 'Join a voice channel and complete tasks to start earning house points',
                additionalInfo: 'House points are awarded for voice time and task completion.'
            }
        );
        return interaction.editReply({ embeds: [embed] });
    }

    // Get current user's house for personalization (optimized)
    const currentUserId = interaction.user.id;
    const userMember = await fastMemberFetch(interaction.guild, currentUserId, true);
    let userHouse = null;
    
    if (userMember) {
        const { getUserHouse } = require('../models/db');
        userHouse = await getUserHouse(userMember);
    }

    const embed = createHouseTemplate(houseLeaderboard, type, {
        includeStats: true,
        useEnhancedLayout: true,
        useTableFormat: true
    });

    await interaction.editReply({ embeds: [embed] });
}

async function showHouseChampions(interaction) {
    const monthlyChampions = await voiceService.getHouseChampions('monthly');
    const allTimeChampions = await voiceService.getHouseChampions('alltime');

    if ((!monthlyChampions || monthlyChampions.length === 0) && 
        (!allTimeChampions || allTimeChampions.length === 0)) {
        const embed = createErrorTemplate(
            `${StatusEmojis.INFO} No Champions Data`,
            'No house champions data available yet. Users need to earn points first!',
            { 
                helpText: 'Join a voice channel and complete tasks to start earning house points',
                additionalInfo: 'House champions are the highest point earners in each house.'
            }
        );
        return interaction.editReply({ embeds: [embed] });
    }

    // Get current user's house for personalization (optimized)
    const currentUserId = interaction.user.id;
    const userMember = await fastMemberFetch(interaction.guild, currentUserId, true);
    let userHouse = null;
    
    if (userMember) {
        const { getUserHouse } = require('../models/db');
        userHouse = await getUserHouse(userMember);
    }

    const embed = createChampionTemplate(monthlyChampions, allTimeChampions, {
        house: userHouse
    }, {
        useEnhancedLayout: true,
        useTableFormat: true,
        showUserInfo: true
    });

    await interaction.editReply({ embeds: [embed] });
}
