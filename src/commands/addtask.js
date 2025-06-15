const { SlashCommandBuilder } = require('discord.js');
const taskService = require('../services/taskService');
const { createSuccessTemplate, createErrorTemplate } = require('../utils/embedTemplates');
const { BotColors, StatusEmojis } = require('../utils/visualHelpers');
const { safeDeferReply, safeErrorReply } = require('../utils/interactionUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addtask')
        .setDescription('Add a new task to your personal to-do list')
        .addStringOption(option =>
            option
                .setName('title')
                .setDescription('The task description')
                .setRequired(true)
                .setMaxLength(500)),
    async execute(interaction) {
        try {
            // Immediately defer to prevent timeout
            const deferred = await safeDeferReply(interaction);
            if (!deferred) {
                console.warn('Failed to defer addtask interaction');
                return;
            }

            const discordId = interaction.user.id;
            const title = interaction.options.getString('title');

            // Validate title length and content
            if (title.trim().length === 0) {
                const embed = createErrorTemplate(
                    'Invalid Task Title',
                    'Task title cannot be empty. Please provide a meaningful description for your task.',
                    { helpText: 'Try: `/addtask Write project proposal`' }
                );
                return interaction.editReply({ embeds: [embed] });
            }

            if (title.length > 500) {
                const embed = createErrorTemplate(
                    'Task Title Too Long',
                    'Task title must be 500 characters or less for optimal readability.',
                    { helpText: `Current length: ${title.length}/500 characters` }
                );
                return interaction.editReply({ embeds: [embed] });
            }

            // Add the task
            const result = await taskService.addTask(discordId, title.trim());

            if (!result.success) {
                if (result.limitReached) {
                    const dayjs = require('dayjs');
                    const resetTime = Math.floor(dayjs().add(1, 'day').startOf('day').valueOf() / 1000);

                    const embed = createErrorTemplate(
                        'Daily Task Limit Reached',
                        result.message,
                        {
                            helpText: `Daily Progress: ${result.stats.currentActions}/${result.stats.limit} task actions used`,
                            additionalInfo: `**Remaining:** ${result.stats.remaining} actions • **Resets:** <t:${resetTime}:R>`
                        }
                    );
                    return interaction.editReply({ embeds: [embed] });
                } else {
                    const embed = createErrorTemplate(
                        'Task Creation Failed',
                        result.message,
                        { helpText: 'Please try again' }
                    );
                    return interaction.editReply({ embeds: [embed] });
                }
            }

            const embed = createSuccessTemplate(
                'Task Added Successfully!',
                `**${result.task.title}**\n\nYour task has been added to your personal to-do list and is ready for completion.`,
                {
                    helpText: 'Use `/viewtasks` to see all your tasks',
                    rewards: 'Complete this task to earn **2 points**!',
                    additionalInfo: `**Daily Progress:** ${result.stats.total_task_actions}/${result.stats.limit} task actions used • **${result.stats.remaining} remaining**`
                }
            );

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in /addtask:', error);

            const embed = createErrorTemplate(
                'Task Creation Failed',
                'An unexpected error occurred while adding your task. Please try again in a moment.',
                { helpText: 'If this problem persists, contact support' }
            );

            await safeErrorReply(interaction, embed);
        }
    }
};
