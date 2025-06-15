/**
 * Centralized Cache Invalidation Service
 * Provides consistent cache management across all services
 */

const queryCache = require('./queryCache');

class CacheInvalidationService {

    /**
     * Invalidate all user-related cache entries
     * @param {string} discordId - User's Discord ID
     */
    static invalidateUserCache(discordId) {
        const keysToInvalidate = [
            `user_stats:${discordId}`,
            `user_stats_optimized:${discordId}`,
            `user_tasks:${discordId}`,
            `user_tasks_optimized:${discordId}`,
            `task_stats:${discordId}`,
            `task_stats_optimized:${discordId}`,
            `daily_task_stats:${discordId}`,
            `user_daily_time:${discordId}`
        ];

        keysToInvalidate.forEach(key => {
            queryCache.delete(key);
        });

        // Use smart cache invalidation for user-related data
        queryCache.invalidateUserRelatedCache(discordId);

        console.log(`🧹 Cache invalidated for user ${discordId}`);
    }

    /**
     * Invalidate leaderboard cache
     * @param {string} type - 'monthly' or 'alltime'
     */
    static invalidateLeaderboardCache(type = 'both') {
        const keysToInvalidate = [];

        if (type === 'monthly' || type === 'both') {
            keysToInvalidate.push('leaderboard:monthly', 'house_leaderboard:monthly');
        }

        if (type === 'alltime' || type === 'both') {
            keysToInvalidate.push('leaderboard:alltime', 'house_leaderboard:alltime');
        }

        keysToInvalidate.forEach(key => {
            queryCache.delete(key);
        });

        console.log(`🧹 Leaderboard cache invalidated (${type})`);
    }

    /**
     * Invalidate house-related cache
     * @param {string} houseName - Name of the house (optional)
     */
    static invalidateHouseCache(houseName = null) {
        const keysToInvalidate = [
            'house_leaderboard:monthly',
            'house_leaderboard:alltime',
            'house_champions:monthly',
            'house_champions:alltime'
        ];

        if (houseName) {
            keysToInvalidate.push(`house_stats:${houseName}`);
        }

        keysToInvalidate.forEach(key => {
            queryCache.delete(key);
        });

        console.log(`🧹 House cache invalidated${houseName ? ` for ${houseName}` : ''}`);
    }

    /**
     * Invalidate daily statistics cache
     * @param {string} date - Date in YYYY-MM-DD format (optional, defaults to today)
     */
    static invalidateDailyStatsCache(date = null) {
        const dayjs = require('dayjs');
        const targetDate = date || dayjs().format('YYYY-MM-DD');

        const keysToInvalidate = [
            `daily_stats:${targetDate}`,
            `daily_activity:${targetDate}`,
            'daily_voice_activity'
        ];

        keysToInvalidate.forEach(key => {
            queryCache.delete(key);
        });

        console.log(`🧹 Daily stats cache invalidated for ${targetDate}`);
    }

    /**
     * Invalidate cache after task operations
     * @param {string} discordId - User's Discord ID
     */
    static invalidateAfterTaskOperation(discordId) {
        this.invalidateUserCache(discordId);
        this.invalidateDailyStatsCache();

        // Also invalidate task-specific patterns
        queryCache.invalidatePattern(`task_*:${discordId}`);
        queryCache.invalidatePattern(`daily_task_*:${discordId}`);
    }

    /**
     * Invalidate cache after voice session operations
     * @param {string} discordId - User's Discord ID
     * @param {string} houseName - User's house name (optional)
     */
    static invalidateAfterVoiceOperation(discordId, houseName = null) {
        this.invalidateUserCache(discordId);
        this.invalidateLeaderboardCache();
        this.invalidateDailyStatsCache();

        if (houseName) {
            this.invalidateHouseCache(houseName);
        }
    }

    /**
     * Invalidate cache after monthly reset
     * @param {string} discordId - User's Discord ID (optional, for single user reset)
     */
    static invalidateAfterMonthlyReset(discordId = null) {
        if (discordId) {
            this.invalidateUserCache(discordId);
        } else {
            // Full cache clear for mass monthly reset
            queryCache.clear();
            console.log('🧹 Full cache cleared after monthly reset');
            return;
        }

        this.invalidateLeaderboardCache();
        this.invalidateHouseCache();
    }

    /**
     * Clear all cache (nuclear option)
     */
    static clearAllCache() {
        queryCache.clear();
        console.log('🧹 All cache cleared');
    }
}

module.exports = CacheInvalidationService;
