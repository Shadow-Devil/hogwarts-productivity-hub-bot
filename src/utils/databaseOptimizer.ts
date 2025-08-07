/**
 * Production-ready database optimization utilities
 * Focused on query performance, connection management, and monitoring
 */

import { performanceMonitor } from "./performanceMonitor.ts";
import queryCache from "./queryCache.ts";

class DatabaseOptimizer {
  private pool: any | null;
  private queryTracker: Map<
    string,
    { count: number; totalTime: number; errors: number; cacheHits: number }
  >;
  private slowQueryThreshold: number; // in milliseconds
  private connectionMonitor: {
    peakConnections: number;
    totalQueries: number;
    slowQueries: number;
    queryTimeouts: number;
  };
  private monitoringIntervals: NodeJS.Timeout[]; // Store interval IDs for cleanup

  constructor() {
    this.pool = null; // Will be set via setPool method
    this.queryTracker = new Map();
    this.slowQueryThreshold = 1000; // 1 second
    this.connectionMonitor = {
      peakConnections: 0,
      totalQueries: 0,
      slowQueries: 0,
      queryTimeouts: 0,
    };
    this.monitoringIntervals = []; // Store interval IDs for cleanup

    // Start monitoring
    this.startMonitoring();
  }

  /**
   * Set the database pool (to avoid circular dependencies)
   */
  setPool(pool) {
    this.pool = pool;
  }

  /**
   * Enhanced query execution with performance tracking
   */
  async executeTrackedQuery(
    operation,
    query,
    params = [],
    useCache = false,
    cacheType = "default",
  ) {
    const startTime = Date.now();

    try {
      // Try cache first if enabled
      if (useCache) {
        const cached = queryCache.getByQuery(cacheType, query, params);
        if (cached !== null) {
          this.trackQueryPerformance(operation, startTime, Date.now(), true);
          return cached;
        }
      }

      // Execute query with connection pool
      if (!this.pool) {
        throw new Error("Database pool not initialized. Call setPool() first.");
      }
      const client = await this.pool.connect();
      let result;

      try {
        // Set statement timeout for long-running queries
        await client.query("SET statement_timeout = 30000"); // 30 seconds
        result = await client.query(query, params);

        // Cache result if caching is enabled
        if (useCache && result) {
          queryCache.setByQuery(cacheType, query, params, result);
        }
      } finally {
        client.release();
      }

      this.trackQueryPerformance(operation, startTime, Date.now(), false);
      return result;
    } catch (error) {
      const endTime = Date.now();
      this.trackQueryPerformance(operation, startTime, endTime, false, error);

      // Log slow or failed queries
      if (endTime - startTime > this.slowQueryThreshold) {
        console.warn(
          `🐌 Slow query detected: ${operation} (${endTime - startTime}ms)`,
        );
      }

      throw error;
    }
  }

