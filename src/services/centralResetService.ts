/**
 * Central Reset Service
 * Handles timezone-aware daily and monthly resets for all users
 *
 * This service centralizes all reset logic to ensure consistency across the bot.
 * It uses node-cron for scheduling and winston for structured logging.
 *
 * Key Features:
 * - Per-user timezone-aware daily resets (streaks, voice limits)
 * - Monthly leaderboard resets that respect user timezones
 * - Comprehensive logging with timezone context
 * - Graceful error handling and recovery
 * - Performance monitoring and metrics
 *
 * References:
 * - node-cron: https://www.npmjs.com/package/node-cron
 * - winston: https://github.com/winstonjs/winston
 */

import cron from "node-cron";
import * as timezoneService from "./timezoneService.ts";
import * as voiceService from "./voiceService.ts";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { db } from "../models/db.ts";

// Extend dayjs with timezone support
dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Get users who need monthly reset
 * @returns {Promise<Array>} Array of users needing monthly reset
 */
async function getUsersNeedingMonthlyReset() {
  try {
    const result = await db.$client.query(`
                SELECT
                    discord_id,
                    timezone,
                    last_monthly_reset_tz,
                    timezone_set_at
                FROM users
                WHERE timezone IS NOT NULL
                AND (
                    last_monthly_reset_tz IS NULL
                    OR last_monthly_reset_tz < (NOW() - INTERVAL '32 days')
                )
                ORDER BY timezone, discord_id
            `);

    // Filter to only include users who are actually past the 1st of their local month
    const usersNeedingReset = [];
    for (const user of result.rows) {
      const userTime = dayjs().tz(user.timezone);
      const lastReset = user.last_monthly_reset_tz
        ? dayjs(user.last_monthly_reset_tz).tz(user.timezone)
        : null;

      // If no last reset, or last reset was in a previous month in user's timezone
      if (!lastReset || !userTime.isSame(lastReset, "month")) {
        usersNeedingReset.push(user);
      }
    }

    return usersNeedingReset;
  } catch (error) {
    console.warn("Fallback: Could not get users needing monthly reset", {
      error: error.message,
    });
    return [];
  }
}

/**
 * Get users who need daily reset (haven't been reset today in their timezone)
 * @returns {Promise<Array>} Array of users needing daily reset
 */
async function getUsersNeedingDailyReset() {
  try {
    const result = await db.$client.query(`
                SELECT
                    discord_id,
                    timezone,
                    last_daily_reset_tz,
                    timezone_set_at
                FROM users
                WHERE timezone IS NOT NULL
                AND (
                    last_daily_reset_tz IS NULL
                    OR last_daily_reset_tz < (NOW() - INTERVAL '25 hours')
                )
                ORDER BY timezone, discord_id
            `);

    // Filter to only include users who are actually past their local midnight
    const usersNeedingReset = [];
    for (const user of result.rows) {
      const userTime = dayjs().tz(user.timezone);
      const lastReset = user.last_daily_reset_tz
        ? dayjs(user.last_daily_reset_tz).tz(user.timezone)
        : null;

      // If no last reset, or last reset was yesterday or earlier in user's timezone
      if (!lastReset || !userTime.isSame(lastReset, "day")) {
        usersNeedingReset.push(user);
      }
    }

    return usersNeedingReset;
  } catch (error) {
    console.warn("Fallback: Could not get users needing daily reset", {
      error: error.message,
    });
    return [];
  }
}

class CentralResetService {
  public isRunning: boolean;
  public scheduledJobs: Map<string, cron.ScheduledTask>;
  public resetStats: {
    dailyResets: { successful: number; failed: number; lastRun: Date | null };
    monthlyResets: { successful: number; failed: number; lastRun: Date | null };
  };

  constructor() {
    this.isRunning = false;
    this.scheduledJobs = new Map(); // Track all scheduled cron jobs
    this.resetStats = {
      dailyResets: { successful: 0, failed: 0, lastRun: null },
      monthlyResets: { successful: 0, failed: 0, lastRun: null },
    };
  }

