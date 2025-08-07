import { SlashCommandBuilder } from 'discord.js';
import taskService from '../services/taskService';
import { createSuccessTemplate, createErrorTemplate } from '../utils/embedTemplates';
import { StatusEmojis } from '../utils/constants';
import { safeDeferReply, safeErrorReply } from '../utils/interactionUtils';

export default {
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

            const discordId = interaction.user.id;
            const taskNumber = interaction.options.getInteger('number');
            const member = interaction.member;

            const result = await taskService.completeTask(discordId, taskNumber, member);

            if (result.success) {
                const embed = createSuccessTemplate(
                    `${StatusEmojis.COMPLETED} Task Completed Successfully!`,
                    `**${result.message}**\n\n${StatusEmojis.READY} Great job on completing your task! Keep up the momentum and continue building your productivity streak.`,
                    {
                        celebration: true,
                        points: 2,
                        includeEmoji: true,
                        useEnhancedLayout: true,
                        useTableFormat: true,
                        showBigNumbers: true,
                        additionalInfo: `${StatusEmojis.IN_PROGRESS} **Daily Progress:** ${result.stats.total_task_actions}/${result.stats.limit} task actions used • **${result.stats.remaining} remaining**`
                    }
                );
                return interaction.editReply({ embeds: [embed] });
            } else {
                if (result.limitReached) {
                    const dayjs = require('dayjs');
                    const resetTime = Math.floor(dayjs().add(1, 'day').startOf('day').valueOf() / 1000);

                    const embed = createErrorTemplate(
                        `${StatusEmojis.WARNING} Daily Task Limit Reached`,
                        result.message,
                        {
                            helpText: `${StatusEmojis.INFO} Daily Progress: ${result.stats.currentActions}/${result.stats.limit} task actions used`,
                            additionalInfo: `**Remaining:** ${result.stats.remaining} actions\n**Resets:** <t:${resetTime}:R>`
                        }
                    );
                    return interaction.editReply({ embeds: [embed] });
                } else {
                    const embed = createErrorTemplate(
                        `${StatusEmojis.ERROR} Task Completion Failed`,
                        result.message,
                        { helpText: `${StatusEmojis.INFO} Use \`/viewtasks\` to check your task numbers` }
                    );
                    return interaction.editReply({ embeds: [embed] });
                }
            }
        } catch (error) {
            console.error('Error in /completetask:', error);

            const embed = createErrorTemplate(
                `${StatusEmojis.ERROR} Task Completion Error`,
                'An unexpected error occurred while completing your task. Please try again in a moment.',
                { helpText: `${StatusEmojis.INFO} If this problem persists, contact support` }
            );

            await safeErrorReply(interaction, embed);
        }
    }
};
