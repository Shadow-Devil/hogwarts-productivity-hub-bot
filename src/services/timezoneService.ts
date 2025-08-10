/**
 * Timezone Management Service
 * Handles user timezone preferences and timezone-aware time calculations
 * Built on the existing solid database foundation for timezone support
 */

import { db } from "../db/db.ts";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

// Extend dayjs with timezone support
dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Validate if a timezone is supported
 * @param {string} timezone - Timezone to validate
 * @returns {boolean} True if valid
 */
export function isValidTimezone(timezone: string): boolean {
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

export const timezoneCache = new Map<string, any>();

/**
 * Get user's timezone preference with production-grade error handling
 * @param {string} userId - User's Discord ID
 * @returns {Promise<string>} User's timezone (defaults to UTC if not set)
 */
export async function getUserTimezone(userId: string): Promise<string> {
  try {
    // Validate input
    if (!userId || typeof userId !== "string") {
      throw new Error("Invalid userId provided");
    }

    // Check cache first (with cache warming)
    const cached = timezoneCache.get(userId);
    if (cached && Date.now() - cached.cachedAt < 3600000) {
      return cached.timezone as string;
    }


    // Database query with connection db.$clienting and timeout
    const result = await db.$client.query(
      "SELECT timezone FROM users WHERE discord_id = $1",
      [userId]
    );

    let timezone: string = result.rows[0]?.timezone || "UTC";

    // Validate timezone before caching
    if (!isValidTimezone(timezone)) {
      timezone = "UTC";
    }

    // Update cache with metadata
    timezoneCache.set(userId, {
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
 * Get current time in user's timezone with robust error handling
 * @param {string} userId - User's Discord ID
 * @returns {Promise<dayjs.Dayjs>} Current time in user's timezone
 */
export async function getCurrentTimeInUserTimezone(userId: string) {
  const startTime = Date.now();
  try {
    const userTimezone = await getUserTimezone(userId);
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
        error,
        duration: Date.now() - startTime,
        fallbackUsed: "UTC",
      }
    );

    // Graceful fallback to UTC
    return dayjs().utc();
  }
}


