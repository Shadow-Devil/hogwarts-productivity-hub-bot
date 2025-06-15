/**
 * Centralized Time and Points Calculation Utilities
 * Consolidates rounding logic and points calculations
 */

/**
 * Round hours using the 55-minute rule
 * If minutes >= 55, round up to next hour; otherwise round down
 * @param {number} hours - Hours to round (can be decimal)
 * @returns {number} Rounded hours
 */
function roundHoursFor55MinRule(hours) {
    const minutes = (hours % 1) * 60; // Get the minutes portion
    return minutes >= 55 ? Math.ceil(hours) : Math.floor(hours);
}

/**
 * Format hours for display (consistent formatting across the bot)
 * @param {number|string} hours - Hours to format
 * @returns {string} Formatted hours (e.g., "2.5h")
 */
function formatHours(hours) {
    const numericHours = parseFloat(hours) || 0;
    return `${numericHours.toFixed(1)}h`;
}

/**
 * Convert minutes to hours with proper precision
 * @param {number} minutes - Minutes to convert
 * @returns {number} Hours as decimal
 */
function minutesToHours(minutes) {
    return (minutes || 0) / 60;
}

/**
 * Convert hours to minutes
 * @param {number} hours - Hours to convert
 * @returns {number} Minutes
 */
function hoursToMinutes(hours) {
    return (hours || 0) * 60;
}

/**
 * Calculate session duration in minutes between two dates
 * @param {Date} startTime - Session start time
 * @param {Date} endTime - Session end time (default: now)
 * @returns {number} Duration in minutes
 */
function calculateSessionDuration(startTime, endTime = new Date()) {
    return Math.floor((endTime - startTime) / (1000 * 60));
}

module.exports = {
    roundHoursFor55MinRule,
    formatHours,
    minutesToHours,
    hoursToMinutes,
    calculateSessionDuration
};
