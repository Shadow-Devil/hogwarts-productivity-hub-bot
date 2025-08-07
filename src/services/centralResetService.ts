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

const cron = require("node-cron");
const winston = require("winston");
const { pool } = require("../models/db");
const timezoneService = require("./timezoneService");
const voiceService = require("./voiceService");
const BaseService = require("../utils/baseService");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");

// Extend dayjs with timezone support
dayjs.extend(utc);
dayjs.extend(timezone);

class CentralResetService extends BaseService {
  constructor() {
    super("CentralResetService");

    this.isRunning = false;
    this.scheduledJobs = new Map(); // Track all scheduled cron jobs
    this.resetStats = {
      dailyResets: { successful: 0, failed: 0, lastRun: null },
      monthlyResets: { successful: 0, failed: 0, lastRun: null },
    };

    // Initialize structured logger with timezone-aware timestamps
    this.logger = winston.createLogger({
      level: "info",
      format: winston.format.combine(
        winston.format.timestamp({
          format: () => dayjs().utc().format("YYYY-MM-DD HH:mm:ss UTC"),
        }),
        winston.format.errors({ stack: true }),
        winston.format.json(),
        winston.format.colorize({ all: true }),
      ),
      defaultMeta: { service: "CentralResetService" },
      transports: [
        new winston.transports.Console({
          level: "info",
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(
              ({ timestamp, level, message, service, ...meta }) => {
                const metaStr = Object.keys(meta).length
                  ? JSON.stringify(meta, null, 2)
                  : "";
                return `${timestamp} [${service}] ${level}: ${message} ${metaStr}`;
              },
            ),
          ),
        }),
        // File transport for persistent logging
        new winston.transports.File({
          filename: "logs/timezone-resets.log",
          level: "debug",
          format: winston.format.json(),
          maxsize: 10485760, // 10MB
          maxFiles: 5,
          tailable: true,
        }),
      ],
      // Handle uncaught exceptions in reset operations
      exceptionHandlers: [
        new winston.transports.File({ filename: "logs/reset-exceptions.log" }),
      ],
    });

