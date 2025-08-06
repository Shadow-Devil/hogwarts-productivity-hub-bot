const { HealthChecker } = require('./faultTolerance');
const { performanceMonitor } = require('./performanceMonitor');

/**
 * Comprehensive Health Monitoring System
 * Monitors Discord bot health, database, memory, and performance
 */
class BotHealthMonitor {
    constructor(client, databaseResilience) {
        this.client = client;
        this.databaseResilience = databaseResilience;
        this.healthChecker = new HealthChecker();
        this.healthHistory = [];
        this.maxHistorySize = 100;
        this.alertThresholds = {
            heapUsagePercent: 95,    // Increased threshold - Discord bots typically use 70-90% heap
            rssMemoryMB: 1000,       // Added RSS memory threshold (1GB)
            responseTimeMs: 5000,
            errorRatePercent: 10,
            dbConnectionUtilization: 80
        };

        this.setupHealthChecks();
        this.startPeriodicChecks();
    }

    setupHealthChecks() {
        // Discord Client Health Check
        this.healthChecker.registerCheck('discord_client', async() => {
            if (!this.client.isReady()) {
                throw new Error('Discord client is not ready');
            }

            const wsLatency = this.client.ws.ping;
            if (wsLatency > 1000) {
                throw new Error(`High WebSocket latency: ${wsLatency}ms`);
            }

            return {
                status: 'connected',
                guilds: this.client.guilds.cache.size,
                users: this.client.users.cache.size,
                wsLatency,
                uptime: process.uptime()
            };
        }, { critical: true, timeout: 5000 });

        // Database Health Check
        this.healthChecker.registerCheck('database', async() => {
            return await this.databaseResilience.healthCheck();
        }, { critical: true, timeout: 10000 });

        // Memory Health Check
        this.healthChecker.registerCheck('memory', async() => {
            const memUsage = process.memoryUsage();

            // Focus on Node.js process memory instead of system memory
            const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
            const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
            const rssMB = Math.round(memUsage.rss / 1024 / 1024);
            const externalMB = Math.round(memUsage.external / 1024 / 1024);

            // Calculate heap usage percentage (more relevant for Node.js)
            const heapUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

            // Get V8 heap statistics for more accurate limits
            const v8 = require('v8');
            const heapStats = v8.getHeapStatistics();
            const maxHeapMB = Math.round(heapStats.heap_size_limit / 1024 / 1024);
            const capacityPercent = (memUsage.heapUsed / heapStats.heap_size_limit) * 100;

            // Get system memory for context (but don't use it for health checks)
            let systemMemory = { used: 0, total: 0, usagePercent: 0 };
            try {
                const os = require('os');
                const totalMemory = os.totalmem();
                const freeMemory = os.freemem();
                const usedMemory = totalMemory - freeMemory;

                systemMemory = {
                    used: Math.round(usedMemory / 1024 / 1024),
                    total: Math.round(totalMemory / 1024 / 1024),
                    usagePercent: ((usedMemory / totalMemory) * 100).toFixed(1)
                };
            } catch (error) {
                // In some environments (containers, etc.) OS module might not work as expected
                console.warn('Could not get system memory info:', error.message);
            }

            // More realistic thresholds based on V8 capacity, not current heap allocation
            // Only fail if we're truly close to V8's memory limit or have excessive RSS
            if (capacityPercent > 85) {
                throw new Error(`Critical V8 heap capacity: ${capacityPercent.toFixed(1)}% of ${maxHeapMB}MB limit`);
            }

            // Check for excessive RSS usage (Discord bots should stay under 500MB RSS typically)
            if (rssMB > 500) {
                throw new Error(`High RSS memory usage: ${rssMB}MB (consider process restart)`);
            }

            // Log memory status for better monitoring
            const efficiency = heapUsagePercent > 98 ? 'very-high' : heapUsagePercent > 90 ? 'high' : 'normal';

            // Enhanced logging for memory insights
            if (heapUsagePercent > 90) {
                console.log(`🟡 Memory efficiency: ${efficiency} - Heap ${heapUsagePercent.toFixed(1)}% full (${heapUsedMB}/${heapTotalMB}MB)`);
            }

            if (capacityPercent > 60) {
                console.log(`📊 V8 capacity usage: ${capacityPercent.toFixed(1)}% of ${maxHeapMB}MB limit`);
            }

            return {
                heap: {
                    used: heapUsedMB,
                    total: heapTotalMB,
                    usagePercent: heapUsagePercent.toFixed(1),
                    status: efficiency,
                    maxCapacity: maxHeapMB,
                    capacityPercent: capacityPercent.toFixed(1)
                },
                process: {
                    rss: rssMB,
                    external: externalMB,
                    total: rssMB + externalMB,
                    status: rssMB > 300 ? 'high' : rssMB > 150 ? 'moderate' : 'normal'
                },
                system: systemMemory
            };
        }, { critical: false, timeout: 2000 });

        // Performance Health Check
        this.healthChecker.registerCheck('performance', async() => {
            const summary = performanceMonitor.getPerformanceSummary();
            const bottlenecks = performanceMonitor.identifyBottlenecks();

            // Check for critical performance issues
            const criticalIssues = bottlenecks.filter(issue => issue.severity === 'high');
            if (criticalIssues.length > 0) {
                throw new Error(`Critical performance issues: ${criticalIssues.map(i => i.message).join(', ')}`);
            }

            return {
                commands: summary.commands,
                database: summary.database,
                bottlenecks: bottlenecks.length,
                criticalIssues: criticalIssues.length
            };
        }, { critical: false, timeout: 3000 });

        // Command Response Health Check
        this.healthChecker.registerCheck('command_responsiveness', async() => {
            const summary = performanceMonitor.getPerformanceSummary();

            // Check average response times
            const commandStats = Object.values(summary.commands);
            if (commandStats.length > 0) {
                const avgResponseTime = commandStats.reduce((sum, cmd) => sum + cmd.averageTime, 0) / commandStats.length;

                if (avgResponseTime > this.alertThresholds.responseTimeMs) {
                    throw new Error(`Slow command responses: ${avgResponseTime.toFixed(0)}ms average`);
                }

                // Check error rates
                const totalCommands = commandStats.reduce((sum, cmd) => sum + cmd.count, 0);
                const totalErrors = commandStats.reduce((sum, cmd) => sum + cmd.errors, 0);
                const errorRate = totalCommands > 0 ? (totalErrors / totalCommands) * 100 : 0;

                if (errorRate > this.alertThresholds.errorRatePercent) {
                    throw new Error(`High command error rate: ${errorRate.toFixed(1)}%`);
                }

                return {
                    averageResponseTime: Math.round(avgResponseTime),
                    totalCommands,
                    errorRate: errorRate.toFixed(1),
                    slowCommands: commandStats.filter(cmd => cmd.averageTime > 2000).length
                };
            }

            return { status: 'no_data' };
        }, { critical: false, timeout: 2000 });

        // Cache Health Check
        this.healthChecker.registerCheck('cache_system', async() => {
            const queryCache = require('./queryCache');
            const stats = queryCache.getStats();

            // Check cache hit rate
            const hitRate = stats.total > 0 ? (stats.hits / stats.total) * 100 : 0;

            return {
                hitRate: hitRate.toFixed(1),
                size: stats.size,
                memoryUsage: stats.memoryUsage,
                efficiency: hitRate > 70 ? 'good' : hitRate > 50 ? 'fair' : 'poor'
            };
        }, { critical: false, timeout: 1000 });
    }

