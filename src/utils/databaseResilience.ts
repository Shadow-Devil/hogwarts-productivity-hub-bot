import { CircuitBreaker, RetryHandler, TimeoutHandler } from "./faultTolerance.ts";
import { performanceMonitor } from "./performanceMonitor.ts";
import type { ClientBase, Pool } from "pg";

/**
 * Enhanced Database Resilience Module
 * Provides fault-tolerant database operations with automatic retries, circuit breakers, and deadlock detection
 */
class DatabaseResilience {
  public pool: Pool; // Database connection pool
  public circuitBreakers: Record<string, CircuitBreaker>;
  public retryHandler: RetryHandler;
  public connectionMetrics: {
    activeConnections: number;
    totalQueries: number;
    failedQueries: number;
    deadlocks: number;
    timeouts: number;
  };

  constructor(pool) {
    this.pool = pool;

    // Circuit breakers for different operation types
    this.circuitBreakers = {
      query: new CircuitBreaker({
        name: "database-query",
        failureThreshold: 5,
        recoveryTimeout: 30000,
      }),
      transaction: new CircuitBreaker({
        name: "database-transaction",
        failureThreshold: 3,
        recoveryTimeout: 45000,
      }),
      connection: new CircuitBreaker({
        name: "database-connection",
        failureThreshold: 3,
        recoveryTimeout: 60000,
      }),
    };

    // Retry handlers
    this.retryHandler = new RetryHandler({
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
    });

    // Connection monitoring
    this.connectionMetrics = {
      activeConnections: 0,
      totalQueries: 0,
      failedQueries: 0,
      deadlocks: 0,
      timeouts: 0,
    };

    this.setupEventListeners();
  }

  setupEventListeners() {
    // Monitor circuit breaker events
    Object.values(this.circuitBreakers).forEach((cb) => {
      cb.on("opened", (name) => {
        console.warn(`🔴 Circuit breaker [${name}] OPENED - service degraded`);
        performanceMonitor.recordEvent("circuit_breaker_opened", { name });
      });

      cb.on("closed", (name) => {
        console.log(`🟢 Circuit breaker [${name}] CLOSED - service recovered`);
        performanceMonitor.recordEvent("circuit_breaker_closed", { name });
      });

      cb.on("halfOpen", (name) => {
        console.log(
          `🟡 Circuit breaker [${name}] HALF_OPEN - testing recovery`,
        );
      });
    });

    // Monitor pool events
    this.pool.on("error", (err) => {
      console.error("🔴 Database pool error:", err);
      this.connectionMetrics.failedQueries++;
    });

    this.pool.on("connect", () => {
      this.connectionMetrics.activeConnections++;
    });

    this.pool.on("remove", () => {
      this.connectionMetrics.activeConnections--;
    });
  }

  /**
   * Execute a database operation with resilience (callback receives client)
   * This is the main function used throughout the codebase for database operations
   */
  async executeWithResilience<T>(
    callback: (client: ClientBase) => Promise<T>,
    {
      timeout = 30000, // Default timeout 30 seconds
    } = {},
  ): Promise<T> {
    const startTime = Date.now();

    try {
      return await this.circuitBreakers.query.execute(async () => {
        return await this.retryHandler.execute(async () => {
          return await TimeoutHandler.withTimeout(
            (async () => {
              this.connectionMetrics.activeConnections++;
              this.connectionMetrics.totalQueries++;

              const client = await this.pool.connect();
              try {
                const result = await callback(client);
                return result;
              } finally {
                client.release();
                this.connectionMetrics.activeConnections--;
              }
            })(),
            timeout,
          );
        });
      });
    } catch (error) {
      this.connectionMetrics.failedQueries++;
      this.handleDatabaseError(error);
      throw error;
    } finally {
      // Record performance metrics
      performanceMonitor.trackDatabase(
        "executeWithResilience",
        startTime,
        Date.now(),
      );
    }
  }

  /**
   * Handle database errors for executeWithResilience
   */
  handleDatabaseError(error) {
    if (this.isDeadlock(error)) {
      this.connectionMetrics.deadlocks++;
      console.warn(
        "🔒 Database deadlock detected in operation - will retry:",
        error.message,
      );
    }

    if (this.isTimeout(error)) {
      this.connectionMetrics.timeouts++;
      console.warn("⏰ Database operation timeout:", error.message);
    }

    if (this.isConnectionError(error)) {
      console.error(
        "🔌 Database connection error in operation:",
        error.message,
      );
    }
  }

  /**
   * Execute a query with full fault tolerance
   */
  async executeQuery(
    text,
    params = [],
    {
      timeout = 30000, // Default 30 seconds
    } = {},
  ) {
    const startTime = Date.now();

    try {
      return await this.circuitBreakers.query.execute(async () => {
        return await this.retryHandler.execute(async () => {
          return await TimeoutHandler.withTimeout(
            this._executeQueryInternal(text, params),
            timeout,
            "Query execution timed out",
          );
        }, this.getRetryableErrors());
      });
    } catch (error) {
      this.handleQueryError(error, text);
      throw error;
    } finally {
      this.connectionMetrics.totalQueries++;
      performanceMonitor.trackDatabase("query", startTime, Date.now());
    }
  }

