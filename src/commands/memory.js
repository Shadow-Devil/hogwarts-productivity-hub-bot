const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { createHeader, formatDataTable, createStatsCard, createProgressSection } = require('../utils/visualHelpers');
const { safeDeferReply, safeErrorReply } = require('../utils/interactionUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('memory')
        .setDescription('Show detailed memory usage information'),
    async execute(interaction) {
        try {
            // Immediately defer to prevent timeout
            const deferred = await safeDeferReply(interaction);
            if (!deferred) {
                console.warn('Failed to defer memory interaction');
                return;
            }

            const memUsage = process.memoryUsage();
            
            // Get Node.js memory limits
            const v8 = require('v8');
            const heapStats = v8.getHeapStatistics();
            const maxHeapMB = Math.round(heapStats.heap_size_limit / 1024 / 1024);
            const availableHeapMB = Math.round((heapStats.heap_size_limit - memUsage.heapUsed) / 1024 / 1024);
            
            // Convert bytes to MB
            const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
            const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
            const rssMB = Math.round(memUsage.rss / 1024 / 1024);
            const externalMB = Math.round(memUsage.external / 1024 / 1024);
            
            // Calculate percentages
            const heapUsagePercent = ((memUsage.heapUsed / memUsage.heapTotal) * 100).toFixed(1);
            const capacityPercent = ((memUsage.heapUsed / heapStats.heap_size_limit) * 100).toFixed(2);
            
            // Determine status
            let statusIcon = '🟢';
            let statusText = 'Healthy';
            if (parseFloat(capacityPercent) > 80) {
                statusIcon = '🔴';
                statusText = 'High Usage';
            } else if (parseFloat(capacityPercent) > 60) {
                statusIcon = '🟡';
                statusText = 'Moderate Usage';
            }
            
            const embed = new EmbedBuilder()
                .setTitle(createHeader('Memory Usage Report', `${statusIcon} ${statusText}`, '🧠', 'large'))
                .setColor(statusIcon === '🟢' ? '#00ff00' : statusIcon === '🟡' ? '#ffff00' : '#ff0000')
                .setTimestamp();

            // Create memory usage stats card with big numbers
            const memoryStats = createStatsCard('Memory Overview', {
                'Current Usage': `${heapUsedMB}MB`,
                'Available': `${availableHeapMB}MB`,
                'Capacity Used': `${capacityPercent}%`,
                'Status': `${statusIcon} ${statusText}`
            }, {
                showBigNumbers: true,
                emphasizeFirst: true
            });

            embed.setDescription(memoryStats);

            // Memory breakdown in table format
            const memoryData = [
                ['Heap Used', `${heapUsedMB}MB`, `${heapUsagePercent}%`],
                ['Heap Total', `${heapTotalMB}MB`, '—'],
                ['RSS Memory', `${rssMB}MB`, 'Process Total'],
                ['External', `${externalMB}MB`, 'C++ Objects'],
                ['Available', `${availableHeapMB}MB`, 'Remaining'],
                ['Node.js Limit', `${maxHeapMB}MB`, 'Maximum']
            ];

            const memoryTable = formatDataTable(memoryData, [15, 12, 15]);

            embed.addFields([
                {
                    name: createHeader('Memory Breakdown', null, '📊', 'emphasis'),
                    value: memoryTable,
                    inline: false
                }
            ]);

            // Memory usage progress bars
            const heapProgress = createProgressSection('Heap Usage', heapUsedMB, heapTotalMB, {
                showPercentage: true,
                showNumbers: true,
                barLength: 20
            });

            const capacityProgress = createProgressSection('Node.js Capacity', heapUsedMB, maxHeapMB, {
                showPercentage: true,
                showNumbers: true,
                barLength: 20,
                warningThreshold: 60,
                dangerThreshold: 80
            });

            embed.addFields([
                {
                    name: createHeader('Usage Progress', null, '📈', 'emphasis'),
                    value: `${heapProgress}\n\n${capacityProgress}`,
                    inline: false
                }
            ]);

            embed.setFooter({ text: `Node.js Memory Limit: ${maxHeapMB}MB • Memory stats updated in real-time` });
            
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('💥 Error in /memory command:', {
                error: error.message,
                stack: error.stack,
                user: interaction.user.tag,
                timestamp: new Date().toISOString()
            });
            
            const errorMessage = '❌ An error occurred while fetching memory information.';
            try {
                await interaction.editReply({ content: errorMessage });
            } catch (replyError) {
                console.error('🔥 Error sending memory error reply:', replyError.message);
            }
        }
    },
};