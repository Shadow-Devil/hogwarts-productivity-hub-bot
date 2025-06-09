const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('memory')
        .setDescription('Show detailed memory usage information'),
    async execute(interaction) {
        try {
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
                .setTitle('🧠 Memory Usage Report')
                .setColor(statusIcon === '🟢' ? '#00ff00' : statusIcon === '🟡' ? '#ffff00' : '#ff0000')
                .setDescription(`${statusIcon} **Status:** ${statusText}`)
                .addFields(
                    { 
                        name: '📊 Current Heap Usage', 
                        value: `${heapUsedMB}MB / ${heapTotalMB}MB (${heapUsagePercent}%)`, 
                        inline: true 
                    },
                    { 
                        name: '🚀 Total Capacity', 
                        value: `${heapUsedMB}MB / ${maxHeapMB}MB (${capacityPercent}%)`, 
                        inline: true 
                    },
                    { 
                        name: '💾 Available Memory', 
                        value: `${availableHeapMB}MB remaining`, 
                        inline: true 
                    },
                    { 
                        name: '🔧 RSS Memory', 
                        value: `${rssMB}MB (total process memory)`, 
                        inline: true 
                    },
                    { 
                        name: '🌐 External Memory', 
                        value: `${externalMB}MB (C++ objects, buffers)`, 
                        inline: true 
                    },
                    { 
                        name: '📈 Memory Efficiency', 
                        value: `Using ${capacityPercent}% of Node.js limit`, 
                        inline: true 
                    }
                )
                .setFooter({ text: `Node.js Memory Limit: ${maxHeapMB}MB • Memory stats updated in real-time` })
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('💥 Error in /memory command:', {
                error: error.message,
                stack: error.stack,
                user: interaction.user.tag,
                timestamp: new Date().toISOString()
            });
            
            const errorMessage = '❌ An error occurred while fetching memory information.';
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: errorMessage, flags: [MessageFlags.Ephemeral] });
                } else if (interaction.deferred) {
                    await interaction.editReply({ content: errorMessage });
                }
            } catch (replyError) {
                console.error('🔥 Error sending memory error reply:', replyError.message);
            }
        }
    },
};