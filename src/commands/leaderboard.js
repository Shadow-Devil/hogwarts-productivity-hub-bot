const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const voiceService = require('../services/voiceService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View voice channel time leaderboards')
        .addStringOption(option =>
            option
                .setName('type')
                .setDescription('Choose leaderboard type')
                .setRequired(true)
                .addChoices(
                    { name: '📅 Monthly', value: 'monthly' },
                    { name: '🌟 All Time', value: 'alltime' }
                )),
    async execute(interaction) {
        try {
            await interaction.deferReply();

            const leaderboardType = interaction.options.getString('type');
            const leaderboard = await voiceService.getLeaderboard(leaderboardType);

            if (!leaderboard || leaderboard.length === 0) {
                return interaction.editReply({
                    content: '📊 No data available for the leaderboard yet. Users need to spend time in voice channels first!',
                });
            }

            // Get current user's position
            const currentUserId = interaction.user.id;
            const userPosition = leaderboard.findIndex(entry => entry.discord_id === currentUserId) + 1;

            // Format leaderboard display
            const isMonthly = leaderboardType === 'monthly';
            const title = isMonthly ? '📅 Monthly Voice Leaderboard' : '🌟 All-Time Voice Leaderboard';
            const description = isMonthly 
                ? 'Top users by hours spent in voice channels this month'
                : 'Top users by hours spent in voice channels all-time';

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(description)
                .setColor(0x5865F2)
                .setTimestamp()
                .setFooter({ 
                    text: isMonthly ? 'Monthly leaderboard resets on the 1st of each month' : 'All-time rankings'
                });

            // Add leaderboard entries (top 10)
            const topEntries = leaderboard.slice(0, 10);
            let leaderboardText = '';

            topEntries.forEach((entry, index) => {
                const position = index + 1;
                const medal = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : `**${position}.**`;
                const hours = entry.hours.toFixed(1);
                const points = entry.points;
                
                // Highlight current user
                const isCurrentUser = entry.discord_id === currentUserId;
                const userDisplay = isCurrentUser ? `**${entry.username}** ⭐` : entry.username;
                
                leaderboardText += `${medal} ${userDisplay}\n`;
                leaderboardText += `    🕒 ${hours}h • 💰 ${points} points\n\n`;
            });

            embed.addFields([{
                name: '🏆 Top 10 Rankings',
                value: leaderboardText || 'No rankings available',
                inline: false
            }]);

            // Add user's position if they're not in top 10
            if (userPosition > 10 && userPosition <= leaderboard.length) {
                const userEntry = leaderboard[userPosition - 1];
                embed.addFields([{
                    name: '📍 Your Position',
                    value: `**#${userPosition}** • 🕒 ${userEntry.hours.toFixed(1)}h • 💰 ${userEntry.points} points`,
                    inline: false
                }]);
            } else if (userPosition > 0 && userPosition <= 10) {
                embed.addFields([{
                    name: '📍 Your Position',
                    value: `🎉 You're in the **Top 10** at position **#${userPosition}**!`,
                    inline: false
                }]);
            } else if (userPosition === 0) {
                embed.addFields([{
                    name: '📍 Your Position',
                    value: `Join a voice channel to appear on the leaderboard! 🚀`,
                    inline: false
                }]);
            }

            // Add statistics
            const totalUsers = leaderboard.length;
            const totalHours = leaderboard.reduce((sum, entry) => sum + entry.hours, 0);
            const avgHours = totalUsers > 0 ? (totalHours / totalUsers).toFixed(1) : '0.0';

            embed.addFields([{
                name: '📊 Statistics',
                value: `👥 **${totalUsers}** users • 🕒 **${totalHours.toFixed(1)}h** total • 📈 **${avgHours}h** average`,
                inline: false
            }]);

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in /leaderboard:', error);
            try {
                if (interaction.deferred) {
                    await interaction.editReply({
                        content: '❌ An error occurred while fetching the leaderboard.',
                    });
                } else if (!interaction.replied) {
                    await interaction.reply({
                        content: '❌ An error occurred while fetching the leaderboard.',
                    });
                }
            } catch (replyError) {
                console.error('Error sending error reply:', replyError);
            }
        }
    }
};
