/**
 * Timezone Management Service
 * Handles user timezone preferences and timezone-aware time calculations
 * Built on the existing solid database foundation for timezone support
 */

import { db } from "../models/db.ts";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { usersTable } from "../db/schema.ts";
import { eq } from "drizzle-orm";

// Extend dayjs with timezone support
dayjs.extend(utc);
dayjs.extend(timezone);


  /**
   * Validate if a timezone is supported
   * @param {string} timezone - Timezone to validate
   * @returns {boolean} True if valid
   */
  function isValidTimezone(timezone: string): boolean {
    try {
      if (!timezone || typeof timezone !== "string") {
        return false;
      }

      // Test if dayjs can parse the timezone
      const testTime = dayjs().tz(timezone);
      return testTime.isValid();
    } catch (_error) {
      return false;
    }
  }

class TimezoneService {
  public timezoneCache = new Map<string, any>();
  public validTimezones = new Set([
      // Major timezone regions that users commonly need
      "UTC",
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "America/Toronto",
      "America/Vancouver",
      "America/Mexico_City",
      "America/Sao_Paulo",
      "Europe/London",
      "Europe/Paris",
      "Europe/Berlin",
      "Europe/Rome",
      "Europe/Madrid",
      "Europe/Amsterdam",
      "Europe/Brussels",
      "Europe/Vienna",
      "Europe/Prague",
      "Europe/Stockholm",
      "Europe/Oslo",
      "Europe/Helsinki",
      "Europe/Warsaw",
      "Europe/Budapest",
      "Europe/Bucharest",
      "Europe/Athens",
      "Europe/Istanbul",
      "Europe/Moscow",
      "Europe/Kiev",
      "Europe/Zurich",
      "Europe/Dublin",
      "Asia/Tokyo",
      "Asia/Shanghai",
      "Asia/Hong_Kong",
      "Asia/Singapore",
      "Asia/Seoul",
      "Asia/Bangkok",
      "Asia/Manila",
      "Asia/Jakarta",
      "Asia/Kolkata",
      "Asia/Dubai",
      "Asia/Karachi",
      "Asia/Tehran",
      "Asia/Baghdad",
      "Asia/Jerusalem",
      "Asia/Riyadh",
      "Asia/Kuwait",
      "Australia/Sydney",
      "Australia/Melbourne",
      "Australia/Brisbane",
      "Australia/Perth",
      "Australia/Adelaide",
      "Australia/Darwin",
      "Pacific/Auckland",
      "Pacific/Fiji",
      "Pacific/Honolulu",
      "Africa/Cairo",
      "Africa/Lagos",
      "Africa/Johannesburg",
      "Africa/Nairobi",
      "America/Argentina/Buenos_Aires",
      "America/Lima",
      "America/Santiago",
    ]);


  /**
   * Get user's timezone preference with production-grade error handling
   * @param {string} userId - User's Discord ID
   * @returns {Promise<string>} User's timezone (defaults to UTC if not set)
   */
  async getUserTimezone(userId: string) {
    try {
      // Validate input
      if (!userId || typeof userId !== "string") {
        throw new Error("Invalid userId provided");
      }

      // Check cache first (with cache warming)
      const cached = this.timezoneCache.get(userId);
      if (cached && Date.now() - cached.cachedAt < 3600000) {
        return cached.timezone;
      }


      // Database query with connection db.$clienting and timeout
      const result = await db.$client.query(
        "SELECT timezone FROM users WHERE discord_id = $1",
        [userId]
      );

      let timezone = result.rows[0]?.timezone || "UTC";

      // Validate timezone before caching
      if (!isValidTimezone(timezone)) {
        timezone = "UTC";
      }

      // Update cache with metadata
      this.timezoneCache.set(userId, {
        timezone,
        setAt: new Date(),
        cachedAt: Date.now(),
      });

      return timezone;
    } catch (error) {
      // Graceful fallback to UTC
      return "UTC";
    }
  }

