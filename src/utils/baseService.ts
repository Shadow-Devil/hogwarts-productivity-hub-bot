/**
 * Base Service Class with Optimized/Fallback Pattern
 * Eliminates code duplication in service methods
 */

import { measureDatabase } from "./performanceMonitor.ts";

class BaseService {
  public serviceName: string;

  constructor(serviceName) {
    this.serviceName = serviceName;
  }

  /**
   * Execute method with optimized/fallback pattern
   * Automatically tries optimized version first, falls back to original on failure
   * @param {string} methodName - Name of the method for logging
   * @param {Function} optimizedFn - Optimized implementation function
   * @param {Function} fallbackFn - Fallback implementation function
   * @param {Array} args - Arguments to pass to both functions
   * @returns {Promise} Result from optimized or fallback function
   */
  async executeWithFallback(methodName: string, optimizedFn: Function, fallbackFn: Function, ...args: Array<any>): Promise<any> {
    try {
      // Try optimized version first
      return measureDatabase(`${methodName}Optimized`, async () => {
        return await optimizedFn(...args);
      });
    } catch (error) {
      console.warn(
        `⚠️ Optimized ${methodName} failed, falling back to original:`,
        error.message,
      );

      // Fall back to original implementation
      return await measureDatabase(`${methodName}Original`, async () => {
        return await fallbackFn(...args);
      });
    }
  }

  /**
   * Execute single method with performance monitoring
   * @param {string} methodName - Name of the method for logging
   * @param {Function} fn - Function to execute
   * @param {Array} args - Arguments to pass to function
   * @returns {Promise} Result from function
   */
  async executeWithMonitoring(methodName, fn, ...args) {
    return await measureDatabase(methodName, async () => {
      return await fn(...args);
    });
  }
}

export default BaseService;
