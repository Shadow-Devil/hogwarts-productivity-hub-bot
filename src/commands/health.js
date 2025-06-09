const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('health')
        .setDescription('Check bot health and system status')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type of health check to perform')
                .addChoices(
                    { name: 'Overview', value: 'overview' },
                    { name: 'Detailed', value: 'detailed' },
                    { name: 'Database', value: 'database' },
                    { name: 'Performance', value: 'performance' }
                )),
    async execute(interaction) {
        try {
            await interaction.deferReply();

            const healthType = interaction.options.getString('type') || 'overview';
            const { getDbResilience } = require('../models/db');
            
            // Get health monitor from the bot client
            const healthMonitor = interaction.client.healthMonitor;
            
            if (!healthMonitor) {
                return interaction.editReply({
                    content: '❌ Health monitoring system is not available.',
                });
            }

            let embed;
            
            switch (healthType) {
                case 'overview':
                    embed = await createOverviewEmbed(healthMonitor);
                    break;
                case 'detailed':
                    embed = await createDetailedEmbed(healthMonitor);
                    break;
                case 'database':
                    embed = await createDatabaseEmbed(getDbResilience());
                    break;
                case 'performance':
                    embed = await createPerformanceEmbed(healthMonitor);
                    break;
                default:
                    embed = await createOverviewEmbed(healthMonitor);
            }

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in /health:', error);
            try {
                await interaction.editReply({
                    content: '❌ An error occurred while checking bot health.',
                });
            } catch (err) {
                console.error('Error editing reply:', err);
            }
        }
    }
};

async function createOverviewEmbed(healthMonitor) {
    const healthReport = healthMonitor.getHealthReport();
    const statusEmoji = getStatusEmoji(healthReport.current.status);
    
    // Get session recovery stats
    const sessionRecovery = require('../utils/sessionRecovery');
    const recoveryStats = sessionRecovery.getRecoveryStats();
    
    const embed = new EmbedBuilder()
        .setTitle('🩺 Bot Health Overview')
        .setColor(getStatusColor(healthReport.current.status))
        .setDescription(`**System Status:** ${statusEmoji} ${healthReport.current.status.toUpperCase()}`)
        .setTimestamp();

    if (healthReport.current.status === 'healthy') {
        embed.addFields([
            {
                name: '✅ System Health',
                value: `All systems operational\nUptime: ${healthReport.uptime.percent}%`,
                inline: true
            },
            {
                name: '📊 Quick Stats',
                value: `Health Checks: ${healthReport.uptime.healthy}/${healthReport.uptime.total}\nLast Update: <t:${Math.floor(new Date(healthReport.lastUpdate).getTime() / 1000)}:R>`,
                inline: true
            },
            {
                name: '🛡️ Session Recovery',
                value: `Status: ${recoveryStats.isInitialized ? '✅ Active' : '❌ Inactive'}\nActive Sessions: ${recoveryStats.activeSessions}\nAuto-Save: ${recoveryStats.isPeriodicSavingActive ? '✅' : '❌'}`,
                inline: true
            }
        ]);
    } else {
        const issues = healthReport.current.issues || [];
        embed.addFields([
            {
                name: '⚠️ Issues Detected',
                value: issues.length > 0 ? 
                    issues.slice(0, 3).map(issue => `• ${issue.name}: ${issue.error}`).join('\n') :
                    'Unknown issues detected',
                inline: false
            },
            {
                name: '📈 Uptime',
                value: `${healthReport.uptime.percent}% (${healthReport.uptime.healthy}/${healthReport.uptime.total})`,
                inline: true
            }
        ]);
    }

    // Add trends if available
    if (healthReport.trends && Object.keys(healthReport.trends).length > 0) {
        const trendsText = Object.entries(healthReport.trends)
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n');
        
        embed.addFields([{
            name: '📈 Trends',
            value: trendsText,
            inline: true
        }]);
    }

    return embed;
}

async function createDetailedEmbed(healthMonitor) {
    const healthReport = healthMonitor.getHealthReport();
    const statusEmoji = getStatusEmoji(healthReport.current.status);
    
    const embed = new EmbedBuilder()
        .setTitle('🔍 Detailed Health Report')
        .setColor(getStatusColor(healthReport.current.status))
        .setDescription(`**Overall Status:** ${statusEmoji} ${healthReport.current.status.toUpperCase()}`)
        .setTimestamp();

    // Individual health checks
    const checks = healthReport.checks;
    const healthyChecks = [];
    const unhealthyChecks = [];

    Object.entries(checks).forEach(([name, result]) => {
        if (result.status === 'healthy') {
            healthyChecks.push(name);
        } else {
            unhealthyChecks.push(`${name}: ${result.error || 'degraded'}`);
        }
    });

    if (healthyChecks.length > 0) {
        embed.addFields([{
            name: '✅ Healthy Components',
            value: healthyChecks.map(check => `• ${check}`).join('\n'),
            inline: false
        }]);
    }

    if (unhealthyChecks.length > 0) {
        embed.addFields([{
            name: '🚨 Issues',
            value: unhealthyChecks.map(issue => `• ${issue}`).join('\n'),
            inline: false
        }]);
    }

    // Memory information
    const memoryCheck = checks.memory;
    if (memoryCheck && memoryCheck.status === 'healthy') {
        const mem = memoryCheck.details;
        const memoryInfo = [];
        
        // Show heap usage (most important for Node.js)
        memoryInfo.push(`**Heap:** ${mem.heap.used}MB / ${mem.heap.total}MB (${mem.heap.usagePercent}%)`);
        
        // Show process memory (RSS + external)
        memoryInfo.push(`**Process:** ${mem.process.total}MB (RSS: ${mem.process.rss}MB)`);
        
        // Show system memory if available
        if (mem.system && mem.system.total > 0) {
            memoryInfo.push(`**System:** ${mem.system.used}MB / ${mem.system.total}MB (${mem.system.usagePercent}%)`);
        }
        
        embed.addFields([{
            name: '💾 Memory Usage',
            value: memoryInfo.join('\n'),
            inline: true
        }]);
    }

    return embed;
}

