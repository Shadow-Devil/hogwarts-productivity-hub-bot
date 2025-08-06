const EventEmitter = require('events');

/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures by temporarily blocking requests to failing services
 */
class CircuitBreaker extends EventEmitter {
    constructor(options = {}) {
        super();

        this.options = {
            failureThreshold: options.failureThreshold || 5,      // Failures before opening
            recoveryTimeout: options.recoveryTimeout || 30000,   // 30 seconds
            monitorTimeout: options.monitorTimeout || 2000,      // 2 seconds
            name: options.name || 'circuit-breaker'
        };

        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
        this.failureCount = 0;
        this.lastFailureTime = null;
        this.nextAttempt = null;

        this.metrics = {
            requests: 0,
            failures: 0,
            successes: 0,
            rejections: 0
        };
    }

    async execute(operation) {
        this.metrics.requests++;

        if (this.state === 'OPEN') {
            if (Date.now() < this.nextAttempt) {
                this.metrics.rejections++;
                throw new Error(`Circuit breaker [${this.options.name}] is OPEN - service temporarily unavailable`);
            } else {
                this.state = 'HALF_OPEN';
                this.emit('halfOpen', this.options.name);
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

        if (this.state === 'HALF_OPEN') {
            this.state = 'CLOSED';
            this.emit('closed', this.options.name);
        }
    }

    onFailure() {
        this.failureCount++;
        this.lastFailureTime = Date.now();
        this.metrics.failures++;

        if (this.failureCount >= this.options.failureThreshold) {
            this.state = 'OPEN';
            this.nextAttempt = Date.now() + this.options.recoveryTimeout;
            this.emit('opened', this.options.name);
        }
    }

    getState() {
        return {
            state: this.state,
            failureCount: this.failureCount,
            metrics: { ...this.metrics }
        };
    }

    reset() {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.lastFailureTime = null;
        this.nextAttempt = null;
        this.metrics = {
            requests: 0,
            failures: 0,
            successes: 0,
            rejections: 0
        };
    }
}

/**
 * Retry with Exponential Backoff
 */
class RetryHandler {
    constructor(options = {}) {
        this.options = {
            maxRetries: options.maxRetries || 3,
            baseDelay: options.baseDelay || 1000,      // 1 second
            maxDelay: options.maxDelay || 30000,       // 30 seconds
            backoffFactor: options.backoffFactor || 2,
            jitter: options.jitter !== false           // Add randomness
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
                if (retryableErrors.length > 0 && !this.isRetryableError(error, retryableErrors)) {
                    throw error;
                }

                // Don't retry on the last attempt
                if (attempt === this.options.maxRetries) {
                    break;
                }

                const delay = this.calculateDelay(attempt);
                console.warn(`Retry attempt ${attempt + 1}/${this.options.maxRetries + 1} failed, retrying in ${delay}ms:`, error.message);
                await this.sleep(delay);
            }
        }

        throw lastError;
    }

    calculateDelay(attempt) {
        const exponentialDelay = this.options.baseDelay * Math.pow(this.options.backoffFactor, attempt);
        const cappedDelay = Math.min(exponentialDelay, this.options.maxDelay);

        if (this.options.jitter) {
            // Add jitter to prevent thundering herd
            return cappedDelay * (0.5 + Math.random() * 0.5);
        }

        return cappedDelay;
    }

    isRetryableError(error, retryableErrors) {
        return retryableErrors.some(retryableError => {
            if (typeof retryableError === 'string') {
                return error.message.includes(retryableError) || error.code === retryableError;
            }
            return error instanceof retryableError;
        });
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * Timeout Handler
 */
class TimeoutHandler {
    static withTimeout(operation, timeoutMs, errorMessage = 'Operation timed out') {
        return Promise.race([
            operation,
            new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new Error(errorMessage));
                }, timeoutMs);
            })
        ]);
    }
}

/**
 * Health Check System
 */
class HealthChecker {
    constructor() {
        this.checks = new Map();
        this.lastResults = new Map();
    }

    registerCheck(name, checkFunction, options = {}) {
        this.checks.set(name, {
            check: checkFunction,
            timeout: options.timeout || 5000,
            interval: options.interval || 30000,
            critical: options.critical !== false
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
                `Health check '${name}' timed out`
            );

            const healthResult = {
                name,
                status: 'healthy',
                timestamp: new Date(),
                responseTime: Date.now(),
                details: result
            };

            this.lastResults.set(name, healthResult);
            return healthResult;
        } catch (error) {
            const healthResult = {
                name,
                status: 'unhealthy',
                timestamp: new Date(),
                error: error.message,
                critical: checkConfig.critical
            };

            this.lastResults.set(name, healthResult);
            return healthResult;
        }
    }

    async runAllChecks() {
        const results = {};
        const promises = Array.from(this.checks.keys()).map(async(name) => {
            try {
                results[name] = await this.runCheck(name);
            } catch (error) {
                results[name] = {
                    name,
                    status: 'error',
                    error: error.message,
                    timestamp: new Date()
                };
            }
        });

        await Promise.all(promises);
        return results;
    }

    getOverallHealth() {
        const results = Array.from(this.lastResults.values());
        const criticalIssues = results.filter(r => r.status !== 'healthy' && r.critical);
        const anyIssues = results.filter(r => r.status !== 'healthy');

        if (criticalIssues.length > 0) {
            return { status: 'critical', issues: criticalIssues };
        } else if (anyIssues.length > 0) {
            return { status: 'degraded', issues: anyIssues };
        } else {
            return { status: 'healthy', checks: results.length };
        }
    }
}

module.exports = {
    CircuitBreaker,
    RetryHandler,
    TimeoutHandler,
    HealthChecker
};
