const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { performanceMonitor } = require('../utils/performanceMonitor');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('performance')
        .setDescription('Check bot health and performance status'),
    async execute(interaction) {
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const summary = performanceMonitor.getPerformanceSummary();
            const bottlenecks = performanceMonitor.identifyBottlenecks();
            const embed = createComprehensiveReport(summary, bottlenecks);

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in /performance:', error);
            try {
                await interaction.editReply({
                    content: '❌ Unable to check performance right now. Please try again later.',
                });
            } catch (err) {
                console.error('Error editing reply:', err);
            }
        }
    }
};

function createComprehensiveReport(summary, bottlenecks) {
    const uptimeHours = Math.floor(summary.uptime / 3600);
    const uptimeMinutes = Math.floor((summary.uptime % 3600) / 60);
    
    // Calculate overall health score
    const memUsage = summary.memory.current;
    const memoryPercentage = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    
    const criticalIssues = bottlenecks.filter(b => b.severity === 'critical').length;
    const highIssues = bottlenecks.filter(b => b.severity === 'high').length;
    const mediumIssues = bottlenecks.filter(b => b.severity === 'medium').length;

    // Determine overall health status
    let healthStatus = '🟢 Excellent';
    let healthColor = 0x00ff00;
    let healthMessage = 'Bot is running smoothly with optimal performance.';
    
    if (criticalIssues > 0) {
        healthStatus = '🔴 Critical';
        healthColor = 0xff0000;
        healthMessage = 'Immediate attention needed! Critical performance issues detected.';
    } else if (highIssues > 0) {
        healthStatus = '🟡 Poor';
        healthColor = 0xffff00;
        healthMessage = 'Performance issues detected that may affect user experience.';
    } else if (mediumIssues > 0 || memoryPercentage > 70) {
        healthStatus = '🟠 Fair';
        healthColor = 0xffa500;
        healthMessage = 'Minor issues detected. Consider monitoring more closely.';
    }

    const embed = new EmbedBuilder()
        .setTitle('🏥 Bot Health Report')
        .setDescription(healthMessage)
        .setColor(healthColor)
        .addFields([
            {
                name: '📋 Overall Status',
                value: healthStatus,
                inline: true
            },
            {
                name: '⏰ Uptime',
                value: `${uptimeHours}h ${uptimeMinutes}m`,
                inline: true
            },
            {
                name: '🧠 Memory Usage',
                value: `${memoryPercentage.toFixed(1)}% (${memUsage.heapUsed}MB used)`,
                inline: true
            },
            {
                name: '⚡ Response Speed',
                value: getAverageResponseTime(summary),
                inline: true
            },
            {
                name: '🗃️ Database Health',
                value: getDatabaseHealth(summary),
                inline: true
            },
            {
                name: '📊 Activity Level',
                value: `${summary.commands.total} commands processed`,
                inline: true
            }
        ])
        .setTimestamp();

    // Add issues summary if any exist
    if (bottlenecks.length > 0) {
        const issuesText = getIssuesSummary(bottlenecks);
        embed.addFields([{
            name: '⚠️ Issues Detected',
            value: issuesText,
            inline: false
        }]);
    }

    // Add memory trend if significant
    if (Math.abs(summary.memory.trend) > 2) {
        const trendIcon = summary.memory.trend > 0 ? '📈' : '📉';
        const trendText = summary.memory.trend > 0 ? 'increasing' : 'decreasing';
        embed.addFields([{
            name: `${trendIcon} Memory Trend`,
            value: `Memory usage is ${trendText} (${summary.memory.trend > 0 ? '+' : ''}${summary.memory.trend.toFixed(1)}MB/min)`,
            inline: false
        }]);
    }

    embed.setFooter({ text: 'This report helps ensure your bot runs smoothly for all users' });

    return embed;
}

function getAverageResponseTime(summary) {
    if (summary.commands.slowest.length === 0) {
        return 'No data available';
    }
    
    const totalTime = summary.commands.slowest.reduce((sum, [, metrics]) => sum + metrics.avgResponseTime, 0);
    const avgTime = totalTime / summary.commands.slowest.length;
    
    if (avgTime < 100) return `🟢 Fast (${avgTime.toFixed(0)}ms)`;
    if (avgTime < 500) return `🟡 Good (${avgTime.toFixed(0)}ms)`;
    return `🔴 Slow (${avgTime.toFixed(0)}ms)`;
}

function getDatabaseHealth(summary) {
    const errorRate = summary.database.errorProne.length > 0 ? 
        summary.database.errorProne[0][1].errors / summary.database.errorProne[0][1].count : 0;
    
    if (summary.database.activeConnections > 15) return '🟡 High load';
    if (errorRate > 0.1) return '🔴 Errors detected';
    if (summary.database.totalQueries > 0) return '🟢 Healthy';
    return '⚪ No activity';
}

function getIssuesSummary(bottlenecks) {
    const critical = bottlenecks.filter(b => b.severity === 'critical');
    const high = bottlenecks.filter(b => b.severity === 'high');
    const medium = bottlenecks.filter(b => b.severity === 'medium');
    
    let summary = [];
    
    if (critical.length > 0) {
        summary.push(`🔴 **${critical.length} Critical Issue${critical.length > 1 ? 's' : ''}**`);
        summary.push(...critical.slice(0, 2).map(b => `• ${b.message}`));
        if (critical.length > 2) summary.push(`• ...and ${critical.length - 2} more critical issue${critical.length - 2 > 1 ? 's' : ''}`);
    }
    
    if (high.length > 0) {
        summary.push(`🟡 **${high.length} High Priority Issue${high.length > 1 ? 's' : ''}**`);
        summary.push(...high.slice(0, 2).map(b => `• ${b.message}`));
        if (high.length > 2) summary.push(`• ...and ${high.length - 2} more issue${high.length - 2 > 1 ? 's' : ''}`);
    }
    
    if (medium.length > 0 && critical.length === 0 && high.length === 0) {
        summary.push(`🟠 **${medium.length} Minor Issue${medium.length > 1 ? 's' : ''}**`);
        summary.push(...medium.slice(0, 3).map(b => `• ${b.message}`));
        if (medium.length > 3) summary.push(`• ...and ${medium.length - 3} more minor issue${medium.length - 3 > 1 ? 's' : ''}`);
    }
    
    return summary.join('\n');
}