  /**
   * Start the central reset service
   * This sets up all cron jobs for timezone-aware resets
   */
  async start() {
    if (this.isRunning) {
      return;
    }

    try {
      // Schedule daily reset checks - run every hour to catch all timezones
      // Cron syntax: minute hour day month dayOfWeek
      const dailyResetJob = cron.schedule(
        "0 * * * *",
        async () => {
          await this.processDailyResets();
        },
        {
          timezone: "UTC", // Always run in UTC, convert per user
        }
      );

      // Schedule monthly reset checks - run every 6 hours on the 1st of the month
      const monthlyResetJob = cron.schedule(
        "0 */6 1 * *",
        async () => {
          await this.processMonthlyResets();
        },
        {
          timezone: "UTC",
        }
      );

      // Schedule service health checks - every 15 minutes
      const healthCheckJob = cron.schedule(
        "*/15 * * * *",
        async () => {
          await this.performHealthCheck();
        },
        {
          timezone: "UTC",
        }
      );

      // Track all jobs
      this.scheduledJobs.set("dailyReset", dailyResetJob);
      this.scheduledJobs.set("monthlyReset", monthlyResetJob);
      this.scheduledJobs.set("healthCheck", healthCheckJob);

      // Start all jobs
      dailyResetJob.start();
      monthlyResetJob.start();
      healthCheckJob.start();

      this.isRunning = true;

      // Run initial health check
      await this.performHealthCheck();
    } catch (error) {
      console.error("Failed to start CentralResetService", {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Stop the central reset service
   * Gracefully shuts down all scheduled jobs
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    try {
      // Stop all scheduled jobs
      for (const [, job] of this.scheduledJobs.entries()) {
        job.destroy();
      }

      this.scheduledJobs.clear();
      this.isRunning = false;
    } catch (error) {
      console.error("Error stopping CentralResetService", {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * Process daily resets for all users
   * Checks each timezone and performs resets for users whose local time
   * indicates they need a daily reset
   */
  async processDailyResets() {
    const startTime = Date.now();

    try {
      // Get all users who need daily reset (timezone-aware)
      const usersNeedingReset =
        await getUsersNeedingDailyReset();

      if (usersNeedingReset.length === 0) {
        return;
      }

      const results = {
        successful: 0,
        failed: 0,
        errors: [],
      };

      // Process users in batches to avoid overwhelming the database
      const batchSize = 50;
      for (let i = 0; i < usersNeedingReset.length; i += batchSize) {
        const batch = usersNeedingReset.slice(i, i + batchSize);

        await Promise.allSettled(
          batch.map(async (user) => {
            try {
              await this.performDailyResetForUser(user);
              results.successful++;
            } catch (error) {
              results.failed++;
              results.errors.push({
                userId: user.discord_id,
                timezone: user.timezone,
                error: error.message,
              });
            }
          })
        );

        // Small delay between batches to be gentle on the database
        if (i + batchSize < usersNeedingReset.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      // Update service statistics
      this.resetStats.dailyResets.successful += results.successful;
      this.resetStats.dailyResets.failed += results.failed;
      this.resetStats.dailyResets.lastRun = new Date();
    } catch (error) {
      console.error("Critical error in daily reset processing", {
        error: error.message,
        stack: error.stack,
        duration: `${Date.now() - startTime}ms`,
      });
    }
  }

  /**
   * Perform daily reset for a specific user
   * @param {Object} user - User object with discord_id, timezone, etc.
   */
  async performDailyResetForUser(user) {
    const userStartTime = Date.now();

    try {
      const success = await voiceService.resetDailyStats(user.discord_id);
      if (!success) {
        throw new Error("Voice service daily reset failed");
      }

      // Reset daily task stats
      await db.$client.query(
        `
        DELETE FROM daily_task_stats
        WHERE discord_id = $1
        AND stat_date < CURRENT_DATE
                `,
        [user.discord_id]
      );

      // Update streak logic (preserve streaks appropriately)
      await this.updateUserStreak(user);
    } catch (error) {
      console.error("Error performing daily reset for user", {
        userId: user.discord_id,
        timezone: user.timezone,
        error: error.message,
        duration: `${Date.now() - userStartTime}ms`,
      });
      throw error;
    }
  }

  /**
   * Update user streak based on timezone-aware logic
   * @param {Object} user - User object
   */
  async updateUserStreak(user) {
    try {
      // Get user's current time in their timezone
      const userTime = dayjs().tz(user.timezone);
      const yesterday = userTime.subtract(1, "day");

      // Check if user had voice activity yesterday
      const result = await db.$client.query(
        `
        SELECT EXISTS(
            SELECT 1 FROM daily_voice_stats
            WHERE discord_id = $1
            AND stat_date = $2::date
            AND hours_spent > 0
        ) as had_activity`,
        [user.discord_id, yesterday.format("YYYY-MM-DD")]
      );

      const hadActivityYesterday = result.rows[0].had_activity;

      if (!hadActivityYesterday) {
        // Reset streak if no activity yesterday
        await db.$client.query(
          `
                    UPDATE users
                    SET current_streak = 0
                    WHERE discord_id = $1
                `,
          [user.discord_id]
        );
      }
    } catch (error) {
      console.error("Error updating user streak", {
        userId: user.discord_id,
        error: error.message,
      });
    }
  }

  /**
   * Process monthly resets for all users
   * Handles leaderboard resets and monthly statistics
   */
  async processMonthlyResets() {
    const startTime = Date.now();

    try {
      // Get all users who need monthly reset
      const usersNeedingReset =
        await getUsersNeedingMonthlyReset();

      if (usersNeedingReset.length === 0) {
        return;
      }

      const results = {
        successful: 0,
        failed: 0,
        errors: [],
      };

      // Process monthly resets in batches
      const batchSize = 25; // Smaller batches for monthly resets
      for (let i = 0; i < usersNeedingReset.length; i += batchSize) {
        const batch = usersNeedingReset.slice(i, i + batchSize);

        await Promise.allSettled(
          batch.map(async (user) => {
            try {
              await this.performMonthlyResetForUser(user);
              results.successful++;
            } catch (error) {
              results.failed++;
              results.errors.push({
                userId: user.discord_id,
                timezone: user.timezone,
                error: error.message,
              });
            }
          })
        );

        // Delay between batches
        if (i + batchSize < usersNeedingReset.length) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }

      // Update service statistics
      this.resetStats.monthlyResets.successful += results.successful;
      this.resetStats.monthlyResets.failed += results.failed;
      this.resetStats.monthlyResets.lastRun = new Date();
    } catch (error) {
      console.error("Critical error in monthly reset processing", {
        error: error.message,
        stack: error.stack,
        duration: `${Date.now() - startTime}ms`,
      });
    }
  }

  /**
   * Perform monthly reset for a specific user
   * @param {Object} user - User object
   */
  async performMonthlyResetForUser(user) {
    try {
      // Reset monthly stats
      await db.$client.query(
        `
                    UPDATE users
                    SET
                        monthly_hours = 0,
                        monthly_points = 0,
                        last_monthly_reset_tz = NOW()
                    WHERE discord_id = $1
                `,
        [user.discord_id]
      );
    } catch (error) {
      console.error("Error performing monthly reset for user", {
        userId: user.discord_id,
        timezone: user.timezone,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Perform health check on the service
   * Monitors performance and ensures all systems are operational
   */
  async performHealthCheck() {
    try {
      const healthData = {
        timestamp: new Date().toISOString(),
        isRunning: this.isRunning,
        activeJobs: this.scheduledJobs.size,
        resetStats: this.resetStats,
        systemStatus: "healthy",
        databaseConnected: false,
        timezoneServiceOk: false,
      };

      // Check database connectivity
      try {
        await db.$client.query("SELECT 1");
        healthData.databaseConnected = true;
      } catch (_error) {
        healthData.systemStatus = "degraded";
      }

      // Check timezone service
      try {
        await timezoneService.getUserTimezone("health-check");
        healthData.timezoneServiceOk = true;
      } catch (_error) {
        healthData.systemStatus = "degraded";
      }

      if (healthData.systemStatus !== "healthy") {
        console.warn("Health check detected issues", healthData);
      }

      return healthData;
    } catch (error) {
      console.error("Health check failed", {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Get service statistics and status
   * @returns {Object} Service status and metrics
   */
  getServiceStatus() {
    return {
      isRunning: this.isRunning,
      activeJobs: Array.from(this.scheduledJobs.keys()),
      resetStats: this.resetStats,
      uptime: this.isRunning
        ? Date.now() -
          (this.resetStats.dailyResets.lastRun?.getTime() || Date.now())
        : 0,
    };
  }

  /**
   * Force a manual daily reset check
   * Useful for testing and administrative purposes
   */
  async forceManualDailyReset() {
    await this.processDailyResets();
  }

  /**
   * Force a manual monthly reset check
   * Useful for testing and administrative purposes
   */
  async forceManualMonthlyReset() {
    await this.processMonthlyResets();
  }
}

// Export singleton instance
export default new CentralResetService();
