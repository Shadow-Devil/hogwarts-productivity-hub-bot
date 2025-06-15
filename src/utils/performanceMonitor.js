/**
 * Performance monitoring utility for the Discord bot
 * Tracks response times, database operations, memory usage, and command execution
 */

class PerformanceMonitor {
    constructor() {
        this.metrics = {
            commands: new Map(), // command name -> { totalExecutions, totalTime, errors, avgResponseTime }
            database: new Map(), // operation -> { count, totalTime, errors }
            memory: [],
            activeConnections: 0,
            startup: null
        };
        this.startTime = Date.now();
        this.memoryInterval = null;

        // Start memory monitoring
        this.startMemoryMonitoring();
    }

    // Start periodic memory monitoring
    startMemoryMonitoring() {
        if (this.memoryInterval) {
            clearInterval(this.memoryInterval);
        }

        this.memoryInterval = setInterval(() => {
            const memUsage = process.memoryUsage();
            const timestamp = Date.now();

            this.metrics.memory.push({
                timestamp,
                rss: memUsage.rss / 1024 / 1024, // MB
                heapUsed: memUsage.heapUsed / 1024 / 1024, // MB
                heapTotal: memUsage.heapTotal / 1024 / 1024, // MB
                external: memUsage.external / 1024 / 1024 // MB
            });

            // Keep only last 1000 memory samples (about 50 minutes of data)
            if (this.metrics.memory.length > 1000) {
                this.metrics.memory = this.metrics.memory.slice(-1000);
            }
        }, 3000); // Sample every 3 seconds (optimized for less overhead)
    }

    // Track command execution performance
    trackCommand(commandName, startTime, endTime, error = null) {
        const executionTime = endTime - startTime;

        if (!this.metrics.commands.has(commandName)) {
            this.metrics.commands.set(commandName, {
                totalExecutions: 0,
                totalTime: 0,
                errors: 0,
                avgResponseTime: 0,
                minTime: Infinity,
                maxTime: 0
            });
        }

        const commandMetrics = this.metrics.commands.get(commandName);
        commandMetrics.totalExecutions++;
        commandMetrics.totalTime += executionTime;
        commandMetrics.errors += error ? 1 : 0;
        commandMetrics.avgResponseTime = commandMetrics.totalTime / commandMetrics.totalExecutions;
        commandMetrics.minTime = Math.min(commandMetrics.minTime, executionTime);
        commandMetrics.maxTime = Math.max(commandMetrics.maxTime, executionTime);
    }

    // Track database operation performance
    trackDatabase(operation, startTime, endTime, error = null) {
        const executionTime = endTime - startTime;

        if (!this.metrics.database.has(operation)) {
            this.metrics.database.set(operation, {
                count: 0,
                totalTime: 0,
                errors: 0,
                avgTime: 0,
                minTime: Infinity,
                maxTime: 0
            });
        }

        const dbMetrics = this.metrics.database.get(operation);
        dbMetrics.count++;
        dbMetrics.totalTime += executionTime;
        dbMetrics.errors += error ? 1 : 0;
        dbMetrics.avgTime = dbMetrics.totalTime / dbMetrics.count;
        dbMetrics.minTime = Math.min(dbMetrics.minTime, executionTime);
        dbMetrics.maxTime = Math.max(dbMetrics.maxTime, executionTime);
    }

    // Update active database connections count
    updateActiveConnections(count) {
        this.metrics.activeConnections = count;
    }

    // Get current performance summary
    getPerformanceSummary() {
        const uptime = Date.now() - this.startTime;
        const currentMemory = process.memoryUsage();

        // Calculate memory trends
        const recentMemory = this.metrics.memory.slice(-60); // Last minute
        const memoryTrend = recentMemory.length > 1 ?
            recentMemory[recentMemory.length - 1].heapUsed - recentMemory[0].heapUsed : 0;

        // Find slowest commands
        const slowestCommands = Array.from(this.metrics.commands.entries())
            .sort((a, b) => b[1].avgResponseTime - a[1].avgResponseTime)
            .slice(0, 5);

        // Find most error-prone operations
        const errorProneOps = Array.from(this.metrics.database.entries())
            .filter(([, metrics]) => metrics.errors > 0)
            .sort((a, b) => (b[1].errors / b[1].count) - (a[1].errors / a[1].count));

        // Find slowest database operations
        const slowestOps = Array.from(this.metrics.database.entries())
            .sort((a, b) => b[1].avgTime - a[1].avgTime)
            .slice(0, 5);

        return {
            uptime: Math.floor(uptime / 1000), // seconds
            memory: {
                current: {
                    rss: Math.round(currentMemory.rss / 1024 / 1024),
                    heapUsed: Math.round(currentMemory.heapUsed / 1024 / 1024),
                    heapTotal: Math.round(currentMemory.heapTotal / 1024 / 1024)
                },
                trend: Math.round(memoryTrend * 100) / 100 // MB change in last minute
            },
            commands: {
                total: Array.from(this.metrics.commands.values())
                    .reduce((sum, cmd) => sum + cmd.totalExecutions, 0),
                slowest: slowestCommands
            },
            database: {
                totalQueries: Array.from(this.metrics.database.values())
                    .reduce((sum, db) => sum + db.count, 0),
                activeConnections: this.metrics.activeConnections,
                slowest: slowestOps,
                errorProne: errorProneOps
            }
        };
    }

