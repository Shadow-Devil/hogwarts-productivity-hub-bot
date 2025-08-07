/**
 * Centralized Time and Points Calculation Utilities
 * Consolidates rounding logic and points calculations
 */

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

// Extend dayjs with timezone support
dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Round hours using the 55-minute rule
 * If minutes >= 55, round up to next hour; otherwise round down
 * @param {number} hours - Hours to round (can be decimal)
 * @returns {number} Rounded hours
 */
function roundHoursFor55MinRule(hours: number): number {
  const minutes = (hours % 1) * 60; // Get the minutes portion
  return minutes >= 55 ? Math.ceil(hours) : Math.floor(hours);
}

/**
 * Format hours for display (consistent formatting across the bot)
 * @param {number|string} hours - Hours to format
 * @returns {string} Formatted hours (e.g., "2.5h")
 */
function formatHours(hours: string): string {
  const numericHours = parseFloat(hours) || 0;
  return `${numericHours.toFixed(1)}h`;
}

/**
 * Convert minutes to hours with proper precision
 * @param {number} minutes - Minutes to convert
 * @returns {number} Hours as decimal
 */
function minutesToHours(minutes: number): number {
  return (minutes || 0) / 60;
}

/**
 * Convert hours to minutes
 * @param {number} hours - Hours to convert
 * @returns {number} Minutes
 */
function hoursToMinutes(hours: number): number {
  return (hours || 0) * 60;
}

/**
 * Calculate session duration in minutes between two dates
 * @param {Date} startTime - Session start time
 * @param {Date} endTime - Session end time (default: now)
 * @returns {number} Duration in minutes
 */
function calculateSessionDuration(
  startTime: Date,
  endTime: Date = new Date()
): number {
  return Math.floor((endTime.getTime() - startTime.getTime()) / (1000 * 60));
}

/**
 * Format time for display in user's timezone
 * @param {Date|string} time - Time to format (UTC)
 * @param {string} userTimezone - User's IANA timezone
 * @param {string} format - Format string (default: 'MMM D, h:mm A')
 * @returns {string} Formatted time in user's timezone
 */
function formatTimeInUserTimezone(
  time: Date | string,
  userTimezone: string,
  format: string = "MMM D, h:mm A"
): string {
  try {
    return dayjs(time).tz(userTimezone).format(format);
  } catch (_error) {
    // Fallback to UTC if timezone conversion fails
    return dayjs(time).utc().format(format) + " UTC";
  }
}

/**
 * Check if two dates are the same day in a specific timezone
 * @param {Date|string} date1 - First date
 * @param {Date|string} date2 - Second date
 * @param {string} userTimezone - IANA timezone identifier
 * @returns {boolean} True if same day in user's timezone
 */
function isSameDayInTimezone(
  date1: Date | string,
  date2: Date | string,
  userTimezone: string
): boolean {
  try {
    const day1 = dayjs(date1).tz(userTimezone);
    const day2 = dayjs(date2).tz(userTimezone);
    return day1.isSame(day2, "day");
  } catch (_error) {
    // Fallback to UTC comparison
    return dayjs(date1).utc().isSame(dayjs(date2).utc(), "day");
  }
}

/**
 * Get current date in user's timezone (YYYY-MM-DD format)
 * @param {string} userTimezone - IANA timezone identifier
 * @returns {string} Current date in user's timezone
 */
function getCurrentDateInTimezone(userTimezone: string): string {
  try {
    return dayjs().tz(userTimezone).format("YYYY-MM-DD");
  } catch (_error) {
    // Fallback to UTC
    return dayjs().utc().format("YYYY-MM-DD");
  }
}

/**
 * Get next midnight in user's timezone
 * @param {string} userTimezone - IANA timezone identifier
 * @returns {dayjs.Dayjs} Next midnight in user's timezone
 */
function getNextMidnightInTimezone(userTimezone: string): dayjs.Dayjs {
  try {
    return dayjs().tz(userTimezone).add(1, "day").startOf("day");
  } catch (_error) {
    // Fallback to UTC
    return dayjs().utc().add(1, "day").startOf("day");
  }
}

/**
 * Calculate time until next reset in user's timezone
 * @param {string} userTimezone - IANA timezone identifier
 * @param {string} resetType - 'daily' or 'monthly'
 * @returns {Object} Hours and formatted string until reset
 */
function getTimeUntilReset(
  userTimezone: string,
  resetType: string = "daily"
): object {
  try {
    const userTime = dayjs().tz(userTimezone);
    let nextReset;

    if (resetType === "daily") {
      nextReset = userTime.add(1, "day").startOf("day");
    } else if (resetType === "monthly") {
      nextReset = userTime.add(1, "month").startOf("month");
    } else {
      throw new Error("Invalid reset type");
    }

    const hoursUntilReset = nextReset.diff(userTime, "hour", true);
    const resetTimeFormatted = nextReset.format("MMM D [at] h:mm A");

    return {
      hours: hoursUntilReset,
      formatted: resetTimeFormatted,
      resetTime: nextReset,
    };
  } catch (_error) {
    // Fallback to UTC calculations
    const utcTime = dayjs().utc();
    const nextReset =
      resetType === "daily"
        ? utcTime.add(1, "day").startOf("day")
        : utcTime.add(1, "month").startOf("month");

    return {
      hours: nextReset.diff(utcTime, "hour", true),
      formatted: nextReset.format("MMM D [at] h:mm A") + " UTC",
      resetTime: nextReset,
    };
  }
}

export {
  roundHoursFor55MinRule,
  formatHours,
  minutesToHours,
  hoursToMinutes,
  calculateSessionDuration,
  formatTimeInUserTimezone,
  isSameDayInTimezone,
  getCurrentDateInTimezone,
  getNextMidnightInTimezone,
  getTimeUntilReset,
};