    startPeriodicChecks() {
        // Run health checks every 30 seconds
        this.healthCheckInterval = setInterval(async() => {
            try {
                await this.runHealthCheck();
            } catch (error) {
                console.error('Error during periodic health check:', error);
            }
        }, 30000);

        // Log health summary every 5 minutes
        this.healthSummaryInterval = setInterval(() => {
            this.logHealthSummary();
        }, 300000);
    }

    async runHealthCheck() {
        const startTime = Date.now();
        const results = await this.healthChecker.runAllChecks();
        const duration = Date.now() - startTime;

        const healthSnapshot = {
            timestamp: new Date(),
            duration,
            results,
            overall: this.healthChecker.getOverallHealth()
        };

        // Store in history
        this.healthHistory.push(healthSnapshot);
        if (this.healthHistory.length > this.maxHistorySize) {
            this.healthHistory.shift();
        }

        // Check for critical issues
        await this.handleHealthResults(healthSnapshot);

        return healthSnapshot;
    }

    async handleHealthResults(healthSnapshot) {
        const { overall } = healthSnapshot;

        if (overall.status === 'critical') {
            console.error('🚨 CRITICAL HEALTH ISSUES DETECTED:');
            overall.issues.forEach(issue => {
                console.error(`  🔴 ${issue.name}: ${issue.error}`);
            });

            // Auto-recovery attempts
            await this.attemptAutoRecovery(overall.issues);
        } else if (overall.status === 'degraded') {
            console.warn('⚠️ Health degradation detected:');
            overall.issues.forEach(issue => {
                console.warn(`  🟡 ${issue.name}: ${issue.error}`);
            });
        }
    }

