const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const queryCache = require('../utils/queryCache');
const { createHeader, formatDataTable, createStatsCard, createProgressSection } = require('../utils/visualHelpers');
const { safeDeferReply, safeErrorReply } = require('../utils/interactionUtils');

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
            // Immediately defer to prevent timeout
            const deferred = await safeDeferReply(interaction);
            if (!deferred) {
                console.warn('Failed to defer cache interaction');
                return;
            }

            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'stats') {
                await showCacheStats(interaction);
            } else if (subcommand === 'clear') {
                const cacheType = interaction.options.getString('type');
                await clearCache(interaction, cacheType);
            }
        } catch (error) {
            console.error('Error in /cache command:', error);
            
            await safeErrorReply(interaction, {
                title: 'Cache Management Error',
                description: 'An error occurred while managing cache.',
                color: 0xED4245
            });
        }
    }
};

async function showCacheStats(interaction) {
    const stats = queryCache.getStats();
    
    // Calculate performance impact
    const efficiency = stats.total > 0 ? 
        `${((stats.hits / stats.total) * 100).toFixed(1)}% efficient` : 'No data';
    
    const embed = new EmbedBuilder()
        .setTitle(createHeader('Query Cache Statistics', null, '💾', 'large'))
        .setColor(0x3498db)
        .setTimestamp();

    // Cache overview with big numbers
    const cacheStats = createStatsCard('Cache Performance', {
        'Hit Rate': stats.hitRate,
        'Total Queries': `${stats.total}`,
        'Cache Entries': `${stats.size}`,
        'Memory Usage': stats.memoryUsage
    }, {
        showBigNumbers: true,
        emphasizeFirst: true
    });

    embed.setDescription(`Cache performance metrics and memory usage\n\n${cacheStats}`);

    // Cache metrics in table format
    const cacheData = [
        ['Hit Rate', stats.hitRate],
        ['Total Queries', `${stats.total}`],
        ['Cache Hits', `${stats.hits}`],
        ['Cache Misses', `${stats.misses}`],
        ['Entries Stored', `${stats.size}`],
        ['Memory Usage', stats.memoryUsage],
        ['Efficiency', efficiency]
    ];

    const cacheTable = formatDataTable(cacheData, [15, 20]);

    embed.addFields([
        {
            name: createHeader('Cache Metrics', null, '📊', 'emphasis'),
            value: cacheTable,
            inline: false
        }
    ]);

    // Performance impact section
    if (stats.hits > 0) {
        const savedQueries = stats.hits;
        const estimatedTimeSaved = (stats.hits * 50).toFixed(0);
        
        const impactData = [
            ['Queries Prevented', `${savedQueries}`],
            ['Estimated Time Saved', `${estimatedTimeSaved}ms`],
            ['Database Load Reduced', `${((stats.hits / stats.total) * 100).toFixed(1)}%`]
        ];

        const impactTable = formatDataTable(impactData, [20, 15]);

        embed.addFields([
            {
                name: createHeader('Performance Impact', null, '⚡', 'emphasis'),
                value: impactTable,
                inline: false
            }
        ]);
    } else {
        embed.addFields([
            {
                name: createHeader('Performance Impact', null, '⚡', 'emphasis'),
                value: 'No performance gains yet - cache is building up',
                inline: false
            }
        ]);
    }

    embed.setFooter({ text: 'Cache automatically cleans expired entries every minute' });

    await interaction.editReply({ embeds: [embed] });
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

            await interaction.editReply({ embeds: [embed] });
        } else {
            // Clear specific cache type
            queryCache.clearType(cacheType);
            
            const embed = new EmbedBuilder()
                .setTitle('🧹 Cache Cleared')
                .setColor(0xf39c12)
                .setDescription(`Successfully cleared **${cacheType}** cache`)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    } catch (error) {
        console.error('Error clearing cache:', error);
        await interaction.editReply({
            content: '❌ Failed to clear cache. Please try again.',
        });
    }
}
