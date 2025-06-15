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
                const dayjs = require('dayjs');
                const resetTime = Math.floor(dayjs().add(1, 'day').startOf('day').valueOf() / 1000);

                // Create slot information with reclaim status
                let slotInfo = '';
                let additionalInfo = '';

                if (result.stats) {
                    const slotReclaimedText = result.slotReclaimed ?
                        ' ✨ **Slot Reclaimed!**' :
                        result.slotReclaimed === false && result.maxRecoverableSlots !== undefined ?
                            ' 🚫 **Slot Not Reclaimed**' :
                            '';
                    slotInfo = `\n\n**Daily Task Slots:** ${result.stats.remaining}/${result.stats.limit} remaining • **Resets:** <t:${resetTime}:R>${slotReclaimedText}`;
                }

                // Enhanced additional info based on reclaim status
                if (result.slotReclaimed) {
                    additionalInfo = 'Since this task was added today, you\'ve regained a task slot!';
                } else if (result.slotReclaimed === false && result.maxRecoverableSlots !== undefined) {
                    additionalInfo = `**Slot Recovery Limit:** You can only recover up to ${result.maxRecoverableSlots} slots today (you've completed ${result.tasksCompleted} tasks). This prevents exceeding your daily limit after earning points.`;
                } else {
                    additionalInfo = 'Consider completing tasks instead of removing them to earn points!';
                }

                const embed = createSuccessTemplate(
                    'Task Removed Successfully',
                    `**${result.message}**\n\nThe task has been permanently removed from your to-do list.${slotInfo}`,
                    {
                        helpText: 'Use `/viewtasks` to see your updated task list',
                        additionalInfo: additionalInfo
                    }
                );
                return interaction.editReply({ embeds: [embed] });
            } else {
                const embed = createErrorTemplate(
                    'Task Removal Failed',
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
