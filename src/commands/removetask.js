const { SlashCommandBuilder } = require('discord.js');
const taskService = require('../services/taskService');
const { createSuccessTemplate, createErrorTemplate } = require('../utils/embedTemplates');
const { BotColors, StatusEmojis } = require('../utils/visualHelpers');
const { safeDeferReply, safeErrorReply } = require('../utils/interactionUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('removetask')
        .setDescription('Remove a task from your to-do list')
        .addIntegerOption(option =>
            option
                .setName('number')
                .setDescription('The task number to remove (use /viewtasks to see numbers)')
                .setRequired(true)
                .setMinValue(1)),
    async execute(interaction) {
        try {
            // Immediately defer to prevent timeout
            const deferred = await safeDeferReply(interaction);
            if (!deferred) {
                console.warn('Failed to defer removetask interaction');
                return;
            }

            const discordId = interaction.user.id;
            const taskNumber = interaction.options.getInteger('number');

            const result = await taskService.removeTask(discordId, taskNumber);

            if (result.success) {
                const embed = createSuccessTemplate(
                    `🗑️ Task Removed Successfully`,
                    `**${result.message}**\n\nThe task has been permanently removed from your to-do list.`,
                    {
                        helpText: 'Use `/viewtasks` to see your updated task list',
                        additionalInfo: 'Consider completing tasks instead of removing them to earn points!'
                    }
                );
                return interaction.editReply({ embeds: [embed] });
            } else {
                const embed = createErrorTemplate(
                    `${StatusEmojis.FAILED} Task Removal Failed`,
                    result.message,
                    { helpText: 'Use `/viewtasks` to check your task numbers' }
                );
                return interaction.editReply({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Error in /removetask:', error);
            
            const embed = createErrorTemplate(
                'Task Removal Error',
                'An unexpected error occurred while removing your task. Please try again in a moment.',
                { helpText: 'If this problem persists, contact support' }
            );
            
            await safeErrorReply(interaction, embed);
        }
    }
};
