const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const queryCache = require('../utils/queryCache');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cache')
        .setDescription('Manage bot query cache for performance optimization')
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('View cache statistics and performance metrics'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Clear all cached data')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Type of cache to clear (optional)')
                        .setRequired(false)
                        .addChoices(
                            { name: 'All Cache', value: 'all' },
                            { name: 'User Stats', value: 'userStats' },
                            { name: 'Leaderboards', value: 'leaderboard' },
                            { name: 'Task Lists', value: 'taskList' },
                            { name: 'House Points', value: 'housePoints' },
                            { name: 'Performance Data', value: 'performance' }
                        ))),
    async execute(interaction) {
        try {
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'stats') {
                await showCacheStats(interaction);
            } else if (subcommand === 'clear') {
                const cacheType = interaction.options.getString('type');
                await clearCache(interaction, cacheType);
            }
        } catch (error) {
            console.error('Error in /cache command:', error);
            
            if (!interaction.replied && !interaction.deferred) {
                try {
                    await interaction.reply({
                        content: '❌ An error occurred while managing cache.',
                        flags: MessageFlags.Ephemeral,
                    });
                } catch (err) {
                    console.error('Error sending cache error reply:', err);
                }
            }
        }
    }
};

async function showCacheStats(interaction) {
    const stats = queryCache.getStats();
    
    // Calculate performance impact
    const efficiency = stats.total > 0 ? 
        `${((stats.hits / stats.total) * 100).toFixed(1)}% efficient` : 'No data';
    
    const embed = new EmbedBuilder()
        .setTitle('💾 Query Cache Statistics')
        .setColor(0x3498db)
        .setDescription('Cache performance metrics and memory usage')
        .addFields([
            {
                name: '📊 Cache Performance',
                value: `**Hit Rate:** ${stats.hitRate}\n**Total Queries:** ${stats.total}\n**Cache Hits:** ${stats.hits}\n**Cache Misses:** ${stats.misses}`,
                inline: true
            },
            {
                name: '💾 Memory Usage',
                value: `**Entries:** ${stats.size}\n**Memory:** ${stats.memoryUsage}\n**Efficiency:** ${efficiency}`,
                inline: true
            },
            {
                name: '⚡ Performance Impact',
                value: stats.hits > 0 ? 
                    `Prevented **${stats.hits}** database queries\nEstimated **${(stats.hits * 50).toFixed(0)}ms** saved` :
                    'No performance gains yet',
                inline: false
            }
        ])
        .setTimestamp()
        .setFooter({ text: 'Cache automatically cleans expired entries every minute' });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function clearCache(interaction, cacheType) {
    try {
        if (!cacheType || cacheType === 'all') {
            // Clear all cache
            const statsBefore = queryCache.getStats();
            queryCache.clear();
            
            const embed = new EmbedBuilder()
                .setTitle('🧹 Cache Cleared')
                .setColor(0xe74c3c)
                .setDescription('Successfully cleared all cached data')
                .addFields([
                    {
                        name: '📊 Cleared Data',
                        value: `**Entries Removed:** ${statsBefore.size}\n**Memory Freed:** ${statsBefore.memoryUsage}`,
                        inline: false
                    }
                ])
                .setTimestamp();

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        } else {
            // Clear specific cache type
            queryCache.clearType(cacheType);
            
            const embed = new EmbedBuilder()
                .setTitle('🧹 Cache Cleared')
                .setColor(0xf39c12)
                .setDescription(`Successfully cleared **${cacheType}** cache`)
                .setTimestamp();

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    } catch (error) {
        console.error('Error clearing cache:', error);
        await interaction.reply({
            content: '❌ Failed to clear cache. Please try again.',
            flags: MessageFlags.Ephemeral,
        });
    }
}
