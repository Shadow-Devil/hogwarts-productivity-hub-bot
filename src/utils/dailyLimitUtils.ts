/**
 * Centralized Daily Limit Calculation Utilities
 * Consolidates all daily limit logic to prevent duplication and bugs
 */

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

// Extend dayjs with timezone support
dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Calculate daily limit information for a user
 * @param {number} dailyHours - Current hours spent today
 * @param {number} dailyLimitHours - Daily limit (default 15)
 * @param {string} userTimezone - User's timezone (IANA identifier, e.g., 'America/New_York')
 * @returns {Object} Daily limit information
 */
function calculateDailyLimitInfo(
  dailyHours: number,
  dailyLimitHours: number = 15,
  userTimezone: string = null
): object {
  // Calculate hours remaining in the daily allowance
  const allowanceHoursRemaining = Math.max(0, dailyLimitHours - dailyHours);

  // Calculate hours remaining until midnight (when daily limit resets)
  // CRITICAL FIX: Use user's timezone for accurate midnight calculation
  const now = userTimezone ? dayjs().tz(userTimezone) : dayjs();
  const endOfDay = userTimezone
    ? dayjs().tz(userTimezone).endOf("day")
    : dayjs().endOf("day");
  const hoursUntilMidnight = endOfDay.diff(now, "hour", true); // true for decimal precision

  // CRITICAL FIX: The actual remaining hours is the MINIMUM of:
  // 1. Hours left in daily allowance (15 - current hours used)
  // 2. Hours until midnight reset (when a fresh 15 hours becomes available)
  const remainingHours = Math.max(
    0,
    Math.min(allowanceHoursRemaining, hoursUntilMidnight)
  );

  return {
    dailyHours,
    allowanceHoursRemaining,
    hoursUntilMidnight,
    remainingHours,
    limitReached: dailyHours >= dailyLimitHours,
    canEarnPoints: dailyHours < dailyLimitHours,
    isLimitedByAllowance: allowanceHoursRemaining <= hoursUntilMidnight,
    isLimitedByTime: hoursUntilMidnight < allowanceHoursRemaining,
  };
}

/**
 * Generate daily limit status text for display
 * @param {Object} limitInfo - Daily limit info from calculateDailyLimitInfo
 * @returns {string} Formatted status text
 */
function formatDailyLimitStatus(limitInfo) {
  if (limitInfo.limitReached) {
    return "🚫 **Limit Reached**";
  }

  if (limitInfo.isLimitedByAllowance) {
    // Limited by 15-hour daily allowance
    return `✅ **${limitInfo.remainingHours.toFixed(1)}h** remaining (${limitInfo.allowanceHoursRemaining.toFixed(1)}h allowance left)`;
  } else {
    // Limited by time until midnight reset
    return `⏰ **${limitInfo.remainingHours.toFixed(1)}h** until reset (resets at midnight)`;
  }
}

/**
 * Generate daily limit messages for user notifications
 * @param {Object} limitInfo - Daily limit info from calculateDailyLimitInfo
 * @param {number} actualSessionHours - Hours spent in this session
 * @param {number} voiceTimePoints - Points earned from voice time
 * @returns {string|null} Limit message or null if no message needed
 */
function generateDailyLimitMessage(
  limitInfo,
  actualSessionHours,
  voiceTimePoints,
) {
  if (!limitInfo.limitReached) {
    return null; // No limit reached, no message needed
  }

  const totalDailyHours = limitInfo.dailyHours;

  if (totalDailyHours - actualSessionHours >= 15) {
    // User was already at limit before this session
    return `🚫 **Daily Voice Time Limit Reached!**\n\nYou've already earned points for 15 hours of voice time today. Hours are still recorded, but no points awarded.\n\n**Today's Voice Time:** ${totalDailyHours.toFixed(1)} hours • **Limit:** 15.0 hours per day for points`;
  } else {
    // User exceeded limit during this session (proportional points)
    return `⚠️ **Daily Voice Time Limit Reached!**\n\nPoints awarded proportionally for time within the 15-hour daily limit. All hours are recorded.\n\n**Today's Voice Time:** ${totalDailyHours.toFixed(1)} hours • **Points Earned:** ${voiceTimePoints} • **Limit:** 15.0 hours per day for points`;
  }
}

export {
  calculateDailyLimitInfo,
  formatDailyLimitStatus,
  generateDailyLimitMessage,
};
