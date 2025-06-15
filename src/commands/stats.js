const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const voiceService = require('../services/voiceService');
const taskService = require('../services/taskService');
const dayjs = require('dayjs');
const { BotColors } = require('../utils/visualHelpers');
const { safeDeferReply, safeErrorReply } = require('../utils/interactionUtils');
const { formatDailyLimitStatus } = require('../utils/dailyLimitUtils');
const { formatHours } = require('../utils/timeUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('View your productivity statistics'),
    async execute(interaction) {
        try {
            // Immediately defer to prevent timeout
            const deferred = await safeDeferReply(interaction);
            if (!deferred) {
                console.warn('Failed to defer stats interaction');
                return;
            }

            const discordId = interaction.user.id;
            const stats = await voiceService.getUserStatsOptimized(discordId);
            const taskStats = await taskService.getTaskStatsOptimized(discordId);

            // Fetch user tasks with error handling
            let userTasks = [];
            try {
                userTasks = await taskService.getUserTasksOptimized(discordId);
            } catch (error) {
                console.warn('⚠️ Failed to fetch user tasks for stats:', error.message);
                // Continue without tasks - will show fallback message
            }

            if (!stats) {
                await interaction.editReply({
                    content: '📊 You haven\'t joined any voice channels yet! Join a voice channel to start tracking your time.',
                });
                return;
            }

            const { user, today, thisMonth, allTime } = stats;

            // Use centralized formatHours utility (no need for local function)            // Create minimal, clean embed
            const embed = new EmbedBuilder()
                .setTitle('📊 Your Stats')
                .setColor(BotColors.PRIMARY)
                .setThumbnail(interaction.user.displayAvatarURL());

            // Personalized greeting based on streak
            let greeting = '';
            if (user.current_streak >= 7) {
                greeting = `🔥 Hey ${user.username}! You're on a ${user.current_streak}-day streak!`;
            } else if (user.current_streak > 0) {
                greeting = `💪 Great work ${user.username}! ${user.current_streak} days and counting!`;
            } else {
                greeting = `👋 Hi ${user.username}! Ready to start your productivity journey?`;
            }

            embed.setDescription(greeting);

            // 1. Streak Information
            embed.addFields([
                {
                    name: '🔥 Current Streak',
                    value: `**${user.current_streak}** days`,
                    inline: true
                }
            ]);

            // 2. Voice Channel Hours (today, this month, all-time)
            const voiceHoursText = [
                `**Today:** ${formatHours(today.hours)}`,
                `**This Month:** ${formatHours(thisMonth.hours)}`,
                `**All-Time:** ${formatHours(allTime.hours)}`
            ].join('\n');

            embed.addFields([
                {
                    name: '🎧 Voice Hours',
                    value: voiceHoursText,
                    inline: true
                }
            ]);

            // 3. Points Limit (remaining hours with midnight reset awareness)
            const remainingHours = today.remainingHours || 0;
            const allowanceRemaining = today.allowanceHoursRemaining || 0;
            const hoursUntilMidnight = today.hoursUntilMidnight || 0;

            // Use centralized daily limit status formatting
            const limitInfo = {
                dailyHours: today.hours,
                allowanceHoursRemaining: allowanceRemaining,
                hoursUntilMidnight: hoursUntilMidnight,
                remainingHours: remainingHours,
                limitReached: today.limitReached,
                canEarnPoints: today.canEarnPoints,
                isLimitedByAllowance: allowanceRemaining <= hoursUntilMidnight,
                isLimitedByTime: hoursUntilMidnight < allowanceRemaining
            };

            const limitStatus = formatDailyLimitStatus(limitInfo);

            embed.addFields([
                {
                    name: '⏳ Daily Limit (15h)',
                    value: limitStatus,
                    inline: true
                }
            ]);

            // 4. Points Breakdown (today, this month, all-time)
            const pointsText = [
                `**Today:** ${today.points} pts`,
                `**This Month:** ${thisMonth.points} pts`,
                `**All-Time:** ${allTime.points} pts`
            ].join('\n');

            embed.addFields([
                {
                    name: '💰 Points Earned',
                    value: pointsText,
                    inline: true
                }
            ]);

            // 5. Pending Tasks (show actual tasks, not just count)
            const pendingTasks = userTasks.filter(task => !task.is_complete);
            let pendingTasksValue;

            if (userTasks.length === 0) {
                // No tasks at all or failed to fetch
                pendingTasksValue = taskStats.pending_tasks > 0 ?
                    `**${taskStats.pending_tasks}** tasks` :
                    '🎯 **No tasks yet**';
            } else if (pendingTasks.length === 0) {
                pendingTasksValue = '🎉 **All caught up!**';
            } else if (pendingTasks.length <= 3) {
                // Show all tasks if 3 or fewer
                const taskList = pendingTasks.map((task, index) =>
                    `${index + 1}. ${task.title.length > 35 ? task.title.substring(0, 32) + '...' : task.title}`
                ).join('\n');
                pendingTasksValue = `**${pendingTasks.length}** tasks:\n${taskList}`;
            } else {
                // Show first 3 tasks with "and X more"
                const taskList = pendingTasks.slice(0, 3).map((task, index) =>
                    `${index + 1}. ${task.title.length > 35 ? task.title.substring(0, 32) + '...' : task.title}`
                ).join('\n');
                const remainingCount = pendingTasks.length - 3;
                pendingTasksValue = `**${pendingTasks.length}** tasks:\n${taskList}\n*...and ${remainingCount} more*`;
            }

            embed.addFields([
                {
                    name: '📋 Pending Tasks',
                    value: pendingTasksValue,
                    inline: true
                }
            ]);

            // Add a simple spacer field to balance the layout
            embed.addFields([
                {
                    name: '\u200b',
                    value: '\u200b',
                    inline: true
                }
            ]);

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in /stats:', error);

            const embed = {
                title: '❌ Stats Load Failed',
                description: 'An error occurred while fetching your statistics. Please try again in a moment.',
                color: BotColors.ERROR
            };

            await safeErrorReply(interaction, embed);
        }
    }
};