async function createDatabaseEmbed(dbResilience) {
    const embed = new EmbedBuilder()
        .setTitle('🗄️ Database Health Report')
        .setColor(0x3498db)
        .setTimestamp();

    try {
        const healthCheck = await dbResilience.healthCheck();
        const metrics = dbResilience.getMetrics();

        if (healthCheck.status === 'healthy') {
            embed.setColor(0x2ecc71)
                .setDescription('✅ Database is healthy and responsive');

            embed.addFields([
                {
                    name: '⚡ Performance',
                    value: `Response Time: ${healthCheck.responseTime}ms\nPool Utilization: ${healthCheck.poolUtilization}%`,
                    inline: true
                },
                {
                    name: '🔗 Connections',
                    value: `Active: ${metrics.poolStats.totalCount}\nIdle: ${metrics.poolStats.idleCount}\nWaiting: ${metrics.poolStats.waitingCount}`,
                    inline: true
                },
                {
                    name: '📊 Query Stats',
                    value: `Total: ${metrics.connections.totalQueries}\nFailed: ${metrics.connections.failedQueries}\nDeadlocks: ${metrics.connections.deadlocks}`,
                    inline: true
                }
            ]);

            // Circuit breaker status
            const cbStatus = Object.entries(metrics.circuitBreakers)
                .map(([name, state]) => `${name}: ${state.state}`)
                .join('\n');

            embed.addFields([{
                name: '🔌 Circuit Breakers',
                value: cbStatus,
                inline: true
            }]);

        } else {
            embed.setColor(0xe74c3c)
                .setDescription('🚨 Database health issues detected')
                .addFields([{
                    name: '❌ Error',
                    value: healthCheck.error,
                    inline: false
                }]);
        }

    } catch (error) {
        embed.setColor(0xe74c3c)
            .setDescription('❌ Unable to perform database health check')
            .addFields([{
                name: 'Error',
                value: error.message,
                inline: false
            }]);
    }

    return embed;
}

async function createPerformanceEmbed(healthMonitor) {
    const healthReport = healthMonitor.getHealthReport();
    
    const embed = new EmbedBuilder()
        .setTitle('⚡ Performance Health Report')
        .setColor(0xf39c12)
        .setTimestamp();

    const perfCheck = healthReport.checks.performance;
    const responseCheck = healthReport.checks.command_responsiveness;
    const cacheCheck = healthReport.checks.cache_system;

    if (perfCheck && perfCheck.status === 'healthy') {
        const perf = perfCheck.details;
        embed.addFields([
            {
                name: '🎯 Commands',
                value: `Active: ${Object.keys(perf.commands).length}\nTotal Queries: ${perf.database.totalQueries}`,
                inline: true
            },
            {
                name: '🔍 Issues',
                value: `Bottlenecks: ${perf.bottlenecks}\nCritical: ${perf.criticalIssues}`,
                inline: true
            }
        ]);
    }

    if (responseCheck && responseCheck.status === 'healthy') {
        const resp = responseCheck.details;
        embed.addFields([{
            name: '⏱️ Response Times',
            value: `Average: ${resp.averageResponseTime}ms\nError Rate: ${resp.errorRate}%\nSlow Commands: ${resp.slowCommands}`,
            inline: true
        }]);
    }

    if (cacheCheck && cacheCheck.status === 'healthy') {
        const cache = cacheCheck.details;
        embed.addFields([{
            name: '🗄️ Cache Performance',
            value: `Hit Rate: ${cache.hitRate}%\nSize: ${cache.size} entries\nEfficiency: ${cache.efficiency}`,
            inline: true
        }]);
    }

    // Add trends
    if (healthReport.trends && Object.keys(healthReport.trends).length > 0) {
        const trendsText = Object.entries(healthReport.trends)
            .map(([key, value]) => `${key}: ${getTrendEmoji(value)} ${value}`)
            .join('\n');
        
        embed.addFields([{
            name: '📈 Performance Trends',
            value: trendsText,
            inline: false
        }]);
    }

    return embed;
}

function getStatusEmoji(status) {
    switch (status) {
        case 'healthy': return '🟢';
        case 'degraded': return '🟡';
        case 'critical': return '🔴';
        default: return '⚪';
    }
}

function getStatusColor(status) {
    switch (status) {
        case 'healthy': return 0x2ecc71;
        case 'degraded': return 0xf39c12;
        case 'critical': return 0xe74c3c;
        default: return 0x95a5a6;
    }
}

function getTrendEmoji(trend) {
    switch (trend) {
        case 'improving': return '📈';
        case 'stable': return '➡️';
        case 'slowing':
        case 'increasing':
        case 'decreasing': return '📉';
        default: return '➡️';
    }
}
