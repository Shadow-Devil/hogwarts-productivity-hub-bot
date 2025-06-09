const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const voiceService = require('../services/voiceService');
const taskService = require('../services/taskService');
const dayjs = require('dayjs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('View your voice channel time and streak statistics'),
    async execute(interaction) {
        try {
            await interaction.deferReply();

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

            // Format time helper function - always show hours for consistency
            function formatTime(minutes) {
                const hours = Math.floor(minutes / 60);
                const mins = minutes % 60;
                
                if (hours > 0) {
                    return `${hours}h ${mins}m`;
                } else {
                    // For less than an hour, show as decimal hours for consistency
                    const decimalHours = (minutes / 60).toFixed(1);
                    return `${decimalHours}h`;
                }
            }

            // Format hours as decimal
            function formatHours(hours) {
                return `${hours.toFixed(1)}h`;
            }

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle('📊 Voice Channel Statistics & Points')
                .setDescription(`Statistics for **${interaction.user.username}**`)
                .setColor(0x5865F2)
                .setThumbnail(interaction.user.displayAvatarURL())
                .addFields([
                    {
                        name: '🔥 Current Streak',
                        value: `**${user.current_streak}** days`,
                        inline: true
                    },
                    {
                        name: '🏆 Longest Streak',
                        value: `**${user.longest_streak}** days`,
                        inline: true
                    },
                    {
                        name: '📅 Last VC Date',
                        value: user.last_vc_date ? dayjs(user.last_vc_date).format('MMM DD, YYYY') : 'Never',
                        inline: true
                    },
                    {
                        name: '📍 Today',
                        value: `🕒 **${formatTime(today.minutes)}**\n📞 ${today.sessions} session${today.sessions !== 1 ? 's' : ''}\n💰 **${today.points} points**`,
                        inline: true
                    },
                    {
                        name: '📅 This Month',
                        value: `🕒 **${formatHours(thisMonth.hours)}**\n📞 ${thisMonth.sessions} session${thisMonth.sessions !== 1 ? 's' : ''}\n💰 **${thisMonth.points} points**`,
                        inline: true
                    },
                    {
                        name: '🌟 All Time',
                        value: `🕒 **${formatHours(allTime.hours)}**\n📞 ${allTime.sessions} session${allTime.sessions !== 1 ? 's' : ''}\n💰 **${allTime.points} points**`,
                        inline: true
                    }
                ])
                .addFields([{
                    name: '📋 Task Statistics',
                    value: `**Total Tasks:** ${taskStats.total_tasks}\n**Completed:** ${taskStats.completed_tasks}\n**Pending:** ${taskStats.pending_tasks}\n**Task Points:** ${taskStats.total_task_points}`,
                    inline: false
                }])
                .addFields([{
                    name: '💡 Points System',
                    value: '**Voice Time:** First hour/month = 5pts/hr, additional = 2pts/hr\n**Tasks:** 2 points per completed task\n*Monthly voice totals reset on the 1st*',
                    inline: false
                }])
                .setFooter({ 
                    text: 'Stay in VC 15+ min daily for streaks • Complete tasks for extra points!' 
                })
                .setTimestamp();

            // Add streak status
            if (user.current_streak > 0) {
                embed.addFields([{
                    name: '🎯 Streak Status',
                    value: `You're on a **${user.current_streak}-day streak**! Keep it up! 🚀`,
                    inline: false
                }]);
            } else {
                embed.addFields([{
                    name: '🎯 Streak Status',
                    value: 'Join a voice channel for 15+ minutes today to start your streak! 💪',
                    inline: false
                }]);
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in /stats:', error);
            
            const errorMessage = '❌ An error occurred while fetching your statistics.';
            try {
                if (interaction.deferred) {
                    await interaction.editReply({ content: errorMessage });
                } else if (!interaction.replied) {
                    await interaction.reply({ content: errorMessage, flags: [MessageFlags.Ephemeral] });
                }
            } catch (err) {
                console.error('Error sending stats error reply:', err);
            }
        }
    }
};