  async _executeQueryInternal(text, params) {
    const client = await this.getConnection();
    try {
      const result = await client.query(text, params);
      return result;
    } finally {
      client.release();
    }
  }

  /**
   * Execute transaction with deadlock detection and retry
   */
  async executeTransaction(
    callback,
    {
      timeout = 60000, // Default 60 seconds
    } = {},
  ) {
    const startTime = Date.now();

    try {
      return await this.circuitBreakers.transaction.execute(async () => {
        return await this.retryHandler.execute(async () => {
          return await TimeoutHandler.withTimeout(
            this._executeTransactionInternal(callback),
            timeout,
            "Transaction timed out",
          );
        }, this.getTransactionRetryableErrors());
      });
    } catch (error) {
      this.handleTransactionError(error);
      throw error;
    } finally {
      performanceMonitor.trackDatabase("transaction", startTime, Date.now());
    }
  }

  async _executeTransactionInternal(callback) {
    const client = await this.getConnection();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get database connection with circuit breaker protection
   */
  async getConnection() {
    return await this.circuitBreakers.connection.execute(async () => {
      return await this.pool.connect();
    });
  }

  /**
   * Determine if an error is retryable
   */
  getRetryableErrors() {
    return [
      "ECONNRESET",
      "ENOTFOUND",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "connection terminated",
      "connection not available",
      "pool is ended",
      "Client has encountered a connection error",
    ];
  }

  getTransactionRetryableErrors() {
    return [
      ...this.getRetryableErrors(),
      "deadlock detected", // PostgreSQL deadlock
      "could not serialize access", // Serialization failure
      "duplicate key value", // Retry for race conditions
      "lock timeout",
    ];
  }

  /**
   * Handle query-specific errors
   */
  handleQueryError(error, query) {
    this.connectionMetrics.failedQueries++;

    if (this.isDeadlock(error)) {
      this.connectionMetrics.deadlocks++;
      console.warn("🔒 Database deadlock detected:", {
        error: error.message,
        query: query.substring(0, 100) + "...",
      });
    }

    if (this.isTimeout(error)) {
      this.connectionMetrics.timeouts++;
      console.warn("⏰ Database query timeout:", {
        error: error.message,
        query: query.substring(0, 100) + "...",
      });
    }

    if (this.isConnectionError(error)) {
      console.error("🔌 Database connection error:", error.message);
    }
  }

  handleTransactionError(error) {
    if (this.isDeadlock(error)) {
      this.connectionMetrics.deadlocks++;
      console.warn(
        "🔒 Transaction deadlock detected - will retry:",
        error.message,
      );
    }
  }

  isDeadlock(error) {
    return (
      error.message &&
      (error.message.includes("deadlock detected") ||
        error.message.includes("could not serialize access") ||
        error.code === "40P01" || // PostgreSQL deadlock
        error.code === "40001") // Serialization failure
    );
  }

  isTimeout(error) {
    return (
      error.message &&
      (error.message.includes("timeout") ||
        error.message.includes("ETIMEDOUT") ||
        error.code === "ETIMEDOUT")
    );
  }

  isConnectionError(error) {
    return (
      error.message &&
      (error.message.includes("ECONNRESET") ||
        error.message.includes("ECONNREFUSED") ||
        error.message.includes("connection terminated") ||
        error.message.includes("connection not available"))
    );
  }

  /**
   * Get resilience metrics
   */
  getMetrics() {
    return {
      connections: { ...this.connectionMetrics },
      circuitBreakers: Object.fromEntries(
        Object.entries(this.circuitBreakers).map(([name, cb]) => [
          name,
          cb.getState(),
        ]),
      ),
      poolStats: {
        totalCount: this.pool.totalCount || 0,
        idleCount: this.pool.idleCount || 0,
        waitingCount: this.pool.waitingCount || 0,
      },
    };
  }

  /**
   * Health check for database
   */
  async healthCheck() {
    try {
      const startTime = Date.now();
      await this.executeQuery("SELECT 1 as health_check", [], {
        timeout: 5000,
      });
      const responseTime = Date.now() - startTime;

      const metrics = this.getMetrics();
      const poolUtilization =
        (metrics.poolStats.totalCount / (this.pool.options.max || 50)) * 100;

      return {
        status: "healthy",
        responseTime,
        poolUtilization: Math.round(poolUtilization),
        metrics,
      };
    } catch (error) {
      return {
        status: "unhealthy",
        error: error.message,
        metrics: this.getMetrics(),
      };
    }
  }

  /**
   * Reset circuit breakers (for admin use)
   */
  resetCircuitBreakers() {
    Object.values(this.circuitBreakers).forEach((cb) => cb.reset());
    console.log("🔄 All circuit breakers reset");
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log("🛑 Shutting down database resilience...");

    // Wait for ongoing operations to complete (max 5 seconds for faster shutdown)
    const startTime = Date.now();
    while (
      this.connectionMetrics.activeConnections > 0 &&
      Date.now() - startTime < 5000
    ) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Force close the pool with timeout
    await Promise.race([
      this.pool.end(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Pool shutdown timeout")), 3000),
      ),
    ]).catch((error) => {
      console.warn("⚠️ Database pool forced shutdown:", error.message);
    });

    console.log("✅ Database resilience shutdown complete");
  }
}

export default DatabaseResilience;
