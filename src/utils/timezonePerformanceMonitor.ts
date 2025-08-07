/**
 * Timezone Performance Monitor
 * Tracks performance metrics for timezone operations in production
 * Part of Phase 7: Production Hardening
 */
import winston from 'winston';

class TimezonePerformanceMonitor {
    public metrics: any;
    public logger: winston.Logger;
    public reportInterval: NodeJS.Timeout;

    constructor() {
        this.metrics = {
            timezoneConversions: {
                count: 0,
                totalDuration: 0,
                failures: 0
            },
            cacheOperations: {
                hits: 0,
                misses: 0,
                invalidations: 0
            },
            databaseQueries: {
                count: 0,
                totalDuration: 0,
                failures: 0
            },
            resetOperations: {
                daily: { count: 0, totalDuration: 0, failures: 0 },
                monthly: { count: 0, totalDuration: 0, failures: 0 }
            }
        };

        // Winston logger for performance metrics
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
            transports: [
                new winston.transports.File({
                    filename: 'logs/timezone-performance.log',
                    level: 'info'
                }),
                new winston.transports.Console({
                    level: 'warn',
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.printf(({ timestamp, level, message, ...meta }) => {
                            return `${timestamp} [TimezonePerf] ${level}: ${message} ${JSON.stringify(meta)}`;
                        })
                    )
                })
            ]
        });

        // Report metrics every 5 minutes
        this.reportInterval = setInterval(() => {
            this.reportMetrics();
        }, 5 * 60 * 1000); // 5 minutes
    }

    /**
     * Record timezone conversion performance
     * @param {number} duration - Operation duration in ms
     * @param {boolean} success - Whether operation succeeded
     * @param {Object} metadata - Additional context
     */
    recordTimezoneConversion(duration, success = true, metadata = {}) {
        this.metrics.timezoneConversions.count++;
        this.metrics.timezoneConversions.totalDuration += duration;

        if (!success) {
            this.metrics.timezoneConversions.failures++;
        }

        // Log slow operations (> 100ms)
        if (duration > 100) {
            this.logger.warn('Slow timezone conversion detected', {
                duration,
                success,
                ...metadata
            });
        }
    }

    /**
     * Record cache operation
     * @param {string} operation - 'hit', 'miss', or 'invalidation'
     * @param {Object} metadata - Additional context
     */
    recordCacheOperation(operation, metadata = {}) {
        switch (operation) {
        case 'hit':
            this.metrics.cacheOperations.hits++;
            break;
        case 'miss':
            this.metrics.cacheOperations.misses++;
            break;
        case 'invalidation':
            this.metrics.cacheOperations.invalidations++;
            break;
        }

        // Calculate cache hit rate
        const total = this.metrics.cacheOperations.hits + this.metrics.cacheOperations.misses;
        const hitRate = total > 0 ? (this.metrics.cacheOperations.hits / total) * 100 : 0;

        // Alert on low cache hit rate (< 80%)
        if (total > 100 && hitRate < 80) {
            this.logger.warn('Low timezone cache hit rate detected', {
                hitRate: hitRate.toFixed(2),
                totalOperations: total,
                ...metadata
            });
        }
    }

    /**
     * Record database query performance
     * @param {number} duration - Query duration in ms
     * @param {boolean} success - Whether query succeeded
     * @param {Object} metadata - Additional context
     */
    recordDatabaseQuery(duration, success = true, metadata = {}) {
        this.metrics.databaseQueries.count++;
        this.metrics.databaseQueries.totalDuration += duration;

        if (!success) {
            this.metrics.databaseQueries.failures++;
        }

        // Log slow queries (> 500ms)
        if (duration > 500) {
            this.logger.warn('Slow timezone database query detected', {
                duration,
                success,
                ...metadata
            });
        }
    }

    /**
     * Record reset operation performance
     * @param {string} resetType - 'daily' or 'monthly'
     * @param {number} duration - Operation duration in ms
     * @param {boolean} success - Whether operation succeeded
     * @param {Object} metadata - Additional context
     */
    recordResetOperation(resetType, duration, success = true, metadata = {}) {
        if (this.metrics.resetOperations[resetType]) {
            this.metrics.resetOperations[resetType].count++;
            this.metrics.resetOperations[resetType].totalDuration += duration;

            if (!success) {
                this.metrics.resetOperations[resetType].failures++;
            }
        }

        // Log slow reset operations (> 5 seconds)
        if (duration > 5000) {
            this.logger.warn('Slow reset operation detected', {
                resetType,
                duration,
                success,
                ...metadata
            });
        }
    }

    /**
     * Get current performance metrics
     * @returns {Object} Current metrics snapshot
     */
    getMetrics() {
        const now = Date.now();

        // Calculate averages
        const avgTimezoneConversion = this.metrics.timezoneConversions.count > 0
            ? this.metrics.timezoneConversions.totalDuration / this.metrics.timezoneConversions.count
            : 0;

        const avgDatabaseQuery = this.metrics.databaseQueries.count > 0
            ? this.metrics.databaseQueries.totalDuration / this.metrics.databaseQueries.count
            : 0;

        const cacheTotal = this.metrics.cacheOperations.hits + this.metrics.cacheOperations.misses;
        const cacheHitRate = cacheTotal > 0
            ? (this.metrics.cacheOperations.hits / cacheTotal) * 100
            : 0;

        return {
            timestamp: now,
            timezoneConversions: {
                ...this.metrics.timezoneConversions,
                averageDuration: avgTimezoneConversion,
                failureRate: this.metrics.timezoneConversions.count > 0
                    ? (this.metrics.timezoneConversions.failures / this.metrics.timezoneConversions.count) * 100
                    : 0
            },
            cacheOperations: {
                ...this.metrics.cacheOperations,
                hitRate: cacheHitRate
            },
            databaseQueries: {
                ...this.metrics.databaseQueries,
                averageDuration: avgDatabaseQuery,
                failureRate: this.metrics.databaseQueries.count > 0
                    ? (this.metrics.databaseQueries.failures / this.metrics.databaseQueries.count) * 100
                    : 0
            },
            resetOperations: this.metrics.resetOperations
        };
    }

    /**
     * Report performance metrics to logs
     */
    reportMetrics() {
        const metrics = this.getMetrics();

        this.logger.info('Timezone performance metrics report', metrics);

        // Alert on concerning metrics
        if (metrics.timezoneConversions.failureRate > 5) {
            this.logger.error('High timezone conversion failure rate', {
                failureRate: metrics.timezoneConversions.failureRate
            });
        }

        if (metrics.databaseQueries.failureRate > 1) {
            this.logger.error('High database query failure rate', {
                failureRate: metrics.databaseQueries.failureRate
            });
        }

        if (metrics.cacheOperations.hitRate < 80 && metrics.cacheOperations.hits + metrics.cacheOperations.misses > 100) {
            this.logger.warn('Low cache hit rate detected', {
                hitRate: metrics.cacheOperations.hitRate
            });
        }
    }

    /**
     * Reset metrics (useful for testing or periodic resets)
     */
    resetMetrics() {
        this.metrics = {
            timezoneConversions: { count: 0, totalDuration: 0, failures: 0 },
            cacheOperations: { hits: 0, misses: 0, invalidations: 0 },
            databaseQueries: { count: 0, totalDuration: 0, failures: 0 },
            resetOperations: {
                daily: { count: 0, totalDuration: 0, failures: 0 },
                monthly: { count: 0, totalDuration: 0, failures: 0 }
            }
        };

        this.logger.info('Performance metrics reset');
    }

    /**
     * Cleanup and stop monitoring
     */
    destroy() {
        if (this.reportInterval) {
            clearInterval(this.reportInterval);
            this.reportInterval = null;
        }

        // Final metrics report
        this.reportMetrics();
        this.logger.info('Timezone performance monitor destroyed');
    }
}

// Create singleton instance
const timezonePerformanceMonitor = new TimezonePerformanceMonitor();

export default timezonePerformanceMonitor;
