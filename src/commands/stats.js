const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const voiceService = require('../services/voiceService');
const taskService = require('../services/taskService');
const dayjs = require('dayjs');
const { createStatsTemplate, createSuccessTemplate } = require('../utils/embedTemplates');
const { BotColors, createProgressBar, formatDataGrid, formatDataTable, createStatsCard, createProgressSection, createAchievementBadge, formatUserStatus } = require('../utils/visualHelpers');
const { safeDeferReply, safeErrorReply } = require('../utils/interactionUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('View your voice channel time and streak statistics'),
    async execute(interaction) {
        try {
            // Immediately defer to prevent timeout
            const deferred = await safeDeferReply(interaction);
            if (!deferred) {
                console.warn('Failed to defer stats interaction');
                return;
            }

            const discordId = interaction.user.id;
            const stats = await voiceService.getUserStats(discordId);
            const taskStats = await taskService.getTaskStats(discordId);

            if (!stats) {
                await interaction.editReply({
                    content: '📊 You haven\'t joined any voice channels yet! Join a voice channel to start tracking your time.',
                });
                return;
            }

            const { user, today, thisMonth, allTime } = stats;

            // Enhanced visual formatting helpers
            function formatTime(minutes) {
                const hours = Math.floor(minutes / 60);
                const mins = minutes % 60;
                
                if (hours > 0) {
                    return `${hours}h ${mins}m`;
                } else {
                    const decimalHours = (minutes / 60).toFixed(1);
                    return `${decimalHours}h`;
                }
            }

            function formatHours(hours) {
                return `${hours.toFixed(1)}h`;
            }

            // Create enhanced stats embed using new visual system
            const embed = createStatsTemplate(interaction.user, stats, { 
                showThumbnail: true, 
                includeFooter: true,
                useEnhancedLayout: true
            });

            // Status indicator based on current streak
            let streakStatus = '🆕';
            let streakColor = BotColors.INFO;
            if (user.current_streak >= 30) {
                streakStatus = '🔥';
                streakColor = BotColors.PREMIUM;
            } else if (user.current_streak >= 7) {
                streakStatus = '⚡';
                streakColor = BotColors.SUCCESS;
            } else if (user.current_streak > 0) {
                streakStatus = '💪';
                streakColor = BotColors.WARNING;
            }

            embed.setColor(streakColor);

            // Enhanced streak display with bigger numbers for main stats
            const streakDisplay = user.current_streak > 0 ? 
                `# ${user.current_streak}\n### ${streakStatus} Day Streak\n**Personal Best:** ${user.longest_streak} days` :
                `### 💤 No Active Streak\n**Personal Best:** ${user.longest_streak} days`;

            embed.addFields([
                {
                    name: '🔥 Productivity Streak',
                    value: streakDisplay,
                    inline: false
                },
                {
                    name: '📅 Last Active',
                    value: user.last_vc_date ? 
                        `📍 ${dayjs(user.last_vc_date).format('MMM DD, YYYY')} (${dayjs(user.last_vc_date).fromNow()})` : 
                        '❓ Never recorded',
                    inline: false
                }
            ]);

            // Today's progress with enhanced visual progress section
            const todayTarget = 60; // 1 hour target
            const progressSection = createProgressSection(
                'Daily Goal Progress',
                today.minutes,
                todayTarget,
                {
                    emoji: '🎯',
                    style: 'detailed',
                    showPercentage: true,
                    barLength: 15
                }
            );
            
            // Today's stats with table format for better space utilization
            const todayStatsData = [
                ['Active Time', formatTime(today.minutes)],
                ['Sessions', `${today.sessions} session${today.sessions !== 1 ? 's' : ''}`],
                ['Points Earned', `${today.points} pts`]
            ];

            embed.addFields([
                {
                    name: '📍 Today\'s Performance',
                    value: progressSection + '\n\n' + formatDataTable(todayStatsData, [12, 10]),
                    inline: true
                },
                {
                    name: '📅 This Month',
                    value: formatDataTable([
                        ['Total Time', formatHours(thisMonth.hours)],
                        ['Sessions', `${thisMonth.sessions}`],
                        ['Points', `${thisMonth.points} pts`],
                        ['Daily Avg', `${(thisMonth.hours / new Date().getDate()).toFixed(1)}h`]
                    ], [12, 8]),
                    inline: true
                },
                {
                    name: '🌟 All-Time Stats',
                    value: formatDataTable([
                        ['Lifetime Hours', formatHours(allTime.hours)],
                        ['Total Sessions', `${allTime.sessions}`],
                        ['Total Points', `${allTime.points}`],
                        ['Current Level', `${Math.floor(allTime.points / 100) + 1}`]
                    ], [15, 8]),
                    inline: true
                }
            ]);

            // Task statistics with enhanced table formatting
            const taskStatsData = [
                ['Total Tasks', `${taskStats.total_tasks}`],
                ['Completed', `${taskStats.completed_tasks}`],
                ['Pending', `${taskStats.pending_tasks}`],
                ['Task Points', `${taskStats.total_task_points}`]
            ];

            embed.addFields([{
                name: '📊 Task Performance',
                value: formatDataTable(taskStatsData, [12, 8]),
                inline: false
            }]);

            // Points breakdown with enhanced table format
            const pointsBreakdownData = [
                ['Voice Points', `${allTime.points - taskStats.total_task_points}`],
                ['Task Points', `${taskStats.total_task_points}`],
                ['Total Earned', `${allTime.points}`]
            ];

            embed.addFields([{
                name: '💰 Points Breakdown',
                value: formatDataTable(pointsBreakdownData, [15, 10]),
                inline: false
            }]);

            // Enhanced help section
            embed.addFields([{
                name: '💡 Points & Rewards System',
                value: '**Voice Time:** First hour/month = 5pts/hr, additional = 2pts/hr\n**Tasks:** 2 points per completed task\n**Streaks:** Stay in VC 15+ min daily\n\n*Monthly voice totals reset on the 1st*',
                inline: false
            }]);

            // Dynamic streak motivation message
            if (user.current_streak > 0) {
                const motivation = user.current_streak >= 30 ? 
                    `🔥 **LEGENDARY STREAK!** You're on fire with **${user.current_streak} days**! Keep dominating! 🏆` :
                    user.current_streak >= 7 ?
                    `⚡ **FANTASTIC!** ${user.current_streak} days strong! You're building amazing momentum! 🚀` :
                    `💪 **Great start!** ${user.current_streak} days and counting! Keep it up! 🌟`;

                embed.addFields([{
                    name: '🎯 Streak Status',
                    value: motivation,
                    inline: false
                }]);
            } else {
                embed.addFields([{
                    name: '🎯 Start Your Journey',
                    value: '🌱 Join a voice channel for 15+ minutes today to start your productivity streak! Every great journey begins with a single step! 💪',
                    inline: false
                }]);
            }

            // Enhanced footer with dynamic tips
            const tips = [
                'Complete tasks while in voice channels for maximum points!',
                'Consistency beats intensity - small daily progress wins!',
                'Join study sessions with friends to stay motivated!',
                'Set daily goals and track your amazing progress!'
            ];
            const randomTip = tips[Math.floor(Math.random() * tips.length)];
            
            embed.setFooter({ 
                text: `💡 Pro Tip: ${randomTip}` 
            });

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in /stats:', error);
            
            const embed = {
                title: '❌ Stats Load Failed',
                description: 'An error occurred while fetching your statistics. Please try again in a moment.',
                color: 0xff0000,
                footer: { text: 'If this problem persists, contact support' }
            };
            
            await safeErrorReply(interaction, embed);
        }
    }
};