    this.logger.info("CentralResetService initialized", {
      features: [
        "timezone-aware resets",
        "cron scheduling",
        "structured logging",
      ],
      logLevel: "info",
    });
  }

  /**
   * Start the central reset service
   * This sets up all cron jobs for timezone-aware resets
   */
  async start() {
    if (this.isRunning) {
      this.logger.warn("CentralResetService already running");
      return;
    }

    this.logger.info("Starting CentralResetService...");

    try {
      // Schedule daily reset checks - run every hour to catch all timezones
      // Cron syntax: minute hour day month dayOfWeek
      const dailyResetJob = cron.schedule(
        "0 * * * *",
        async () => {
          await this.processDailyResets();
        },
        {
          scheduled: false,
          timezone: "UTC", // Always run in UTC, convert per user
        },
      );

      // Schedule monthly reset checks - run every 6 hours on the 1st of the month
      const monthlyResetJob = cron.schedule(
        "0 */6 1 * *",
        async () => {
          await this.processMonthlyResets();
        },
        {
          scheduled: false,
          timezone: "UTC",
        },
      );

      // Schedule service health checks - every 15 minutes
      const healthCheckJob = cron.schedule(
        "*/15 * * * *",
        async () => {
          await this.performHealthCheck();
        },
        {
          scheduled: false,
          timezone: "UTC",
        },
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

      this.logger.info("CentralResetService started successfully", {
        activeJobs: Array.from(this.scheduledJobs.keys()),
        timezone: "UTC",
        dailyResetCron: "0 * * * *", // Every hour
        monthlyResetCron: "0 */6 1 * *", // Every 6 hours on 1st
        healthCheckCron: "*/15 * * * *", // Every 15 minutes
      });

      // Run initial health check
      await this.performHealthCheck();
    } catch (error) {
      this.logger.error("Failed to start CentralResetService", {
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
      this.logger.warn("CentralResetService not running");
      return;
    }

    this.logger.info("Stopping CentralResetService...");

    try {
      // Stop all scheduled jobs
      for (const [jobName, job] of this.scheduledJobs.entries()) {
        job.destroy();
        this.logger.debug("Stopped scheduled job", { jobName });
      }

      this.scheduledJobs.clear();
      this.isRunning = false;

      this.logger.info("CentralResetService stopped successfully", {
        resetStats: this.resetStats,
      });
    } catch (error) {
      this.logger.error("Error stopping CentralResetService", {
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
    this.logger.info("Starting daily reset processing cycle");

    try {
      // Get all users who need daily reset (timezone-aware)
      const usersNeedingReset =
        await timezoneService.getUsersNeedingDailyReset();

      this.logger.info("Found users needing daily reset", {
        userCount: usersNeedingReset.length,
        timezones: [...new Set(usersNeedingReset.map((u) => u.timezone))],
      });

      if (usersNeedingReset.length === 0) {
        this.logger.debug("No users need daily reset at this time");
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

        this.logger.debug("Processing daily reset batch", {
          batchNumber: Math.floor(i / batchSize) + 1,
          batchSize: batch.length,
          totalBatches: Math.ceil(usersNeedingReset.length / batchSize),
        });

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

              this.logger.error("Failed to perform daily reset for user", {
                userId: user.discord_id,
                timezone: user.timezone,
                error: error.message,
              });
            }
          }),
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

      const duration = Date.now() - startTime;

      this.logger.info("Daily reset processing completed", {
        duration: `${duration}ms`,
        successful: results.successful,
        failed: results.failed,
        totalUsers: usersNeedingReset.length,
        errors: results.errors.slice(0, 5), // Log first 5 errors for debugging
      });
    } catch (error) {
      this.logger.error("Critical error in daily reset processing", {
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
      // Reset daily voice stats and limits using voiceService
      await this.executeWithFallback(
        async () => {
          const success = await voiceService.resetDailyStats(user.discord_id);
          if (!success) {
            throw new Error("Voice service daily reset failed");
          }
          return { success: true };
        },
        async () => {
          this.logger.warn(
            "Fallback: Could not reset daily voice stats for user",
            {
              userId: user.discord_id,
            },
          );
        },
      );

      // Reset daily task stats
      await this.executeWithFallback(
        async () => {
          return await pool.query(
            `
                    DELETE FROM daily_task_stats
                    WHERE discord_id = $1
                    AND stat_date < CURRENT_DATE
                `,
            [user.discord_id],
          );
        },
        async () => {
          this.logger.warn("Fallback: Could not reset daily task stats", {
            userId: user.discord_id,
          });
        },
      );

      // Update streak logic (preserve streaks appropriately)
      await this.updateUserStreak(user);

      const duration = Date.now() - userStartTime;

      this.logger.debug("Daily reset completed for user", {
        userId: user.discord_id,
        timezone: user.timezone,
        duration: `${duration}ms`,
      });
    } catch (error) {
      this.logger.error("Error performing daily reset for user", {
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
      const hadActivityYesterday = await this.executeWithFallback(
        async () => {
          const result = await pool.query(
            `
                    SELECT EXISTS(
                        SELECT 1 FROM daily_voice_stats
                        WHERE discord_id = $1
                        AND stat_date = $2::date
                        AND hours_spent > 0
                    ) as had_activity
                `,
            [user.discord_id, yesterday.format("YYYY-MM-DD")],
          );

          return result.rows[0].had_activity;
        },
        async () => {
          this.logger.warn(
            "Fallback: Could not check yesterday activity for streak",
            {
              userId: user.discord_id,
            },
          );
          return false;
        },
      );

      if (!hadActivityYesterday) {
        // Reset streak if no activity yesterday
        await this.executeWithFallback(
          async () => {
            return await pool.query(
              `
                        UPDATE users
                        SET current_streak = 0
                        WHERE discord_id = $1
                    `,
              [user.discord_id],
            );
          },
          async () => {
            this.logger.warn("Fallback: Could not reset streak for user", {
              userId: user.discord_id,
            });
          },
        );

        this.logger.debug("Streak reset for user (no activity yesterday)", {
          userId: user.discord_id,
          timezone: user.timezone,
        });
      } else {
        this.logger.debug(
          "Streak preserved for user (had activity yesterday)",
          {
            userId: user.discord_id,
            timezone: user.timezone,
          },
        );
      }
    } catch (error) {
      this.logger.error("Error updating user streak", {
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
    this.logger.info("Starting monthly reset processing cycle");

    try {
      // Get all users who need monthly reset
      const usersNeedingReset =
        await timezoneService.getUsersNeedingMonthlyReset();

      this.logger.info("Found users needing monthly reset", {
        userCount: usersNeedingReset.length,
        timezones: [...new Set(usersNeedingReset.map((u) => u.timezone))],
      });

      if (usersNeedingReset.length === 0) {
        this.logger.debug("No users need monthly reset at this time");
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

        this.logger.debug("Processing monthly reset batch", {
          batchNumber: Math.floor(i / batchSize) + 1,
          batchSize: batch.length,
        });

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
          }),
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

      const duration = Date.now() - startTime;

      this.logger.info("Monthly reset processing completed", {
        duration: `${duration}ms`,
        successful: results.successful,
        failed: results.failed,
        totalUsers: usersNeedingReset.length,
      });
    } catch (error) {
      this.logger.error("Critical error in monthly reset processing", {
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
      await this.executeWithFallback(
        async () => {
          return await pool.query(
            `
                    UPDATE users
                    SET
                        monthly_hours = 0,
                        monthly_points = 0,
                        last_monthly_reset_tz = NOW()
                    WHERE discord_id = $1
                `,
            [user.discord_id],
          );
        },
        async () => {
          this.logger.warn("Fallback: Could not reset monthly stats for user", {
            userId: user.discord_id,
          });
        },
      );

      this.logger.debug("Monthly reset completed for user", {
        userId: user.discord_id,
        timezone: user.timezone,
      });
    } catch (error) {
      this.logger.error("Error performing monthly reset for user", {
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
        await pool.query("SELECT 1");
        healthData.databaseConnected = true;
      } catch (error) {
        healthData.systemStatus = "degraded";
        this.logger.warn("Database connectivity issue in health check", {
          error: error.message,
        });
      }

      // Check timezone service
      try {
        await timezoneService.getUserTimezone("health-check");
        healthData.timezoneServiceOk = true;
      } catch (error) {
        healthData.systemStatus = "degraded";
        this.logger.warn("TimezoneService issue in health check", {
          error: error.message,
        });
      }

      if (healthData.systemStatus === "healthy") {
        this.logger.debug("Health check passed", healthData);
      } else {
        this.logger.warn("Health check detected issues", healthData);
      }

      return healthData;
    } catch (error) {
      this.logger.error("Health check failed", {
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
    this.logger.info("Manual daily reset triggered");
    await this.processDailyResets();
  }

  /**
   * Force a manual monthly reset check
   * Useful for testing and administrative purposes
   */
  async forceManualMonthlyReset() {
    this.logger.info("Manual monthly reset triggered");
    await this.processMonthlyResets();
  }
}

// Export singleton instance
export default new CentralResetService();