    // Get detailed performance report
    getDetailedReport() {
        const summary = this.getPerformanceSummary();

        return {
            ...summary,
            commands: Object.fromEntries(this.metrics.commands),
            database: Object.fromEntries(this.metrics.database),
            memoryHistory: this.metrics.memory.slice(-100) // Last 100 samples
        };
    }

    // Identify performance bottlenecks
    identifyBottlenecks() {
        const issues = [];
        const summary = this.getPerformanceSummary();

        // Check for high memory usage - more realistic threshold for Discord bots
        if (summary.memory.current.heapUsed > 200) { // 200MB is more realistic for monitoring
            issues.push({
                type: 'memory',
                severity: summary.memory.current.heapUsed > 400 ? 'high' : 'medium',
                message: `Memory usage: ${summary.memory.current.heapUsed}MB heap used`
            });
        }

        // Check for memory leaks (increasing trend) - more reasonable threshold
        if (summary.memory.trend > 20) { // 20MB increase per minute is concerning
            issues.push({
                type: 'memory_leak',
                severity: 'critical',
                message: `Potential memory leak: ${summary.memory.trend}MB increase in last minute`
            });
        }

        // Check for excessive RSS growth
        if (summary.memory.current.rss > 300) { // 300MB RSS is getting high for Discord bot
            issues.push({
                type: 'rss_memory',
                severity: summary.memory.current.rss > 500 ? 'high' : 'medium',
                message: `High process memory: ${summary.memory.current.rss}MB RSS`
            });
        }

        // Check for slow commands
        for (const [commandName, metrics] of this.metrics.commands) {
            if (metrics.avgResponseTime > 2000) { // 2 seconds
                issues.push({
                    type: 'slow_command',
                    severity: 'medium',
                    message: `Slow command "${commandName}": avg ${Math.round(metrics.avgResponseTime)}ms`
                });
            }
        }

        // Check for slow database operations
        for (const [operation, metrics] of this.metrics.database) {
            if (metrics.avgTime > 1000) { // 1 second
                issues.push({
                    type: 'slow_database',
                    severity: 'high',
                    message: `Slow database operation "${operation}": avg ${Math.round(metrics.avgTime)}ms`
                });
            }
        }

        // Check for high error rates
        for (const [operation, metrics] of this.metrics.database) {
            const errorRate = metrics.errors / metrics.count;
            if (errorRate > 0.05) { // 5% error rate
                issues.push({
                    type: 'high_error_rate',
                    severity: 'critical',
                    message: `High error rate for "${operation}": ${Math.round(errorRate * 100)}%`
                });
            }
        }

        // Check for too many active connections
        if (summary.database.activeConnections > 10) {
            issues.push({
                type: 'connection_pool',
                severity: 'medium',
                message: `High active connections: ${summary.database.activeConnections}`
            });
        }

        return issues;
    }

    // Clean up resources
    cleanup() {
        if (this.memoryInterval) {
            clearInterval(this.memoryInterval);
        }
    }
}

// Create singleton instance
const performanceMonitor = new PerformanceMonitor();

// Helper functions for easy usage
function measureCommand(commandName, fn) {
    return async (...args) => {
        const startTime = Date.now();
        let error = null;

        try {
            const result = await fn(...args);
            return result;
        } catch (err) {
            error = err;
            throw err;
        } finally {
            const endTime = Date.now();
            performanceMonitor.trackCommand(commandName, startTime, endTime, error);
        }
    };
}

function measureDatabase(operation, fn) {
    return async () => {
        const startTime = Date.now();
        let error = null;

        try {
            const result = await fn();
            return result;
        } catch (err) {
            error = err;
            throw err;
        } finally {
            const endTime = Date.now();
            performanceMonitor.trackDatabase(operation, startTime, endTime, error);
        }
    };
}

module.exports = {
    performanceMonitor,
    measureCommand,
    measureDatabase
};
