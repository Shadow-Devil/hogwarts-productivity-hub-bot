const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const taskService = require('../services/taskService');
const dayjs = require('dayjs');
const { createTaskTemplate, createErrorTemplate } = require('../utils/embedTemplates');
const { BotColors, StatusEmojis, createProgressBar, formatDataGrid, formatDataTable } = require('../utils/visualHelpers');
const { safeDeferReply, safeErrorReply } = require('../utils/interactionUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('viewtasks')
        .setDescription('View all your tasks with their numbers'),
    async execute(interaction) {
        try {
            // Immediately defer to prevent timeout
            const deferred = await safeDeferReply(interaction);
            if (!deferred) {
                console.warn('Failed to defer viewtasks interaction');
                return;
            }

            const discordId = interaction.user.id;
            const tasks = await taskService.getUserTasksOptimized(discordId);

            if (tasks.length === 0) {
                const embed = createTaskTemplate(interaction.user, [], {
                    emptyState: true,
                    emptyStateMessage: '🌟 **Ready to get productive?**\nUse `/addtask <description>` to create your first task!',
                    helpText: 'Tip: Completing tasks earns you 2 points each!',
                    useEnhancedLayout: true
                });
                return interaction.editReply({ embeds: [embed] });
            }

            // Separate completed and incomplete tasks
            const incompleteTasks = tasks.filter(task => !task.is_complete);
            const completedTasks = tasks.filter(task => task.is_complete);

            // Calculate task statistics
            const totalTasks = tasks.length;
            const totalCompleted = completedTasks.length;
            const totalPending = incompleteTasks.length;
            const totalTaskPoints = tasks.reduce((sum, task) => sum + (task.points_awarded || 0), 0);
            const completionRate = totalTasks > 0 ? (totalCompleted / totalTasks) * 100 : 0;

            // Get daily task limit information
            const dailyStats = await taskService.getDailyTaskStats(discordId);

            // Create enhanced task display using our template with all new features
            const embed = createTaskTemplate(interaction.user, {
                incompleteTasks,
                completedTasks,
                stats: {
                    totalTasks,
                    totalCompleted,
                    totalPending,
                    totalTaskPoints,
                    completionRate
                },
                dailyStats
            }, {
                showProgress: true,
                includeRecentCompleted: true,
                useEnhancedLayout: true,
                useTableFormat: true,
                maxRecentCompleted: 5,
                showDailyLimit: true
            });

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in /viewtasks:', error);

            const embed = createErrorTemplate(
                'Failed to Load Tasks',
                'An error occurred while fetching your tasks. Please try again in a moment.',
                { helpText: 'If this problem persists, contact support' }
            );

            await safeErrorReply(interaction, embed);
        }
    }
};
