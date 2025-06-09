const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { createHeader, formatDataTable, createStatsCard, createInfoSection } = require('../utils/visualHelpers');
const { createHealthTemplate } = require('../utils/embedTemplates');
const { safeDeferReply, safeErrorReply } = require('../utils/interactionUtils');

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
            // Immediately defer to prevent timeout
            const deferred = await safeDeferReply(interaction);
            if (!deferred) {
                console.warn('Failed to defer health interaction');
                return;
            }

            const healthType = interaction.options.getString('type') || 'overview';
            const { getDbResilience } = require('../models/db');
            
            // Get health monitor from the bot client
            const healthMonitor = interaction.client.healthMonitor;
            
            if (!healthMonitor) {
                const { createHealthTemplate } = require('../utils/embedTemplates');
                const embed = createHealthTemplate(
                    'Health System Status', 
                    {
                        status: 'unavailable',
                        statusEmoji: '⚠️',
                        systemHealth: false,
                        message: 'Health monitoring system is not initialized yet. Please wait for bot startup to complete.',
                        troubleshooting: [
                            'The bot may still be starting up',
                            'Database connections may be initializing',
                            'Wait a few moments and try again'
                        ]
                    },
                    { useEnhancedLayout: true }
                );
                return interaction.editReply({ embeds: [embed] });
            }

            // Check if health monitor is fully initialized
            const healthStatus = healthMonitor.getHealthStatus();
            if (healthStatus.status === 'initializing') {
                const { createHealthTemplate } = require('../utils/embedTemplates');
                const embed = createHealthTemplate(
                    'Health System Status', 
                    {
                        status: 'initializing',
                        statusEmoji: '🔄',
                        systemHealth: false,
                        message: 'Health monitoring system is starting up. Please wait a moment...',
                        initializationNote: 'Running initial system checks',
                        estimatedWait: '10-30 seconds'
                    },
                    { useEnhancedLayout: true }
                );
                return interaction.editReply({ embeds: [embed] });
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
    
    // Enhanced header with bigger font
    const headerText = createHeader('Bot Health Overview', `${statusEmoji} ${healthReport.current.status.toUpperCase()}`, '🩺', 'large');
    
    const embed = createHealthTemplate(
        'Bot Health Overview',
        {
            status: healthReport.current.status,
            statusEmoji: statusEmoji,
            systemHealth: healthReport.current.status === 'healthy',
            uptime: healthReport.uptime.percent,
            healthChecks: `${healthReport.uptime.healthy}/${healthReport.uptime.total}`,
            lastUpdate: Math.floor(new Date(healthReport.lastUpdate).getTime() / 1000),
            recoveryStatus: recoveryStats.isInitialized,
            activeSessions: recoveryStats.activeSessions,
            autoSave: recoveryStats.isPeriodicSavingActive,
            issues: healthReport.current.issues || []
        },
        {
            useEnhancedLayout: true,
            useTableFormat: true,
            showBigNumbers: true
        }
    );

    if (healthReport.current.status === 'healthy') {
        // Create table format for system health data
        const healthData = [
            ['System Status', `${statusEmoji} All Operational`],
            ['Uptime Score', `${healthReport.uptime.percent}%`],
            ['Health Checks', `${healthReport.uptime.healthy}/${healthReport.uptime.total}`],
            ['Recovery Status', recoveryStats.isInitialized ? '✅ Active' : '❌ Inactive'],
            ['Active Sessions', `${recoveryStats.activeSessions}`],
            ['Auto-Save', recoveryStats.isPeriodicSavingActive ? '✅ Enabled' : '❌ Disabled']
        ];
        
        const tableText = formatDataTable(healthData, [20, 25]);
        
        embed.addFields([
            {
                name: createHeader('System Status', null, '📊', 'emphasis'),
                value: tableText,
                inline: false
            }
        ]);
    } else {
        const issues = healthReport.current.issues || [];
                embed.addFields([
            {
                name: createHeader('Issues Detected', null, '⚠️', 'emphasis'),
                value: issues.length > 0 ? 
                    issues.slice(0, 3).map(issue => `• **${issue.name}**: ${issue.error}`).join('\n') :
                    'Unknown issues detected',
                inline: false
            }
        ]);
        
        // Add uptime info in table format
        const uptimeData = [
            ['Uptime Score', `${healthReport.uptime.percent}%`],
            ['Health Checks', `${healthReport.uptime.healthy}/${healthReport.uptime.total}`],
            ['Status', 'Needs Attention']
        ];
        
        const uptimeTable = formatDataTable(uptimeData, [15, 20]);
        embed.addFields([{
            name: createHeader('System Metrics', null, '📈', 'emphasis'),
            value: uptimeTable,
            inline: false
        }]);
    }

    // Add trends if available
    if (healthReport.trends && Object.keys(healthReport.trends).length > 0) {
        const trendsData = Object.entries(healthReport.trends)
            .map(([key, value]) => [key, `${getTrendEmoji(value)} ${value}`]);
        
        const trendsTable = formatDataTable(trendsData, [15, 20]);
        embed.addFields([{
            name: createHeader('Performance Trends', null, '📈', 'emphasis'),
            value: trendsTable,
            inline: false
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
