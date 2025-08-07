/**
 * Simple query result caching utility to improve bot performance
 * Reduces database load for frequently accessed data
 */

class QueryCache {
  public cache: Map<string, any>;
  public stats: {
    hits: number;
    misses: number;
    total: number;
  };
  public ttlSettings: {
    userStats: number;
    leaderboard: number;
    houseLeaderboard: number;
    houseChampions: number;
    userTasks: number;
    taskStats: number;
    default: number;
  };

  constructor() {
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      total: 0,
    };

    // Default TTL values for different types of data (in milliseconds)
    this.ttlSettings = {
      userStats: 1 * 60 * 1000, // 1 minute - user statistics
      leaderboard: 3 * 60 * 1000, // 3 minutes - general leaderboards
      houseLeaderboard: 3 * 60 * 1000, // 3 minutes - house leaderboards
      houseChampions: 3 * 60 * 1000, // 3 minutes - house champions
      userTasks: 30 * 1000, // 30 seconds - user task lists
      taskStats: 2 * 60 * 1000, // 2 minutes - task statistics
      default: 1 * 60 * 1000, // 1 minute - default TTL
    };

    // Clean cache every 3 minutes (optimal for TTL ranges of 30s-3min)
    // More efficient than every minute since most data lives 1-3 minutes
    setInterval(() => this.cleanup(), 180000);
  }

  /**
   * Generate cache key from query and parameters
   */
  generateKey(query, params = []) {
    const paramString = params.length > 0 ? JSON.stringify(params) : "";
    return `${query.replace(/\s+/g, " ").trim()}:${paramString}`;
  }

  /**
   * Get cached result by key (simple key-value access)
   */
  get(key) {
    this.stats.total++;

    const cached = this.cache.get(key);

    if (!cached) {
      this.stats.misses++;
      return null;
    }

    const ttl = this.ttlSettings[cached.type] || 60000; // Default 1 minute
    const isExpired = Date.now() - cached.timestamp > ttl;

    if (isExpired) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return cached.data;
  }

  /**
   * Store data in cache by key (simple key-value access)
   */
  set(key, data, cacheType = "default") {
    this.cache.set(key, {
      data: data,
      timestamp: Date.now(),
      type: cacheType,
    });
  }

  /**
   * Delete specific cache entry by key
   */
  delete(key) {
    return this.cache.delete(key);
  }

  /**
   * Delete cache entries matching pattern
   */
  deletePattern(pattern) {
    const regex = new RegExp(pattern.replace("*", ".*"));
    let deletedCount = 0;

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  /**
   * Alias for deletePattern - for backward compatibility
   * Many services use invalidatePattern instead of deletePattern
   */
  invalidatePattern(pattern) {
    return this.deletePattern(pattern);
  }

  /**
   * Get cached result by query and parameters (for SQL queries)
   */
  getByQuery(cacheType, query, params = []) {
    this.stats.total++;

    const key = this.generateKey(query, params);
    const cached = this.cache.get(key);

    if (!cached) {
      this.stats.misses++;
      return null;
    }

    const ttl = this.ttlSettings[cacheType] || 60000; // Default 1 minute
    const isExpired = Date.now() - cached.timestamp > ttl;

    if (isExpired) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return cached.data;
  }

  /**
   * Store query result in cache by query and parameters
   */
  setByQuery(cacheType, query, params = [], data) {
    const key = this.generateKey(query, params);
    this.cache.set(key, {
      data: data,
      timestamp: Date.now(),
      type: cacheType,
    });
  }

  /**
   * Remove expired entries from cache
   */
  cleanup() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, value] of this.cache.entries()) {
      const ttl = this.ttlSettings[value.type] || 60000;
      if (now - value.timestamp > ttl) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned ${cleanedCount} expired cache entries`);
    }
  }

  /**
   * Clear all cached data
   */
  clear() {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, total: 0 };
  }

  /**
   * Clear cache for specific type
   */
  clearType(cacheType) {
    for (const [key, value] of this.cache.entries()) {
      if (value.type === cacheType) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const hitRate =
      this.stats.total > 0
        ? ((this.stats.hits / this.stats.total) * 100).toFixed(1)
        : 0;

    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      total: this.stats.total,
      hitRate: `${hitRate}%`,
      memoryUsage: this.getMemoryUsage(),
    };
  }

  /**
   * Estimate memory usage of cache
   */
  getMemoryUsage() {
    let estimatedSize = 0;
    for (const [key, value] of this.cache.entries()) {
      // Rough estimation of memory usage
      estimatedSize += key.length * 2; // UTF-16 encoding
      estimatedSize += JSON.stringify(value.data).length * 2;
      estimatedSize += 64; // Overhead for timestamp, type, etc.
    }
    return `${(estimatedSize / 1024).toFixed(1)}KB`;
  }

  /**
   * Enhanced cache patterns for Discord bot operations
   */
  getCachePatterns() {
    return {
      userStats: {
        generateKey: (discordId) => `user_stats:${discordId}`,
        ttl: this.ttlSettings.userStats,
        type: "userStats",
      },
      activeVoiceSessions: {
        generateKey: (discordId) => `active_sessions:${discordId}`,
        ttl: 30 * 1000, // 30 seconds for active sessions
        type: "default",
      },
      leaderboardMonthly: {
        generateKey: () => "leaderboard:monthly",
        ttl: this.ttlSettings.leaderboard,
        type: "leaderboard",
      },
      leaderboardAllTime: {
        generateKey: () => "leaderboard:alltime",
        ttl: this.ttlSettings.leaderboard * 2, // Longer for all-time
        type: "leaderboard",
      },
      houseLeaderboard: {
        generateKey: (type) => `house_leaderboard:${type}`,
        ttl: this.ttlSettings.houseLeaderboard,
        type: "houseLeaderboard",
      },
      userTasks: {
        generateKey: (discordId, completed = null) =>
          `user_tasks:${discordId}:${completed !== null ? completed : "all"}`,
        ttl: this.ttlSettings.userTasks,
        type: "userTasks",
      },
    };
  }

  /**
   * Optimized cache methods for specific bot operations
   */
  async cacheUserStats(discordId, statsData) {
    const pattern = this.getCachePatterns().userStats;
    const key = pattern.generateKey(discordId);
    this.set(key, statsData, pattern.type);
    return statsData;
  }

  async getUserStatsFromCache(discordId) {
    const pattern = this.getCachePatterns().userStats;
    const key = pattern.generateKey(discordId);
    return this.get(key);
  }

  async cacheLeaderboard(type, data) {
    const patterns = this.getCachePatterns();
    const pattern =
      type === "monthly"
        ? patterns.leaderboardMonthly
        : patterns.leaderboardAllTime;
    const key = pattern.generateKey();
    this.set(key, data, pattern.type);
    return data;
  }

  async getLeaderboardFromCache(type) {
    const patterns = this.getCachePatterns();
    const pattern =
      type === "monthly"
        ? patterns.leaderboardMonthly
        : patterns.leaderboardAllTime;
    const key = pattern.generateKey();
    return this.get(key);
  }

  /**
   * Intelligent cache invalidation for related data
   */
  invalidateUserRelatedCache(discordId) {
    const patterns = [
      `user_stats:${discordId}`, // Exact match for user stats
      `active_sessions:${discordId}`, // Exact match for active sessions
      `user_tasks:${discordId}`, // Exact match for user tasks (removed unnecessary *)
      `task_stats:${discordId}`, // Added missing task stats cache key
      "leaderboard:*", // All leaderboards (consider making more specific)
      "house_leaderboard:*", // All house leaderboards
      "house_champions:*", // Added missing house champions cache keys
    ];

    let invalidatedCount = 0;
    patterns.forEach((pattern) => {
      invalidatedCount += this.deletePattern(pattern);
    });

    console.log(
      `🧹 Invalidated ${invalidatedCount} cache entries for user ${discordId}`,
    );
    return invalidatedCount;
  }

  /**
   * Batch cache operations for better performance
   */
  async batchSet(entries) {
    const timestamp = Date.now();
    entries.forEach(({ key, data, cacheType = "default" }) => {
      this.cache.set(key, {
        data: data,
        timestamp: timestamp,
        type: cacheType,
      });
    });
  }

  async batchGet(keys) {
    const results = {};
    keys.forEach((key) => {
      const cached = this.get(key);
      if (cached !== null) {
        results[key] = cached;
      }
    });
    return results;
  }
}

export default new QueryCache();
