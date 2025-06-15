const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { performanceMonitor } = require('../utils/performanceMonitor');
const queryCache = require('../utils/queryCache');
const databaseOptimizer = require('../utils/databaseOptimizer');
const { createHeader, formatDataTable, createStatsCard, createProgressSection } = require('../utils/visualHelpers');
const { safeDeferReply, safeErrorReply } = require('../utils/interactionUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('performance')
        .setDescription('Comprehensive bot performance and health monitoring')
        .addStringOption(option =>
            option.setName('view')
                .setDescription('Choose the performance view to display')
                .setRequired(false)
                .addChoices(
                    { name: 'Overview (Default)', value: 'overview' },
                    { name: 'Memory Details', value: 'memory' },
                    { name: 'Cache Analysis', value: 'cache' },
                    { name: 'Database Health', value: 'database' },
                    { name: 'System Health', value: 'health' }
                )),
    async execute(interaction) {
        try {
            // Immediately defer to prevent timeout
            const deferred = await safeDeferReply(interaction);
            if (!deferred) {
                console.warn('Failed to defer performance interaction');
                return;
            }

            const view = interaction.options.getString('view') || 'overview';
            const startTime = Date.now();

            // Get health monitor from client
            const healthMonitor = interaction.client.healthMonitor;

            // Gather all performance data
            const summary = performanceMonitor.getPerformanceSummary();
            const bottlenecks = performanceMonitor.identifyBottlenecks();
            const wsLatency = interaction.client.ws.ping;
            const apiLatency = Date.now() - startTime;
            const cacheStats = queryCache.getStats();
            const optimizationReport = databaseOptimizer.getPerformanceReport();
            const healthReport = healthMonitor ? healthMonitor.getHealthReport() : null;

            let embed;

            switch (view) {
            case 'memory':
                embed = createMemoryView(summary);
                break;
            case 'cache':
                embed = createCacheView(cacheStats);
                break;
            case 'database':
                embed = createDatabaseView(summary, optimizationReport);
                break;
            case 'health':
                if (healthReport) {
                    embed = createHealthView(healthReport, wsLatency, apiLatency);
                } else {
                    embed = createHealthUnavailableView(wsLatency, apiLatency);
                }
                break;
            default:
                embed = createOverviewEmbed(summary, bottlenecks, wsLatency, apiLatency, cacheStats, optimizationReport, healthReport);
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('💥 Error in /performance command:', {
                error: error.message,
                stack: error.stack,
                user: interaction.user.tag,
                timestamp: new Date().toISOString()
            });

            await safeErrorReply(interaction, {
                title: 'Performance Check Error',
                description: 'Unable to check performance right now. Please try again later.',
                color: 0xED4245
            });
        }
    }
};

/**
 * Create comprehensive overview embed (default view)
 */
function createOverviewEmbed(summary, bottlenecks, wsLatency, apiLatency, cacheStats, optimizationReport, healthReport) {
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
        .setTitle(createHeader('Bot Performance Dashboard', healthStatus, '📊', 'large'))
        .setColor(healthColor)
        .setTimestamp();

    // Performance overview with key metrics
    const overviewStats = createStatsCard('System Overview', {
        'Status': healthStatus,
        'Uptime': `${uptimeHours}h ${uptimeMinutes}m`,
        'Commands': `${summary.commands.total}`,
        'Memory': `${memUsage.heapUsed}MB`,
        'Cache Hit Rate': cacheStats.hitRate,
        'Discord Latency': `${wsLatency}ms`
    }, {
        showBigNumbers: true,
        emphasizeFirst: true
    });

    embed.setDescription(`${healthMessage}\n\n${overviewStats}`);

    // Core metrics table
    const metricsData = [
        ['System Status', healthStatus],
        ['Memory Usage', `${memUsage.heapUsed}MB / ${memUsage.heapTotal}MB`],
        ['Cache Performance', `${cacheStats.hitRate} (${cacheStats.size} entries)`],
        ['Database Queries', `${summary.database.totalQueries} total`],
        ['Active Connections', `${summary.database.activeConnections}`],
        ['Network Latency', `Discord: ${wsLatency}ms | API: ${apiLatency}ms`]
    ];

    const metricsTable = formatDataTable(metricsData, [18, 25]);

    embed.addFields([
        {
            name: createHeader('Key Metrics', null, '⚡', 'emphasis'),
            value: metricsTable,
            inline: false
        }
    ]);

    // Add issues summary if any exist
    if (bottlenecks.length > 0) {
        const issuesText = getIssuesSummary(bottlenecks);
        embed.addFields([{
            name: '⚠️ Issues Detected',
            value: issuesText,
            inline: false
        }]);
    }

    // Quick action tips
    const tips = [];
    if (memoryPercentage > 70) tips.push('• Monitor memory usage closely');
    if (apiLatency > 200) tips.push('• Check database performance');
    if (parseInt(cacheStats.hitRate) < 50) tips.push('• Cache is warming up');
    if (wsLatency > 100) tips.push('• Network connectivity may be slow');

    if (tips.length > 0) {
        embed.addFields([{
            name: '💡 Quick Tips',
            value: tips.join('\n'),
            inline: false
        }]);
    }

    embed.setFooter({ text: 'Use /performance view:[type] for detailed views | Updates in real-time' });

    return embed;
}

/**
 * Create detailed memory view
 */
function createMemoryView(summary) {
    const memUsage = summary.memory.current;

    // Get Node.js memory limits
    const v8 = require('v8');
    const heapStats = v8.getHeapStatistics();
    const maxHeapMB = Math.round(heapStats.heap_size_limit / 1024 / 1024);
    const availableHeapMB = Math.round((heapStats.heap_size_limit - memUsage.heapUsed) / 1024 / 1024);

    // Calculate percentages
    const heapUsagePercent = ((memUsage.heapUsed / memUsage.heapTotal) * 100).toFixed(1);
    const capacityPercent = ((memUsage.heapUsed / heapStats.heap_size_limit) * 100).toFixed(2);

    // Determine status based on V8 capacity, not current heap allocation
    let statusIcon = '🟢';
    let statusText = 'Healthy';
    let statusExplanation = 'Efficient memory usage';

    if (parseFloat(capacityPercent) > 85) {
        statusIcon = '🔴';
        statusText = 'High Capacity';
        statusExplanation = 'Approaching V8 memory limit';
    } else if (parseFloat(capacityPercent) > 70) {
        statusIcon = '🟡';
        statusText = 'Moderate Capacity';
        statusExplanation = 'Higher than typical usage';
    } else if (parseFloat(heapUsagePercent) > 95) {
        statusIcon = '🟡';
        statusText = 'Efficient';
        statusExplanation = 'High heap efficiency (normal)';
    }

    const embed = new EmbedBuilder()
        .setTitle(createHeader('Memory Analysis', `${statusIcon} ${statusText}`, '🧠', 'large'))
        .setColor(statusIcon === '🟢' ? '#00ff00' : statusIcon === '🟡' ? '#ffff00' : '#ff0000')
        .setTimestamp();

    // Memory overview stats with better context
    const memoryStats = createStatsCard('Memory Overview', {
        'Heap Efficiency': `${heapUsagePercent}%`,
        'V8 Capacity': `${capacityPercent}%`,
        'Available Space': `${availableHeapMB}MB`,
        'Status': `${statusIcon} ${statusExplanation}`
    }, {
        showBigNumbers: true,
        emphasizeFirst: true
    });

    embed.setDescription(`**${statusText}** - ${statusExplanation}\n\n${memoryStats}`);

    // Memory breakdown table with better context
    const memoryData = [
        ['Heap Used', `${memUsage.heapUsed}MB`, `${heapUsagePercent}% (efficiency)`],
        ['Heap Total', `${memUsage.heapTotal}MB`, 'Current allocation'],
        ['V8 Capacity', `${capacityPercent}%`, `of ${maxHeapMB}MB limit`],
        ['RSS Memory', `${memUsage.rss}MB`, 'Process total'],
        ['Available', `${availableHeapMB}MB`, 'Can grow to']
    ];

    const memoryTable = formatDataTable(memoryData, [15, 12, 18]);

    embed.addFields([
        {
            name: createHeader('Memory Breakdown', null, '📊', 'emphasis'),
            value: memoryTable,
            inline: false
        }
    ]);

    // Memory usage progress bars
    const heapProgress = createProgressSection('Heap Usage', memUsage.heapUsed, memUsage.heapTotal, {
        showPercentage: true,
        showNumbers: true,
        barLength: 20
    });

    const capacityProgress = createProgressSection('Node.js Capacity', memUsage.heapUsed, maxHeapMB, {
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

    // Memory trend analysis
    if (Math.abs(summary.memory.trend) > 2) {
        const trendIcon = summary.memory.trend > 0 ? '📈' : '📉';
        const trendText = summary.memory.trend > 0 ? 'increasing' : 'decreasing';
        embed.addFields([{
            name: `${trendIcon} Memory Trend`,
            value: `Memory usage is ${trendText} (${summary.memory.trend > 0 ? '+' : ''}${summary.memory.trend.toFixed(1)}MB/min)`,
            inline: false
        }]);
    }

    // Add informational note about heap efficiency
    if (parseFloat(heapUsagePercent) > 90 && parseFloat(capacityPercent) < 50) {
        embed.addFields([{
            name: '💡 Memory Insight',
            value: 'High heap efficiency (>90%) is **normal and healthy** for Node.js applications. V8 automatically manages heap size and will expand when needed.',
            inline: false
        }]);
    }

    embed.setFooter({
        text: `V8 Limit: ${maxHeapMB}MB | Heap efficiency shows how well allocated memory is used`
    });

    return embed;
}

/**
 * Create detailed cache view
 */
function createCacheView(cacheStats) {
    const efficiency = parseInt(cacheStats.hitRate) || 0;

    let statusIcon = '🟢';
    let statusText = 'Excellent';
    if (efficiency < 30) {
        statusIcon = '🔴';
        statusText = 'Poor';
    } else if (efficiency < 60) {
        statusIcon = '🟡';
        statusText = 'Fair';
    }

    const embed = new EmbedBuilder()
        .setTitle(createHeader('Cache Performance Analysis', `${statusIcon} ${statusText}`, '💾', 'large'))
        .setColor(statusIcon === '🟢' ? '#00ff00' : statusIcon === '🟡' ? '#ffff00' : '#ff0000')
        .setTimestamp();

    // Cache overview stats
    const cacheOverview = createStatsCard('Cache Performance', {
        'Hit Rate': cacheStats.hitRate,
        'Total Queries': `${cacheStats.total}`,
        'Cache Entries': `${cacheStats.size}`,
        'Memory Usage': cacheStats.memoryUsage
    }, {
        showBigNumbers: true,
        emphasizeFirst: true
    });

    embed.setDescription(`Cache system performance metrics and optimization analysis\n\n${cacheOverview}`);

    // Cache metrics table
    const cacheData = [
        ['Hit Rate', cacheStats.hitRate],
        ['Cache Hits', `${cacheStats.hits}`],
        ['Cache Misses', `${cacheStats.misses}`],
        ['Total Queries', `${cacheStats.total}`],
        ['Entries Stored', `${cacheStats.size}`],
        ['Memory Usage', cacheStats.memoryUsage]
    ];

    const cacheTable = formatDataTable(cacheData, [15, 20]);

    embed.addFields([
        {
            name: createHeader('Cache Metrics', null, '📊', 'emphasis'),
            value: cacheTable,
            inline: false
        }
    ]);

    // Performance impact analysis
    if (cacheStats.hits > 0) {
        const savedQueries = cacheStats.hits;
        const estimatedTimeSaved = (cacheStats.hits * 50).toFixed(0);

        const impactData = [
            ['Queries Prevented', `${savedQueries}`],
            ['Estimated Time Saved', `${estimatedTimeSaved}ms`],
            ['Database Load Reduced', `${((cacheStats.hits / cacheStats.total) * 100).toFixed(1)}%`]
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
                value: 'Cache is building up - performance gains will increase over time',
                inline: false
            }
        ]);
    }

    // Cache recommendations
    const recommendations = [];
    if (efficiency < 30) recommendations.push('• Cache is warming up - performance will improve');
    if (efficiency >= 90) recommendations.push('• Excellent cache performance - system optimized');
    if (cacheStats.size > 1000) recommendations.push('• Consider cache cleanup for memory optimization');

    if (recommendations.length > 0) {
        embed.addFields([{
            name: '💡 Recommendations',
            value: recommendations.join('\n'),
            inline: false
        }]);
    }

    embed.setFooter({ text: 'Cache auto-cleans expired entries every 3 minutes' });

    return embed;
}

/**
 * Create database health view
 */
function createDatabaseView(summary, optimizationReport) {
    const dbHealth = getDatabaseHealth(summary);
    const healthIcon = dbHealth.includes('🟢') ? '🟢' : dbHealth.includes('🟡') ? '🟡' : '🔴';

    const embed = new EmbedBuilder()
        .setTitle(createHeader('Database Performance Analysis', dbHealth, '🗄️', 'large'))
        .setColor(healthIcon === '🟢' ? '#00ff00' : healthIcon === '🟡' ? '#ffff00' : '#ff0000')
        .setTimestamp();

    // Database overview
    const dbStats = createStatsCard('Database Overview', {
        'Status': dbHealth,
        'Total Queries': `${summary.database.totalQueries}`,
        'Active Connections': `${summary.database.activeConnections}`,
        'Average Response': getAverageResponseTime(summary)
    }, {
        showBigNumbers: true,
        emphasizeFirst: true
    });

    embed.setDescription(dbStats);

    // Database metrics table
    const dbData = [
        ['Connection Status', dbHealth],
        ['Total Queries', `${summary.database.totalQueries}`],
        ['Active Connections', `${summary.database.activeConnections}`],
        ['Slowest Operations', (summary.database.slowest && summary.database.slowest.length > 0) ? summary.database.slowest[0][0] : 'None'],
        ['Error-Prone Operations', (summary.database.errorProne && summary.database.errorProne.length > 0) ? summary.database.errorProne[0][0] : 'None']
    ];

    const dbTable = formatDataTable(dbData, [18, 25]);

    embed.addFields([
        {
            name: createHeader('Database Metrics', null, '📊', 'emphasis'),
            value: dbTable,
            inline: false
        }
    ]);

    // Optimization insights
    if (optimizationReport && Object.keys(optimizationReport).length > 0) {
        const optimizationText = getOptimizationSummary(optimizationReport);
        embed.addFields([{
            name: createHeader('Optimization Insights', null, '⚙️', 'emphasis'),
            value: optimizationText,
            inline: false
        }]);
    }

    embed.setFooter({ text: 'Database performance tracked in real-time' });

    return embed;
}

/**
 * Create system health view
 */
function createHealthView(healthReport, wsLatency, apiLatency) {
    const overallStatus = healthReport && healthReport.current ? healthReport.current.status : (healthReport && healthReport.status ? healthReport.status : 'unknown');
    const statusIcon = overallStatus === 'healthy' ? '🟢' : overallStatus === 'degraded' ? '🟡' : '🔴';

    const embed = new EmbedBuilder()
        .setTitle(createHeader('System Health Analysis', `${statusIcon} ${overallStatus.toUpperCase()}`, '🏥', 'large'))
        .setColor(statusIcon === '🟢' ? '#00ff00' : statusIcon === '🟡' ? '#ffff00' : '#ff0000')
        .setTimestamp();

    // Health overview
    const healthStats = createStatsCard('System Health', {
        'Overall Status': `${statusIcon} ${overallStatus.toUpperCase()}`,
        'Discord Latency': `${wsLatency}ms`,
        'API Response': `${apiLatency}ms`,
        'Dependencies': healthReport && healthReport.checks ? `${Object.keys(healthReport.checks).length} checked` : '0 checked'
    }, {
        showBigNumbers: true,
        emphasizeFirst: true
    });

    embed.setDescription(healthStats);

    // Health checks table
    const healthData = [];
    if (healthReport && healthReport.checks) {
        for (const [checkName, checkResult] of Object.entries(healthReport.checks)) {
            const statusEmoji = getStatusEmoji(checkResult.status);
            const checkDisplayName = checkName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            healthData.push([checkDisplayName, `${statusEmoji} ${checkResult.status}`]);
        }
    } else {
        healthData.push(['No Health Checks', '⚪ No data available']);
    }

    const healthTable = formatDataTable(healthData, [18, 15]);

    embed.addFields([
        {
            name: createHeader('Health Checks', null, '🔍', 'emphasis'),
            value: healthTable,
            inline: false
        }
    ]);

    // Trends if available
    if (healthReport && healthReport.trends && Object.keys(healthReport.trends).length > 0) {
        const trendsText = Object.entries(healthReport.trends)
            .map(([key, value]) => `${key}: ${getTrendEmoji(value)} ${value}`)
            .join('\n');

        embed.addFields([{
            name: createHeader('Performance Trends', null, '📈', 'emphasis'),
            value: trendsText,
            inline: false
        }]);
    }

    embed.setFooter({ text: 'Health monitoring runs continuously in the background' });

    return embed;
}

/**
 * Create health unavailable view when health monitor is not ready
 */
function createHealthUnavailableView(wsLatency, apiLatency) {
    const embed = new EmbedBuilder()
        .setTitle(createHeader('System Health Analysis', '⚠️ UNAVAILABLE', '🏥', 'large'))
        .setColor('#ffff00')
        .setTimestamp();

    // Basic stats without health monitor
    const basicStats = createStatsCard('Basic System Status', {
        'Health Monitor': '⚠️ Initializing',
        'Discord Latency': `${wsLatency}ms`,
        'API Response': `${apiLatency}ms`,
        'Status': 'Partial data available'
    }, {
        showBigNumbers: true,
        emphasizeFirst: true
    });

    embed.setDescription(`Health monitoring system is initializing. Basic metrics available.\n\n${basicStats}`);

    embed.addFields([
        {
            name: createHeader('Available Metrics', null, '📊', 'emphasis'),
            value: 'Discord Connection: ✅ Active\nAPI Response: ✅ Responding\nHealth Monitor: ⏳ Starting up',
            inline: false
        },
        {
            name: '💡 Information',
            value: 'Full health monitoring will be available once the bot finishes initialization.\nTry using other performance views in the meantime.',
            inline: false
        }
    ]);

    embed.setFooter({ text: 'Use /performance view:overview for basic metrics' });

    return embed;
}

/**
 * Helper functions
 */
function getAverageResponseTime(summary) {
    if (summary.database.totalQueries === 0) return 'No data';

    let totalTime = 0;
    let totalOperations = 0;

    // Safely iterate through slowest operations if they exist
    if (summary.database.slowest && Array.isArray(summary.database.slowest)) {
        for (const [, metrics] of summary.database.slowest) {
            if (metrics && metrics.totalTime && metrics.count) {
                totalTime += metrics.totalTime;
                totalOperations += metrics.count;
            }
        }
    }

    return totalOperations > 0 ? `${Math.round(totalTime / totalOperations)}ms` : 'No data';
}

function getDatabaseHealth(summary) {
    let errorRate = 0;

    // Safely calculate error rate
    if (summary.database.errorProne && Array.isArray(summary.database.errorProne) && summary.database.errorProne.length > 0) {
        const firstErrorProne = summary.database.errorProne[0];
        if (firstErrorProne && firstErrorProne[1] && firstErrorProne[1].errors && firstErrorProne[1].count) {
            errorRate = firstErrorProne[1].errors / firstErrorProne[1].count;
        }
    }

    if (summary.database.activeConnections > 15) return '🟡 High load';
    if (errorRate > 0.1) return '🔴 Errors detected';
    if (summary.database.totalQueries > 0) return '🟢 Healthy';
    return '⚪ No activity';
}

function getIssuesSummary(bottlenecks) {
    const critical = bottlenecks.filter(b => b.severity === 'critical');
    const high = bottlenecks.filter(b => b.severity === 'high');
    const medium = bottlenecks.filter(b => b.severity === 'medium');

    const issues = [];
    if (critical.length > 0) issues.push(`🔴 **Critical:** ${critical[0].message}`);
    if (high.length > 0) issues.push(`🟡 **High:** ${high[0].message}`);
    if (medium.length > 0) issues.push(`🟠 **Medium:** ${medium[0].message}`);

    return issues.slice(0, 3).join('\n') || 'No issues detected';
}

function getOptimizationSummary(optimizationReport) {
    const summary = [];

    // Query analysis insights
    if (optimizationReport.queryAnalysis) {
        const analysis = optimizationReport.queryAnalysis;
        summary.push(`🔍 Queries: ${analysis.totalQueries} total, ${analysis.slowQueryRate}% slow`);

        if (analysis.topSlowOperations && analysis.topSlowOperations.length > 0) {
            const slowest = analysis.topSlowOperations[0];
            summary.push(`⏱️ Slowest: ${slowest.operation} (${slowest.avgTime.toFixed(0)}ms avg)`);
        }
    }

    // Connection pool insights
    if (optimizationReport.connectionPool) {
        const poolData = optimizationReport.connectionPool;
        if (poolData.stats) {
            const pool = poolData.stats;
            const utilization = ((pool.totalConnections / pool.maxConnections) * 100).toFixed(1);
            summary.push(`🏊 Pool: ${pool.totalConnections}/${pool.maxConnections} (${utilization}%)`);
        }
    }

    // Cache performance
    if (optimizationReport.cacheStats) {
        const cache = optimizationReport.cacheStats;
        const hitRate = parseFloat(cache.hitRate) || 0;
        if (hitRate > 0) {
            summary.push(`💾 Cache: ${cache.hitRate} hit rate (${cache.size} entries)`);
        } else {
            summary.push(`💾 Cache: Building up (${cache.size} entries)`);
        }
    }

    return summary.join('\n') || 'No optimization data available';
}

function getStatusEmoji(status) {
    switch (status) {
    case 'healthy': return '🟢';
    case 'degraded': return '🟡';
    case 'unhealthy': return '🔴';
    default: return '⚪';
    }
}

function getTrendEmoji(trend) {
    if (typeof trend === 'string') {
        if (trend.includes('up') || trend.includes('increasing')) return '📈';
        if (trend.includes('down') || trend.includes('decreasing')) return '📉';
        return '➡️';
    }
    return '➡️';
}