  /**
   * Optimized batch operations for bulk inserts/updates
   */
  async executeBatchOperation(operation, queries, batchSize = 50) {
    const startTime = Date.now();
    if (!this.pool) {
      throw new Error("Database pool not initialized. Call setPool() first.");
    }
    const client = await this.pool.connect();
    const results = [];

    try {
      await client.query("BEGIN");

      // Process in batches to avoid memory issues
      for (let i = 0; i < queries.length; i += batchSize) {
        const batch = queries.slice(i, i + batchSize);

        for (const { query, params } of batch) {
          const result = await client.query(query, params);
          results.push(result);
        }

        // Periodic commit for large batches
        if (i + batchSize < queries.length && batch.length === batchSize) {
          await client.query("COMMIT");
          await client.query("BEGIN");
        }
      }

      await client.query("COMMIT");
      this.trackQueryPerformance(operation, startTime, Date.now(), false);

      return results;
    } catch (error) {
      await client.query("ROLLBACK");
      this.trackQueryPerformance(
        operation,
        startTime,
        Date.now(),
        false,
        error,
      );
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Connection pool optimization
   */
  async optimizeConnectionPool() {
    const stats = this.getConnectionPoolStats();
    const recommendations = [];

    // Check for connection pool bottlenecks
    if (stats.waitingClients > 0) {
      recommendations.push({
        type: "connection_pool",
        priority: "high",
        message: `${stats.waitingClients} clients waiting for connections. Consider increasing max connections.`,
        action: "increase_max_connections",
      });
    }

    // Check for idle connections
    if (stats.idleConnections > stats.maxConnections * 0.7) {
      recommendations.push({
        type: "connection_pool",
        priority: "medium",
        message:
          "High number of idle connections. Consider reducing min connections.",
        action: "reduce_min_connections",
      });
    }

    // Check connection utilization
    const utilization = (stats.totalConnections / stats.maxConnections) * 100;
    if (utilization > 80) {
      recommendations.push({
        type: "connection_pool",
        priority: "high",
        message: `Connection pool utilization at ${utilization.toFixed(1)}%. Monitor for bottlenecks.`,
        action: "monitor_connections",
      });
    }

    return {
      stats,
      recommendations,
      optimizationSuggestions: this.generateOptimizationSuggestions(stats),
    };
  }

  /**
   * Query performance analysis
   */
  analyzeQueryPerformance() {
    const analysis = {
      totalQueries: this.connectionMonitor.totalQueries,
      slowQueries: this.connectionMonitor.slowQueries,
      slowQueryRate: (
        (this.connectionMonitor.slowQueries /
          this.connectionMonitor.totalQueries) *
        100
      ).toFixed(2),
      topSlowOperations: [],
      cacheEfficiency: queryCache.getStats(),
      recommendations: [],
    };

    // Find slowest operations
    const sortedOperations = Array.from(this.queryTracker.entries())
      .map(([operation, stats]) => ({
        operation,
        avgTime: stats.totalTime / stats.count,
        totalTime: stats.totalTime,
        count: stats.count,
        errors: stats.errors,
      }))
      .sort((a, b) => b.avgTime - a.avgTime)
      .slice(0, 10);

    analysis.topSlowOperations = sortedOperations;

    // Generate recommendations
    if (parseFloat(analysis.slowQueryRate) > 5) {
      analysis.recommendations.push({
        type: "query_optimization",
        priority: "high",
        message: `${analysis.slowQueryRate}% of queries are slow. Consider query optimization.`,
      });
    }

    if (parseFloat(analysis.cacheEfficiency.hitRate) < 60) {
      analysis.recommendations.push({
        type: "cache_optimization",
        priority: "medium",
        message: `Cache hit rate is ${analysis.cacheEfficiency.hitRate}. Consider adjusting cache TTL.`,
      });
    }

    return analysis;
  }

  /**
   * Apply targeted database optimizations
   */
  async applyOptimizations({
    enablePlanCache = false,
    optimizeWorkMem = false,
    enableParallel = false,
    createIndexes = false,
    analyzeStats = false,
  } = {}) {
    if (!this.pool) {
      throw new Error("Database pool not initialized. Call setPool() first.");
    }
    const client = await this.pool.connect();
    const results = [];

    try {
      console.log("🔧 Applying database optimizations...");

      // Enable query plan caching for repeated queries
      if (enablePlanCache !== false) {
        await client.query("SET plan_cache_mode = 'force_generic_plan'");
        results.push("✅ Enabled query plan caching");
      }

      // Optimize work memory for complex queries
      if (optimizeWorkMem !== false) {
        await client.query("SET work_mem = '16MB'");
        results.push("✅ Optimized work memory for complex queries");
      }

      // Enable parallel queries for aggregations
      if (enableParallel !== false) {
        await client.query("SET max_parallel_workers_per_gather = 2");
        results.push("✅ Enabled parallel query execution");
      }

      // Create missing indexes based on query patterns
      if (createIndexes !== false) {
        const indexResults = await this.createOptimalIndexes(client);
        results.push(...indexResults);
      }

      // Analyze tables for updated statistics
      if (analyzeStats !== false) {
        await client.query(
          "ANALYZE users, vc_sessions, daily_voice_stats, tasks, houses",
        );
        results.push("✅ Updated table statistics for query optimization");
      }

      console.log("🎯 Database optimizations completed");
      return results;
    } catch (error) {
      console.error("❌ Error applying optimizations:", error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create performance-optimized indexes
   */
  async createOptimalIndexes(client) {
    const results = [];
    const indexes = [
      // Covering index for user lookups with stats
      {
        name: "idx_users_discord_id_stats",
        query: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_discord_id_stats
                       ON users(discord_id) INCLUDE (monthly_points, monthly_hours, current_streak)`,
        description: "Covering index for user stats lookups",
      },

      // Composite index for active voice sessions
      {
        name: "idx_vc_sessions_active_user",
        query: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vc_sessions_active_user
                       ON vc_sessions(discord_id, joined_at) WHERE left_at IS NULL`,
        description: "Partial index for active voice sessions",
      },

      // BRIN index for time-series data
      {
        name: "idx_vc_sessions_date_brin",
        query: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vc_sessions_date_brin
                       ON vc_sessions USING BRIN(date)`,
        description: "BRIN index for efficient date range queries",
      },

      // Composite index for daily stats queries
      {
        name: "idx_daily_stats_user_date_points",
        query: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_stats_user_date_points
                       ON daily_voice_stats(discord_id, date DESC) INCLUDE (points_earned)`,
        description: "Optimized index for daily statistics queries",
      },

      // Task completion performance index
      {
        name: "idx_tasks_user_completion",
        query: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_user_completion
                       ON tasks(discord_id, is_complete, created_at DESC)`,
        description: "Index for task completion queries",
      },
    ];

    for (const index of indexes) {
      try {
        await client.query(index.query);
        results.push(`✅ Created index: ${index.description}`);
      } catch (error) {
        if (error.code === "42P07") {
          // Index already exists
          results.push(`ℹ️  Index already exists: ${index.name}`);
        } else {
          results.push(
            `❌ Failed to create index ${index.name}: ${error.message}`,
          );
        }
      }
    }

    return results;
  }

  /**
   * Monitor query performance and track metrics
   */
  trackQueryPerformance(
    operation,
    startTime,
    endTime,
    fromCache = false,
    error = null,
  ) {
    const executionTime = endTime - startTime;

    // Update connection monitor
    this.connectionMonitor.totalQueries++;
    if (executionTime > this.slowQueryThreshold) {
      this.connectionMonitor.slowQueries++;
    }
    if (error && error.code === "57014") {
      // Query timeout
      this.connectionMonitor.queryTimeouts++;
    }

    // Track per-operation stats
    if (!this.queryTracker.has(operation)) {
      this.queryTracker.set(operation, {
        count: 0,
        totalTime: 0,
        errors: 0,
        cacheHits: 0,
      });
    }

    const stats = this.queryTracker.get(operation);
    stats.count++;
    stats.totalTime += executionTime;
    if (error) stats.errors++;
    if (fromCache) stats.cacheHits++;

    // Report to performance monitor
    performanceMonitor.trackDatabase(operation, startTime, endTime, error);
  }

  /**
   * Get connection pool statistics
   */
  getConnectionPoolStats() {
    try {
      if (!this.pool) {
        throw new Error("Database pool not initialized");
      }
      return {
        totalConnections: this.pool.totalCount || 0,
        idleConnections: this.pool.idleCount || 0,
        waitingClients: this.pool.waitingCount || 0,
        maxConnections: this.pool.options.max || 50,
        minConnections: this.pool.options.min || 5,
        peakConnections: this.connectionMonitor.peakConnections,
      };
    } catch (error) {
      console.warn("Could not get pool stats:", error.message);
      return {
        totalConnections: 0,
        idleConnections: 0,
        waitingClients: 0,
        maxConnections: 50,
        minConnections: 5,
        peakConnections: 0,
      };
    }
  }

  /**
   * Generate optimization suggestions based on metrics
   */
  generateOptimizationSuggestions(stats) {
    const suggestions = [];

    if (stats.waitingClients > 0) {
      suggestions.push({
        type: "immediate",
        action: "Increase max_connections in pool config",
        impact: "Reduce client wait times",
        priority: "high",
      });
    }

    if (
      this.connectionMonitor.slowQueries >
      this.connectionMonitor.totalQueries * 0.1
    ) {
      suggestions.push({
        type: "short_term",
        action: "Optimize slow queries and add missing indexes",
        impact: "Improve overall response times",
        priority: "high",
      });
    }

    const hitRate = parseFloat(queryCache.getStats().hitRate);
    if (hitRate < 70) {
      suggestions.push({
        type: "medium_term",
        action: "Tune cache TTL settings and increase cache coverage",
        impact: "Reduce database load",
        priority: "medium",
      });
    }

    return suggestions;
  }

  /**
   * Start continuous monitoring
   */
  startMonitoring() {
    // Monitor connection pool peaks
    const poolMonitorInterval = setInterval(() => {
      if (this.pool && this.pool.totalCount !== undefined) {
        const current = this.pool.totalCount;
        if (current > this.connectionMonitor.peakConnections) {
          this.connectionMonitor.peakConnections = current;
        }
      }
    }, 1000);

    // Log performance summary every 5 minutes
    const summaryInterval = setInterval(
      () => {
        this.logPerformanceSummary();
      },
      5 * 60 * 1000,
    );

    // Store interval IDs for cleanup
    this.monitoringIntervals.push(poolMonitorInterval, summaryInterval);
  }

  /**
   * Stop monitoring and cleanup intervals
   */
  stopMonitoring() {
    this.monitoringIntervals.forEach((interval) => clearInterval(interval));
    this.monitoringIntervals = [];
  }

  /**
   * Log performance summary
   */
  logPerformanceSummary() {
    const analysis = this.analyzeQueryPerformance();
    const poolStats = this.getConnectionPoolStats();

    console.log("📊 Database Performance Summary:");
    console.log(
      `   Queries: ${analysis.totalQueries} total, ${analysis.slowQueries} slow (${analysis.slowQueryRate}%)`,
    );
    console.log(
      `   Cache: ${analysis.cacheEfficiency.hitRate} hit rate, ${analysis.cacheEfficiency.size} entries`,
    );
    console.log(
      `   Pool: ${poolStats.totalConnections}/${poolStats.maxConnections} connections, ${poolStats.waitingClients} waiting`,
    );

    if (analysis.recommendations.length > 0) {
      console.log(
        "   Recommendations:",
        analysis.recommendations.map((r) => r.message).join("; "),
      );
    }
  }

  /**
   * Generate unique query ID for tracking
   */
  generateQueryId(query, params) {
    const normalizedQuery = query.replace(/\s+/g, " ").trim();
    const paramString = params.length > 0 ? JSON.stringify(params) : "";
    return `${normalizedQuery}:${paramString}`;
  }

  /**
   * Get comprehensive performance report
   */
  getPerformanceReport() {
    return {
      queryAnalysis: this.analyzeQueryPerformance(),
      connectionPool: this.optimizeConnectionPool(),
      recommendations: this.generateOptimizationSuggestions(
        this.getConnectionPoolStats(),
      ),
      monitoringStats: this.connectionMonitor,
      cacheStats: queryCache.getStats(),
    };
  }
}

export default new DatabaseOptimizer();
