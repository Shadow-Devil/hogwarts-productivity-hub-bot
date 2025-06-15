// Materialized View Manager Service
// Handles periodic refresh of materialized views for optimal performance

const { pool, executeWithResilience } = require('../models/db');
const { measureDatabase } = require('../utils/performanceMonitor');
const queryCache = require('../utils/queryCache');

class MaterializedViewManager {
    constructor() {
        this.refreshInterval = null;
        this.isRefreshing = false;
        this.lastRefreshTime = null;
        this.refreshStats = {
            totalRefreshes: 0,
            successfulRefreshes: 0,
            failedRefreshes: 0,
            lastError: null
        };
    }

    // Start automatic refresh of materialized views
    startAutoRefresh(intervalMinutes = 5) {
        if (this.refreshInterval) {
            console.log('🔄 Materialized view auto-refresh already running');
            return;
        }

        const intervalMs = intervalMinutes * 60 * 1000;

        console.log(`🔄 Starting materialized view auto-refresh every ${intervalMinutes} minutes`);

        // Initial refresh
        this.refreshViews().catch(error => {
            console.error('❌ Initial materialized view refresh failed:', error);
        });

        // Set up periodic refresh
        this.refreshInterval = setInterval(async() => {
            try {
                await this.refreshViews();
            } catch (error) {
                console.error('❌ Scheduled materialized view refresh failed:', error);
            }
        }, intervalMs);
    }

    // Stop automatic refresh
    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
            console.log('🛑 Materialized view auto-refresh stopped');
        }
    }

    // Manually refresh materialized views
    async refreshViews() {
        if (this.isRefreshing) {
            console.log('⏳ Materialized view refresh already in progress, skipping...');
            return false;
        }

        this.isRefreshing = true;
        this.refreshStats.totalRefreshes++;

        try {
            return await measureDatabase('refreshMaterializedViews', async() => {
                return executeWithResilience(async(client) => {
                    console.log('🔄 Refreshing materialized views...');

                    // Call the database function to refresh materialized views
                    await client.query('SELECT refresh_materialized_views()');

                    this.lastRefreshTime = new Date();
                    this.refreshStats.successfulRefreshes++;

                    console.log('✅ Materialized views refreshed successfully');

                    // Clear related caches after refresh
                    this.invalidateRelatedCaches();

                    return true;
                });
            });
        } catch (error) {
            this.refreshStats.failedRefreshes++;
            this.refreshStats.lastError = error.message;
            console.error('❌ Failed to refresh materialized views:', error);
            throw error;
        } finally {
            this.isRefreshing = false;
        }
    }

    // Invalidate caches that depend on materialized views
    invalidateRelatedCaches() {
        try {
            // Clear user stats caches
            queryCache.invalidatePattern('user_stats_optimized:*');
            queryCache.invalidatePattern('user_stats:*');

            // Clear leaderboard caches
            queryCache.invalidatePattern('leaderboard_optimized:*');
            queryCache.invalidatePattern('leaderboard:*');

            // Clear house leaderboard caches
            queryCache.invalidatePattern('house_leaderboard_optimized:*');
            queryCache.invalidatePattern('house_leaderboard:*');

            // Clear task stats caches
            queryCache.invalidatePattern('task_stats_optimized:*');
            queryCache.invalidatePattern('task_stats:*');

            console.log('🧹 Related caches invalidated after materialized view refresh');
        } catch (error) {
            console.warn('⚠️ Warning: Failed to invalidate some caches after refresh:', error.message);
        }
    }

    // Get refresh statistics
    getRefreshStats() {
        return {
            ...this.refreshStats,
            lastRefreshTime: this.lastRefreshTime,
            isCurrentlyRefreshing: this.isRefreshing,
            autoRefreshActive: !!this.refreshInterval
        };
    }

    // Check if views need refreshing (based on time since last refresh)
    needsRefresh(maxAgeMinutes = 10) {
        if (!this.lastRefreshTime) {
            return true; // Never refreshed
        }

        const ageMinutes = (Date.now() - this.lastRefreshTime.getTime()) / (1000 * 60);
        return ageMinutes > maxAgeMinutes;
    }

    // Force refresh if views are stale
    async refreshIfStale(maxAgeMinutes = 10) {
        if (this.needsRefresh(maxAgeMinutes)) {
            console.log(`🔄 Materialized views are stale (>${maxAgeMinutes} minutes), refreshing...`);
            return await this.refreshViews();
        }
        return false;
    }

    // Get view freshness information
    async getViewFreshness() {
        try {
            return await measureDatabase('getViewFreshness', async() => {
                return executeWithResilience(async(client) => {
                    // Check when materialized views were last updated
                    const result = await client.query(`
                        SELECT
                            schemaname,
                            matviewname,
                            hasindexes,
                            ispopulated,
                            definition
                        FROM pg_matviews
                        WHERE matviewname = 'user_stats_summary'
                    `);

                    if (result.rows.length === 0) {
                        return { error: 'Materialized view not found' };
                    }

                    const viewInfo = result.rows[0];

                    return {
                        viewName: viewInfo.matviewname,
                        isPopulated: viewInfo.ispopulated,
                        hasIndexes: viewInfo.hasindexes,
                        lastManagerRefresh: this.lastRefreshTime,
                        managerStats: this.getRefreshStats()
                    };
                });
            });
        } catch (error) {
            console.error('❌ Error getting view freshness:', error);
            return { error: error.message };
        }
    }

    // Health check for materialized view system
    async healthCheck() {
        try {
            const freshness = await this.getViewFreshness();
            const stats = this.getRefreshStats();

            const health = {
                status: 'healthy',
                issues: [],
                recommendations: []
            };

            // Check if views are populated
            if (freshness.isPopulated === false) {
                health.status = 'warning';
                health.issues.push('Materialized views are not populated');
                health.recommendations.push('Run manual refresh to populate views');
            }

            // Check refresh failure rate
            const failureRate = stats.totalRefreshes > 0 ?
                (stats.failedRefreshes / stats.totalRefreshes) * 100 : 0;

            if (failureRate > 20) {
                health.status = 'warning';
                health.issues.push(`High refresh failure rate: ${failureRate.toFixed(1)}%`);
                health.recommendations.push('Check database connectivity and view definitions');
            }

            // Check if auto-refresh is active
            if (!stats.autoRefreshActive) {
                health.issues.push('Auto-refresh is not active');
                health.recommendations.push('Start auto-refresh for optimal performance');
            }

            return {
                ...health,
                freshness,
                stats
            };
        } catch (error) {
            return {
                status: 'error',
                error: error.message,
                issues: ['Health check failed'],
                recommendations: ['Check database connectivity']
            };
        }
    }
}

module.exports = { MaterializedViewManager };