  /**
   * Convert UTC time to user's local timezone
   * @param {string} userId - User's Discord ID
   * @param {Date|string} utcTime - UTC time to convert
   * @returns {Promise<dayjs.Dayjs>} Time in user's timezone
   */
  async convertToUserTime(userId, utcTime) {
    const userTimezone = await this.getUserTimezone(userId);
    return dayjs.utc(utcTime).tz(userTimezone);
  }

  /**
   * Get current time in user's timezone with robust error handling
   * @param {string} userId - User's Discord ID
   * @returns {Promise<dayjs.Dayjs>} Current time in user's timezone
   */
  async getCurrentTimeInUserTimezone(userId) {
    const startTime = Date.now();
    try {
      const userTimezone = await this.getUserTimezone(userId);
      const userTime = dayjs().tz(userTimezone);

      // Validate the result
      if (!userTime.isValid()) {
        throw new Error(`Invalid time result for timezone ${userTimezone}`);
      }

      return userTime;
    } catch (error) {
      console.error(
        "getCurrentTimeInUserTimezone failed, falling back to UTC",
        {
          userId,
          error: error.message,
          stack: error.stack,
          duration: Date.now() - startTime,
          fallbackUsed: "UTC",
        }
      );

      // Graceful fallback to UTC
      return dayjs().utc();
    }
  }

  /**
   * Get today's date in user's timezone (YYYY-MM-DD format)
   * @param {string} userId - User's Discord ID
   * @returns {Promise<string>} Today's date in user's timezone
   */
  async getTodayInUserTimezone(userId) {
    const userTime = await this.getCurrentTimeInUserTimezone(userId);
    return userTime.format("YYYY-MM-DD");
  }

  /**
   * Batch get user timezones for performance
   * @param {Array<string>} userIds - Array of Discord user IDs
   * @returns {Promise<Object>} Map of userId -> timezone data
   */
  async batchGetUserTimezones(userIds) {
    try {
      if (!userIds || userIds.length === 0) return {};

      // Check cache first
      const cachedResults = {};
      const uncachedUserIds = [];

      for (const userId of userIds) {
        const cached = this.timezoneCache.get(userId);
        if (cached && Date.now() - cached.cachedAt < 3600000) {
          // 1 hour cache
          cachedResults[userId] = cached;
        } else {
          uncachedUserIds.push(userId);
        }
      }

      // Fetch uncached users from database
      if (uncachedUserIds.length > 0) {
        const result = await db.$client.query(
          "SELECT discord_id, timezone, timezone_set_at, last_daily_reset_tz, last_monthly_reset_tz FROM users WHERE discord_id = ANY($1)",
          [uncachedUserIds]
        );

        // Update cache and add to results
        for (const row of result.rows) {
          const timezoneData = {
            timezone: row.timezone || "UTC",
            setAt: row.timezone_set_at,
            lastDailyReset: row.last_daily_reset_tz,
            lastMonthlyReset: row.last_monthly_reset_tz,
            cachedAt: Date.now(),
          };

          this.timezoneCache.set(row.discord_id, timezoneData);
          cachedResults[row.discord_id] = timezoneData;
        }

        // Add UTC default for users not found in database
        for (const userId of uncachedUserIds) {
          if (!cachedResults[userId]) {
            const defaultData = {
              timezone: "UTC",
              setAt: null,
              lastDailyReset: null,
              lastMonthlyReset: null,
              cachedAt: Date.now(),
            };
            this.timezoneCache.set(userId, defaultData);
            cachedResults[userId] = defaultData;
          }
        }
      }

      return cachedResults;
    } catch (error) {
      // Fallback: return UTC for all users
      const fallbackResults = {};
      for (const userId of userIds) {
        fallbackResults[userId] = {
          timezone: "UTC",
          setAt: null,
          lastDailyReset: null,
          lastMonthlyReset: null,
          cachedAt: Date.now(),
        };
      }
      console.warn("Fallback: Could not batch get user timezones", {
        error: error.message,
      });
      return fallbackResults;
    }
  }

