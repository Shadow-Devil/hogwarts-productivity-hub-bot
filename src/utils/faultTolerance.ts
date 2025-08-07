import EventEmitter from "events";

/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures by temporarily blocking requests to failing services
 */
class CircuitBreaker extends EventEmitter {
  public options: {
    failureThreshold: number; // Number of failures before opening
    recoveryTimeout: number; // Time to wait before allowing half-open state
    monitorTimeout: number; // Timeout for monitoring operations
    name: string; // Name of the circuit breaker
  };

  public state: "CLOSED" | "OPEN" | "HALF_OPEN"; // Current state of the circuit breaker
  public failureCount: number
  public lastFailureTime: number | null; // Timestamp of the last failure
  public nextAttempt: number | null; // Timestamp for the next attempt in HALF_OPEN state
  
  public metrics: {
    requests: number; // Total requests made
    failures: number; // Total failures
    successes: number; // Total successes
    rejections: number; // Total rejections due to OPEN state
  };

  constructor({
    failureThreshold = 5, // Failures before opening
    recoveryTimeout = 30000, // 30 seconds
    monitorTimeout = 2000, // 2 seconds
    name = "circuit-breaker",
  } = {}) {
    super();

    this.options = {
      failureThreshold,
      recoveryTimeout,
      monitorTimeout,
      name,
    };

    this.state = "CLOSED"; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.nextAttempt = null;

    this.metrics = {
      requests: 0,
      failures: 0,
      successes: 0,
      rejections: 0,
    };
  }

  async execute(operation) {
    this.metrics.requests++;

    if (this.state === "OPEN") {
      if (Date.now() < this.nextAttempt) {
        this.metrics.rejections++;
        throw new Error(
          `Circuit breaker [${this.options.name}] is OPEN - service temporarily unavailable`,
        );
      } else {
        this.state = "HALF_OPEN";
        this.emit("halfOpen", this.options.name);
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    this.metrics.successes++;

    if (this.state === "HALF_OPEN") {
      this.state = "CLOSED";
      this.emit("closed", this.options.name);
    }
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.metrics.failures++;

    if (this.failureCount >= this.options.failureThreshold) {
      this.state = "OPEN";
      this.nextAttempt = Date.now() + this.options.recoveryTimeout;
      this.emit("opened", this.options.name);
    }
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      metrics: { ...this.metrics },
    };
  }

  reset() {
    this.state = "CLOSED";
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.nextAttempt = null;
    this.metrics = {
      requests: 0,
      failures: 0,
      successes: 0,
      rejections: 0,
    };
  }
}

/**
 * Retry with Exponential Backoff
 */
class RetryHandler {
  public options: {
    maxRetries: number; // Maximum number of retries
    baseDelay: number; // Base delay in milliseconds
    maxDelay: number; // Maximum delay in milliseconds
    backoffFactor: number; // Factor to increase delay each retry
    jitter: boolean; // Whether to add randomness to delay
  };

  constructor({
    maxRetries = 3,
    baseDelay = 1000, // 1 second
    maxDelay = 30000, // 30 seconds
    backoffFactor = 2,
    jitter = true, // Add randomness to delay
  } = {}) {
    this.options = {
      maxRetries,
      baseDelay,
      maxDelay,
      backoffFactor,
      jitter,
    };
  }

  async execute(operation, retryableErrors = []) {
    let lastError;

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        // Don't retry if it's not a retryable error
        if (
          retryableErrors.length > 0 &&
          !this.isRetryableError(error, retryableErrors)
        ) {
          throw error;
        }

        // Don't retry on the last attempt
        if (attempt === this.options.maxRetries) {
          break;
        }

        const delay = this.calculateDelay(attempt);
        console.warn(
          `Retry attempt ${attempt + 1}/${this.options.maxRetries + 1} failed, retrying in ${delay}ms:`,
          error.message,
        );
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  calculateDelay(attempt) {
    const exponentialDelay =
      this.options.baseDelay * Math.pow(this.options.backoffFactor, attempt);
    const cappedDelay = Math.min(exponentialDelay, this.options.maxDelay);

    if (this.options.jitter) {
      // Add jitter to prevent thundering herd
      return cappedDelay * (0.5 + Math.random() * 0.5);
    }

    return cappedDelay;
  }

  isRetryableError(error, retryableErrors) {
    return retryableErrors.some((retryableError) => {
      if (typeof retryableError === "string") {
        return (
          error.message.includes(retryableError) ||
          error.code === retryableError
        );
      }
      return error instanceof retryableError;
    });
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Timeout Handler
 */
class TimeoutHandler {
  static withTimeout(
    operation,
    timeoutMs,
    errorMessage = "Operation timed out",
  ) {
    return Promise.race([
      operation,
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(errorMessage));
        }, timeoutMs);
      }),
    ]);
  }
}

/**
 * Health Check System
 */
class HealthChecker {
  public checks: Map<
    string,
    { check: Function; timeout: number; interval: number; critical: boolean }
  >;
  public lastResults: Map<string, any>;

  constructor() {
    this.checks = new Map();
    this.lastResults = new Map();
  }

  registerCheck(
    name,
    checkFunction,
    {
      timeout = 5000, // Default 5 seconds
      interval = 30000, // Default 30 seconds
      critical = true, // Default critical check
    } = {},
  ) {
    this.checks.set(name, {
      check: checkFunction,
      timeout,
      interval,
      critical,
    });
  }

  async runCheck(name) {
    const checkConfig = this.checks.get(name);
    if (!checkConfig) {
      throw new Error(`Health check '${name}' not found`);
    }

    try {
      const result = await TimeoutHandler.withTimeout(
        checkConfig.check(),
        checkConfig.timeout,
        `Health check '${name}' timed out`,
      );

      const healthResult = {
        name,
        status: "healthy",
        timestamp: new Date(),
        responseTime: Date.now(),
        details: result,
      };

      this.lastResults.set(name, healthResult);
      return healthResult;
    } catch (error) {
      const healthResult = {
        name,
        status: "unhealthy",
        timestamp: new Date(),
        error: error.message,
        critical: checkConfig.critical,
      };

      this.lastResults.set(name, healthResult);
      return healthResult;
    }
  }

  async runAllChecks() {
    const results = {};
    const promises = Array.from(this.checks.keys()).map(async (name) => {
      try {
        results[name] = await this.runCheck(name);
      } catch (error) {
        results[name] = {
          name,
          status: "error",
          error: error.message,
          timestamp: new Date(),
        };
      }
    });

    await Promise.all(promises);
    return results;
  }

  getOverallHealth() {
    const results = Array.from(this.lastResults.values());
    const criticalIssues = results.filter(
      (r) => r.status !== "healthy" && r.critical,
    );
    const anyIssues = results.filter((r) => r.status !== "healthy");

    if (criticalIssues.length > 0) {
      return { status: "critical", issues: criticalIssues };
    } else if (anyIssues.length > 0) {
      return { status: "degraded", issues: anyIssues };
    } else {
      return { status: "healthy", checks: results.length };
    }
  }
}

export { CircuitBreaker, RetryHandler, TimeoutHandler, HealthChecker };
