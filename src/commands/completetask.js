const { SlashCommandBuilder } = require('discord.js');
const taskService = require('../services/taskService');
const { getUserVoiceChannel } = require('../utils/voiceUtils');
const { createSuccessTemplate, createErrorTemplate } = require('../utils/embedTemplates');
const { BotColors, StatusEmojis } = require('../utils/visualHelpers');
const { safeDeferReply, safeErrorReply } = require('../utils/interactionUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('completetask')
        .setDescription('Mark a task as complete and earn 2 points')
        .addIntegerOption(option =>
            option
                .setName('number')
                .setDescription('The task number to complete (use /viewtasks to see numbers)')
                .setRequired(true)
                .setMinValue(1)),
    async execute(interaction) {
        try {
            // Immediately defer to prevent timeout
            const deferred = await safeDeferReply(interaction);
            if (!deferred) {
                console.warn('Failed to defer completetask interaction');
                return;
            }

            // Check if user is in a voice channel using the same method as timer commands
            const voiceChannel = await getUserVoiceChannel(interaction);
            
            if (!voiceChannel) {
                const embed = createErrorTemplate(
                    `${StatusEmojis.ERROR} Voice Channel Required`,
                    'You must be in a voice channel to complete tasks and earn points.',
                    { 
                        helpText: 'Join any voice channel first, then try again',
                        additionalInfo: 'This requirement ensures active participation in productive voice sessions.'
                    }
                );
                return interaction.editReply({ embeds: [embed] });
            }

            const discordId = interaction.user.id;
            const taskNumber = interaction.options.getInteger('number');
            const member = interaction.member;

            const result = await taskService.completeTask(discordId, taskNumber, member);

            if (result.success) {
                const embed = createSuccessTemplate(
                    `Task Completed Successfully!`,
                    `**${result.message}**\n\nGreat job on completing your task! Keep up the momentum and continue building your productivity streak.`,
                    {
                        celebration: true,
                        points: 2,
                        includeEmoji: true,
                        useEnhancedLayout: true,
                        useTableFormat: true,
                        showBigNumbers: true
                    }
                );
                return interaction.editReply({ embeds: [embed] });
            } else {
                const embed = createErrorTemplate(
                    `${StatusEmojis.FAILED} Task Completion Failed`,
                    result.message,
                    { helpText: 'Use `/viewtasks` to check your task numbers' }
                );
                return interaction.editReply({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Error in /completetask:', error);
            
            const embed = createErrorTemplate(
                'Task Completion Error',
                'An unexpected error occurred while completing your task. Please try again in a moment.',
                { helpText: 'If this problem persists, contact support' }
            );
            
            await safeErrorReply(interaction, embed);
        }
    }
};