  /**
   * Get users in a specific timezone
   * @param {string} timezone - IANA timezone identifier
   * @returns {Promise<Array>} Array of user objects
   */
  async getUsersInTimezone(timezone) {
    try {
      const result = await db.$client.query(
        "SELECT discord_id, username, timezone_set_at, last_daily_reset_tz, last_monthly_reset_tz FROM users WHERE timezone = $1",
        [timezone]
      );

      return result.rows;
    } catch (error) {
      console.warn("Fallback: Could not get users in timezone", {
        timezone,
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Get users who need daily reset (haven't been reset today in their timezone)
   * @returns {Promise<Array>} Array of users needing daily reset
   */
  async getUsersNeedingDailyReset() {
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

  /**
   * Get users who need monthly reset
   * @returns {Promise<Array>} Array of users needing monthly reset
   */
  async getUsersNeedingMonthlyReset() {
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
   * Handle timezone change for a user
   * @param {string} userId - User's Discord ID
   * @param {string} oldTimezone - Previous timezone
   * @param {string} newTimezone - New timezone
   * @returns {Promise<object>} Migration result
   */
  async handleTimezoneChange(userId: string, oldTimezone: string, newTimezone: string) {
    try {
      // Validate new timezone before proceeding
      if (!isValidTimezone(newTimezone)) {
        throw new Error(`Invalid timezone: ${newTimezone}`);
      }

      const now = new Date();

      // Update timezone in database
      const result = await db.update(usersTable).set({
        timezone: newTimezone,
      }).where(eq(usersTable.discord_id, userId));

      if (result.rowCount === 0) {
        throw new Error("User not found");
      }

      // Clear cache
      this.timezoneCache.delete(userId);

      // Check if we need to preserve streak
      const streakAction = await this.evaluateStreakDuringTimezoneChange(
        userId,
        oldTimezone,
        newTimezone,
        now
      );

      return {
        success: true,
        oldTimezone,
        newTimezone,
        streakAction,
        changeTime: now,
        resetTimesChanged: null,
        streakPreserved: null,
        dstAffected: null,
      };
    } catch (error) {
      // For validation errors, throw them directly
      if (error.message.includes("Invalid timezone")) {
        throw error;
      }

      console.warn("Fallback: Could not handle timezone change", {
        userId,
        oldTimezone,
        newTimezone,
        error: error.message,
      });
      return {
        success: false,
        error: "Timezone change failed",
      };
    }
  }

  /**
   * Check if a date is a DST transition day
   * @param {string} timezone - IANA timezone identifier
   * @param {Date|string} date - Date to check
   * @returns {Promise<boolean>} True if DST transition day
   */
  async isDSTTransitionDay(timezone, date) {
    try {
      const checkDate = dayjs(date).tz(timezone);
      const dayBefore = checkDate.subtract(1, "day");
      const dayAfter = checkDate.add(1, "day");

      // Check if UTC offset changes, indicating DST transition
      const offsetBefore = dayBefore.utcOffset();
      const offsetCurrent = checkDate.utcOffset();
      const offsetAfter = dayAfter.utcOffset();

      return offsetBefore !== offsetCurrent || offsetCurrent !== offsetAfter;
    } catch (error) {
      console.warn("Error checking DST transition", {
        timezone,
        date,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Get next reset time for a user (daily or monthly)
   * @param {string} userId - User's Discord ID
   * @param {string} resetType - 'daily' or 'monthly'
   * @returns {Promise<dayjs.Dayjs>} Next reset time in UTC
   */
  async getNextResetTimeForUser(userId, resetType = "daily") {
    const userTimezone = await this.getUserTimezone(userId);
    const userTime = dayjs().tz(userTimezone);

    let nextReset;
    if (resetType === "daily") {
      nextReset = userTime.add(1, "day").startOf("day");

      // Handle DST transitions by checking if we need to adjust
      if (await this.isDSTTransitionDay(userTimezone, nextReset)) {
        // Schedule at 3 AM to avoid 2 AM DST issues
        nextReset = nextReset.hour(3);
      }
    } else if (resetType === "monthly") {
      nextReset = userTime.add(1, "month").startOf("month");

      // Handle month-end edge cases (Feb 29, etc.)
      if (userTime.month() === 1 && userTime.date() === 29) {
        nextReset = nextReset.date(1); // Always use 1st of month
      }
    }

    return nextReset.utc(); // Return in UTC for scheduling
  }

  /**
   * Check if it's currently the user's midnight (within tolerance)
   * @param {string} userId - User's Discord ID
   * @param {number} tolerance - Tolerance in milliseconds (default 60 seconds)
   * @returns {Promise<boolean>} True if within tolerance of user's midnight
   */
  async isUserMidnight(userId, tolerance = 60000) {
    const userTime = await this.getCurrentTimeInUserTimezone(userId);
    const midnight = userTime.startOf("day");
    const nextMidnight = midnight.add(1, "day");

    const now = userTime.valueOf();
    const midnightTime = midnight.valueOf();
    const nextMidnightTime = nextMidnight.valueOf();

    // Check if we're within tolerance of either midnight
    return (
      Math.abs(now - midnightTime) <= tolerance ||
      Math.abs(now - nextMidnightTime) <= tolerance
    );
  }

  /**
   * Convert user's local time to UTC
   * @param {string} userId - User's Discord ID
   * @param {Date|string} localTime - Local time to convert
   * @returns {Promise<dayjs.Dayjs>} UTC time
   */
  async convertUserTimeToUTC(userId, localTime) {
    const userTimezone = await this.getUserTimezone(userId);
    return dayjs.tz(localTime, userTimezone).utc();
  }

  /**
   * Evaluate streak preservation during timezone change
   * @param {string} userId - User's Discord ID
   * @param {string} oldTimezone - Previous timezone
   * @param {string} newTimezone - New timezone
   * @param {Date} changeTime - When the change occurred
   * @returns {Promise<string>} 'preserve' or 'reset'
   */
  async evaluateStreakDuringTimezoneChange(
    userId,
    oldTimezone,
    newTimezone,
    changeTime
  ) {
    try {
      const changeInOldTz = dayjs(changeTime).tz(oldTimezone);
      const changeInNewTz = dayjs(changeTime).tz(newTimezone);

      // Get user's last VC date
      const result = await db.$client.query(
        "SELECT last_vc_date FROM users WHERE discord_id = $1",
        [userId]
      );

      if (!result.rows[0]?.last_vc_date) {
        return "preserve"; // No existing streak to evaluate
      }

      const lastVcDate = dayjs(result.rows[0].last_vc_date);

      // If last VC was today in either timezone, preserve streak
      const isTodayInOldTz = changeInOldTz.isSame(lastVcDate, "day");
      const isTodayInNewTz = changeInNewTz.isSame(lastVcDate, "day");

      if (isTodayInOldTz || isTodayInNewTz) {
        return "preserve";
      }

      return "reset";
    } catch (error) {
      console.warn("Error evaluating streak preservation", {
        userId,
        error: error.message,
      });
      return "preserve"; // Be generous on errors
    }
  }

  /**
   * Update user's last reset timestamp
   * @param {string} userId - User's Discord ID
   * @param {string} resetType - 'daily' or 'monthly'
   * @returns {Promise<boolean>} Success status
   */
  async updateLastResetTime(userId, resetType) {
    try {
      const now = new Date();
      const column =
        resetType === "daily" ? "last_daily_reset_tz" : "last_monthly_reset_tz";

      const result = await db.$client.query(
        `UPDATE users SET ${column} = $1 WHERE discord_id = $2`,
        [now, userId]
      );

      if (result.rowCount === 0) {
        throw new Error("User not found");
      }
      return true;
    } catch (error) {
      console.warn("Could not update reset time", {
        userId,
        resetType,
        error: error.message,
      });
      return false;
    }
  }

}

export default new TimezoneService();