    async attemptAutoRecovery(issues) {
        for (const issue of issues) {
            try {
                switch (issue.name) {
                case 'database':
                    console.log('🔄 Attempting database recovery...');
                    this.databaseResilience.resetCircuitBreakers();
                    break;

                case 'memory': {
                    console.log('🧹 Attempting memory cleanup...');
                    if (global.gc) {
                        global.gc();
                    }
                    // Clear old cache entries
                    const queryCache = require('./queryCache');
                    queryCache.clear();
                    break;
                }

                case 'discord_client':
                    console.log('🔌 Discord client issue detected - monitoring for auto-reconnect...');
                    // Discord.js handles reconnection automatically
                    break;
                }
            } catch (recoveryError) {
                console.error(`❌ Auto-recovery failed for ${issue.name}:`, recoveryError);
            }
        }
    }

    logHealthSummary() {
        if (this.healthHistory.length === 0) return;

        const latest = this.healthHistory[this.healthHistory.length - 1];
        const overall = latest.overall;

        console.log('📊 Health Summary:');
        console.log(`   Status: ${this.getStatusEmoji(overall.status)} ${overall.status.toUpperCase()}`);

        if (overall.status === 'healthy') {
            console.log(`   All ${overall.checks} health checks passing`);
        } else {
            console.log(`   Issues: ${overall.issues.length}`);
            overall.issues.forEach(issue => {
                console.log(`     • ${issue.name}: ${issue.error || 'degraded'}`);
            });
        }

        // Performance highlights
        const perfResult = latest.results.performance;
        if (perfResult && perfResult.status === 'healthy') {
            const details = perfResult.details;
            console.log(`   Commands: ${Object.keys(details.commands).length} active`);
            console.log(`   Database: ${details.database.totalQueries} queries, ${details.database.activeConnections} connections`);
        }
    }

    getStatusEmoji(status) {
        switch (status) {
        case 'healthy': return '🟢';
        case 'degraded': return '🟡';
        case 'critical': return '🔴';
        default: return '⚪';
        }
    }

    /**
     * Get comprehensive health report
     */
    getHealthReport() {
        if (this.healthHistory.length === 0) {
            return { status: 'no_data', message: 'No health data available yet' };
        }

        const latest = this.healthHistory[this.healthHistory.length - 1];
        const last10 = this.healthHistory.slice(-10);

        // Calculate uptime percentage for last 10 checks
        const healthyChecks = last10.filter(h => h.overall.status === 'healthy').length;
        const uptimePercent = (healthyChecks / last10.length) * 100;

        return {
            current: latest.overall,
            uptime: {
                percent: uptimePercent.toFixed(1),
                healthy: healthyChecks,
                total: last10.length
            },
            checks: latest.results,
            trends: this.calculateTrends(),
            lastUpdate: latest.timestamp
        };
    }

    /**
     * Get current health status (simplified version of getHealthReport)
     */
    getHealthStatus() {
        if (this.healthHistory.length === 0) {
            return {
                status: 'initializing',
                message: 'Health monitoring is starting up...',
                timestamp: new Date().toISOString()
            };
        }

        const latest = this.healthHistory[this.healthHistory.length - 1];
        return {
            status: latest.overall.status,
            checks: latest.overall.checks,
            issues: latest.overall.issues,
            timestamp: latest.timestamp,
            uptime: process.uptime()
        };
    }

    calculateTrends() {
        if (this.healthHistory.length < 2) return {};

        const recent = this.healthHistory.slice(-5);
        const trends = {};

        // Memory trend
        const memoryValues = recent
            .filter(h => h.results.memory && h.results.memory.status === 'healthy')
            .map(h => parseFloat(h.results.memory.details.system.usagePercent));

        if (memoryValues.length >= 2) {
            const memTrend = memoryValues[memoryValues.length - 1] - memoryValues[0];
            trends.memory = memTrend > 5 ? 'increasing' : memTrend < -5 ? 'decreasing' : 'stable';
        }

        // Response time trend
        const responseValues = recent
            .filter(h => h.results.command_responsiveness && h.results.command_responsiveness.status === 'healthy')
            .map(h => h.results.command_responsiveness.details.averageResponseTime);

        if (responseValues.length >= 2) {
            const respTrend = responseValues[responseValues.length - 1] - responseValues[0];
            trends.responseTime = respTrend > 100 ? 'slowing' : respTrend < -100 ? 'improving' : 'stable';
        }

        return trends;
    }

    /**
     * Manual health check trigger
     */
    async triggerHealthCheck() {
        console.log('🩺 Manual health check triggered...');
        return await this.runHealthCheck();
    }

    /**
     * Cleanup and shutdown
     */
    shutdown() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        if (this.healthSummaryInterval) {
            clearInterval(this.healthSummaryInterval);
        }
        console.log('🩺 Health monitoring stopped');
    }
}

module.exports = BotHealthMonitor;
