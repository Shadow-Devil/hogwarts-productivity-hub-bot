/**
 * Timezone Management Service
 * Handles user timezone preferences and timezone-aware time calculations
 * Built on the existing solid database foundation for timezone support
 */

const { pool } = require('../models/db');
const BaseService = require('../utils/baseService');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

// Extend dayjs with timezone support
dayjs.extend(utc);
dayjs.extend(timezone);

class TimezoneService extends BaseService {
    constructor() {
        super('TimezoneService');

        // Simple logger for this service
        this.logger = {
            info: (message, data) => console.log(`[TimezoneService] ${message}`, data || ''),
            warn: (message, data) => console.warn(`[TimezoneService] ${message}`, data || ''),
            error: (message, data) => console.error(`[TimezoneService] ${message}`, data || '')
        };

        // Cache for frequently accessed timezone data
        this.timezoneCache = new Map();
        this.validTimezones = null;

        // Initialize valid timezone list
        this.initializeValidTimezones();
    }

    /**
     * Initialize the list of valid IANA timezone identifiers
     * Uses dayjs.tz.names() which provides comprehensive timezone support
     */
    async initializeValidTimezones() {
        try {
            // Get all available timezone names from dayjs
            // This provides comprehensive IANA timezone support
            this.validTimezones = new Set([
                // Major timezone regions that users commonly need
                'UTC',
                'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
                'America/Toronto', 'America/Vancouver', 'America/Mexico_City', 'America/Sao_Paulo',
                'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Rome', 'Europe/Madrid',
                'Europe/Amsterdam', 'Europe/Brussels', 'Europe/Vienna', 'Europe/Prague',
                'Europe/Stockholm', 'Europe/Oslo', 'Europe/Helsinki', 'Europe/Warsaw',
                'Europe/Budapest', 'Europe/Bucharest', 'Europe/Athens', 'Europe/Istanbul',
                'Europe/Moscow', 'Europe/Kiev', 'Europe/Zurich', 'Europe/Dublin',
                'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Singapore',
                'Asia/Seoul', 'Asia/Bangkok', 'Asia/Manila', 'Asia/Jakarta',
                'Asia/Kolkata', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Tehran',
                'Asia/Baghdad', 'Asia/Jerusalem', 'Asia/Riyadh', 'Asia/Kuwait',
                'Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane',
                'Australia/Perth', 'Australia/Adelaide', 'Australia/Darwin',
                'Pacific/Auckland', 'Pacific/Fiji', 'Pacific/Honolulu',
                'Africa/Cairo', 'Africa/Lagos', 'Africa/Johannesburg', 'Africa/Nairobi',
                'America/Argentina/Buenos_Aires', 'America/Lima', 'America/Santiago'
            ]);

            this.logger.info('Timezone service initialized with supported timezones', {
                timezoneCount: this.validTimezones.size
            });
        } catch (error) {
            this.logger.error('Failed to initialize timezone service', { error: error?.message || String(error) });
            // Fallback to basic timezone support
            this.validTimezones = new Set(['UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo']);
        }
    }

    /**
     * Set user's timezone preference
     * @param {string} userId - User's Discord ID
     * @param {string} timezone - IANA timezone identifier
     * @returns {Promise<boolean>} Success status
     */
    async setUserTimezone(userId, timezone) {
        try {
            // Validate timezone
            if (!this.isValidTimezone(timezone)) {
                throw new Error(`Invalid timezone: ${timezone}`);
            }

            const result = await pool.query(
                `UPDATE users
                 SET timezone = $1, timezone_set_at = CURRENT_TIMESTAMP
                 WHERE discord_id = $2`,
                [timezone, userId]
            );

            if (result.rowCount === 0) {
                throw new Error('User not found');
            }

            // Update cache
            this.timezoneCache.set(userId, {
                timezone,
                setAt: new Date(),
                cachedAt: Date.now()
            });

            this.logger.info('User timezone updated', { userId, timezone });
            return true;

        } catch (error) {
            // Fallback: log error and return false
            this.logger.warn('Fallback: Could not set user timezone', { userId, timezone, error: error.message });
            return false;
        }
    }

    /**
     * Get user's timezone preference
     * @param {string} userId - User's Discord ID
     * @returns {Promise<string>} User's timezone (defaults to UTC if not set)
     */
    async getUserTimezone(userId) {
        try {
            // Check cache first
            const cached = this.timezoneCache.get(userId);
            if (cached && (Date.now() - cached.cachedAt) < 3600000) { // 1 hour cache
                return cached.timezone;
            }

            const result = await pool.query(
                'SELECT timezone FROM users WHERE discord_id = $1',
                [userId]
            );

            const timezone = result.rows[0]?.timezone || 'UTC';

            // Update cache
            this.timezoneCache.set(userId, {
                timezone,
                setAt: new Date(),
                cachedAt: Date.now()
            });

            return timezone;

        } catch (error) {
            // Fallback: return UTC
            this.logger.warn('Fallback: Returning UTC for user timezone', { userId, error: error.message });
            return 'UTC';
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
     * Get current time in user's timezone
     * @param {string} userId - User's Discord ID
     * @returns {Promise<dayjs.Dayjs>} Current time in user's timezone
     */
    async getCurrentTimeInUserTimezone(userId) {
        const userTimezone = await this.getUserTimezone(userId);
        return dayjs().tz(userTimezone);
    }

    /**
     * Get today's date in user's timezone (YYYY-MM-DD format)
     * @param {string} userId - User's Discord ID
     * @returns {Promise<string>} Today's date in user's timezone
     */
    async getTodayInUserTimezone(userId) {
        const userTime = await this.getCurrentTimeInUserTimezone(userId);
        return userTime.format('YYYY-MM-DD');
    }

    /**
     * Get next midnight in user's timezone
     * @param {string} userId - User's Discord ID
     * @returns {Promise<dayjs.Dayjs>} Next midnight in user's timezone
     */
    async getNextMidnightInUserTimezone(userId) {
        const userTime = await this.getCurrentTimeInUserTimezone(userId);
        return userTime.add(1, 'day').startOf('day');
    }

    /**
     * Check if it's currently within reset window (11 PM - 1 AM) in user's timezone
     * @param {string} userId - User's Discord ID
     * @returns {Promise<boolean>} True if in reset window
     */
    async isInResetWindow(userId) {
        const userTime = await this.getCurrentTimeInUserTimezone(userId);
        const hour = userTime.hour();

        // Reset window: 11 PM (23) to 1 AM (1)
        return hour >= 23 || hour <= 1;
    }

    /**
     * Get users who are currently in their reset window
     * @param {string} timezone - Specific timezone to check (optional)
     * @returns {Promise<Array>} Array of user IDs in reset window
     */
    async getUsersInResetWindow(timezone = null) {
        try {
            let query;
            let params;

            if (timezone) {
                // Get users in specific timezone who are in reset window
                query = `
                    SELECT discord_id, timezone
                    FROM users
                    WHERE timezone = $1
                      AND timezone IS NOT NULL
                `;
                params = [timezone];
            } else {
                // Get all users currently in their reset window (11 PM - 1 AM local time)
                query = `
                    SELECT discord_id, timezone
                    FROM users
                    WHERE timezone IS NOT NULL
                `;
                params = [];
            }

            const result = await pool.query(query, params);
            
            // Filter users who are actually in reset window (11 PM - 1 AM local time)
            const usersInResetWindow = [];
            for (const user of result.rows) {
                const userTime = dayjs().tz(user.timezone);
                const hour = userTime.hour();
                if (hour >= 23 || hour <= 1) {
                    usersInResetWindow.push(user);
                }
            }
            
            return usersInResetWindow;

        } catch (error) {
            // Fallback: return empty array
            this.logger.warn('Fallback: Could not get users in reset window', { error: error.message });
            return [];
        }
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
                if (cached && (Date.now() - cached.cachedAt) < 3600000) { // 1 hour cache
                    cachedResults[userId] = cached;
                } else {
                    uncachedUserIds.push(userId);
                }
            }

            // Fetch uncached users from database
            if (uncachedUserIds.length > 0) {
                const result = await pool.query(
                    'SELECT discord_id, timezone, timezone_set_at, last_daily_reset_tz, last_monthly_reset_tz FROM users WHERE discord_id = ANY($1)',
                    [uncachedUserIds]
                );

                // Update cache and add to results
                for (const row of result.rows) {
                    const timezoneData = {
                        timezone: row.timezone || 'UTC',
                        setAt: row.timezone_set_at,
                        lastDailyReset: row.last_daily_reset_tz,
                        lastMonthlyReset: row.last_monthly_reset_tz,
                        cachedAt: Date.now()
                    };
                    
                    this.timezoneCache.set(row.discord_id, timezoneData);
                    cachedResults[row.discord_id] = timezoneData;
                }

                // Add UTC default for users not found in database
                for (const userId of uncachedUserIds) {
                    if (!cachedResults[userId]) {
                        const defaultData = {
                            timezone: 'UTC',
                            setAt: null,
                            lastDailyReset: null,
                            lastMonthlyReset: null,
                            cachedAt: Date.now()
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
                    timezone: 'UTC',
                    setAt: null,
                    lastDailyReset: null,
                    lastMonthlyReset: null,
                    cachedAt: Date.now()
                };
            }
            this.logger.warn('Fallback: Could not batch get user timezones', { error: error.message });
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
            const result = await pool.query(
                'SELECT discord_id, username, timezone_set_at, last_daily_reset_tz, last_monthly_reset_tz FROM users WHERE timezone = $1',
                [timezone]
            );

            return result.rows;

        } catch (error) {
            this.logger.warn('Fallback: Could not get users in timezone', { timezone, error: error.message });
            return [];
        }
    }

    /**
     * Get users who need daily reset (haven't been reset today in their timezone)
     * @returns {Promise<Array>} Array of users needing daily reset
     */
    async getUsersNeedingDailyReset() {
        try {
            const result = await pool.query(`
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
                const lastReset = user.last_daily_reset_tz ? dayjs(user.last_daily_reset_tz).tz(user.timezone) : null;
                
                // If no last reset, or last reset was yesterday or earlier in user's timezone
                if (!lastReset || !userTime.isSame(lastReset, 'day')) {
                    usersNeedingReset.push(user);
                }
            }

            return usersNeedingReset;

        } catch (error) {
            this.logger.warn('Fallback: Could not get users needing daily reset', { error: error.message });
            return [];
        }
    }

    /**
     * Get users who need monthly reset
     * @returns {Promise<Array>} Array of users needing monthly reset
     */
    async getUsersNeedingMonthlyReset() {
        try {
            const result = await pool.query(`
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
                const lastReset = user.last_monthly_reset_tz ? dayjs(user.last_monthly_reset_tz).tz(user.timezone) : null;
                
                // If no last reset, or last reset was in a previous month in user's timezone
                if (!lastReset || !userTime.isSame(lastReset, 'month')) {
                    usersNeedingReset.push(user);
                }
            }

            return usersNeedingReset;

        } catch (error) {
            this.logger.warn('Fallback: Could not get users needing monthly reset', { error: error.message });
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
    async handleTimezoneChange(userId, oldTimezone, newTimezone) {
        try {
            const now = new Date();
            
            // Update timezone in database
            const result = await pool.query(
                `UPDATE users 
                 SET timezone = $1, timezone_set_at = $2 
                 WHERE discord_id = $3`,
                [newTimezone, now, userId]
            );

            if (result.rowCount === 0) {
                throw new Error('User not found');
            }

            // Clear cache
            this.timezoneCache.delete(userId);

            // Check if we need to preserve streak
            const streakAction = await this.evaluateStreakDuringTimezoneChange(userId, oldTimezone, newTimezone, now);

            this.logger.info('User timezone changed', {
                userId, oldTimezone, newTimezone, streakAction,
                changeTime: now.toISOString()
            });

            return {
                success: true,
                oldTimezone,
                newTimezone,
                streakAction,
                changeTime: now
            };

        } catch (error) {
            this.logger.warn('Fallback: Could not handle timezone change', { userId, oldTimezone, newTimezone, error: error.message });
            return {
                success: false,
                error: 'Timezone change failed'
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
            const dayBefore = checkDate.subtract(1, 'day');
            const dayAfter = checkDate.add(1, 'day');

            // Check if UTC offset changes, indicating DST transition
            const offsetBefore = dayBefore.utcOffset();
            const offsetCurrent = checkDate.utcOffset();
            const offsetAfter = dayAfter.utcOffset();

            return offsetBefore !== offsetCurrent || offsetCurrent !== offsetAfter;

        } catch (error) {
            this.logger.warn('Error checking DST transition', { timezone, date, error: error.message });
            return false;
        }
    }

    /**
     * Get next reset time for a user (daily or monthly)
     * @param {string} userId - User's Discord ID
     * @param {string} resetType - 'daily' or 'monthly'
     * @returns {Promise<dayjs.Dayjs>} Next reset time in UTC
     */
    async getNextResetTimeForUser(userId, resetType = 'daily') {
        const userTimezone = await this.getUserTimezone(userId);
        const userTime = dayjs().tz(userTimezone);
        
        let nextReset;
        if (resetType === 'daily') {
            nextReset = userTime.add(1, 'day').startOf('day');
            
            // Handle DST transitions by checking if we need to adjust
            if (await this.isDSTTransitionDay(userTimezone, nextReset)) {
                // Schedule at 3 AM to avoid 2 AM DST issues
                nextReset = nextReset.hour(3);
            }
        } else if (resetType === 'monthly') {
            nextReset = userTime.add(1, 'month').startOf('month');
            
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
        const midnight = userTime.startOf('day');
        const nextMidnight = midnight.add(1, 'day');
        
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
    async evaluateStreakDuringTimezoneChange(userId, oldTimezone, newTimezone, changeTime) {
        try {
            const changeInOldTz = dayjs(changeTime).tz(oldTimezone);
            const changeInNewTz = dayjs(changeTime).tz(newTimezone);
            
            // Get user's last VC date
            const result = await pool.query(
                'SELECT last_vc_date FROM users WHERE discord_id = $1',
                [userId]
            );
            
            if (!result.rows[0]?.last_vc_date) {
                return 'preserve'; // No existing streak to evaluate
            }
            
            const lastVcDate = dayjs(result.rows[0].last_vc_date);
            
            // If last VC was today in either timezone, preserve streak
            const isTodayInOldTz = changeInOldTz.isSame(lastVcDate, 'day');
            const isTodayInNewTz = changeInNewTz.isSame(lastVcDate, 'day');
            
            if (isTodayInOldTz || isTodayInNewTz) {
                this.logger.info('Streak preserved during timezone change', {
                    userId, oldTimezone, newTimezone, changeTime,
                    preservationReason: isTodayInOldTz ? 'same_day_old_tz' : 'same_day_new_tz'
                });
                return 'preserve';
            }
            
            return 'reset';
            
        } catch (error) {
            this.logger.warn('Error evaluating streak preservation', { userId, error: error.message });
            return 'preserve'; // Be generous on errors
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
            const column = resetType === 'daily' ? 'last_daily_reset_tz' : 'last_monthly_reset_tz';
            
            const result = await pool.query(
                `UPDATE users SET ${column} = $1 WHERE discord_id = $2`,
                [now, userId]
            );

            if (result.rowCount > 0) {
                // Clear cache to force refresh
                this.timezoneCache.delete(userId);
                return true;
            }
            
            return false;

        } catch (error) {
            this.logger.warn('Fallback: Could not update last reset time', { userId, resetType, error: error.message });
            return false;
        }
    }

    /**
     * Validate if a timezone is supported
     * @param {string} timezone - Timezone to validate
     * @returns {boolean} True if valid
     */
    isValidTimezone(timezone) {
        if (!this.validTimezones) {
            // Fallback validation using dayjs
            try {
                dayjs().tz(timezone);
                return true;
            } catch {
                return false;
            }
        }

        return this.validTimezones.has(timezone);
    }

    /**
     * Get list of commonly used timezones for user selection
     * @returns {Array<object>} Array of timezone objects with name and display
     */
    getCommonTimezones() {
        return [
            { value: 'UTC', label: 'UTC - Coordinated Universal Time', offset: '+00:00' },
            { value: 'America/New_York', label: 'Eastern Time (US & Canada)', offset: dayjs().tz('America/New_York').format('Z') },
            { value: 'America/Chicago', label: 'Central Time (US & Canada)', offset: dayjs().tz('America/Chicago').format('Z') },
            { value: 'America/Denver', label: 'Mountain Time (US & Canada)', offset: dayjs().tz('America/Denver').format('Z') },
            { value: 'America/Los_Angeles', label: 'Pacific Time (US & Canada)', offset: dayjs().tz('America/Los_Angeles').format('Z') },
            { value: 'Europe/London', label: 'London, Dublin, Edinburgh', offset: dayjs().tz('Europe/London').format('Z') },
            { value: 'Europe/Paris', label: 'Paris, Berlin, Rome, Madrid', offset: dayjs().tz('Europe/Paris').format('Z') },
            { value: 'Asia/Tokyo', label: 'Tokyo, Osaka, Sapporo', offset: dayjs().tz('Asia/Tokyo').format('Z') },
            { value: 'Asia/Shanghai', label: 'Beijing, Shanghai, Hong Kong', offset: dayjs().tz('Asia/Shanghai').format('Z') },
            { value: 'Australia/Sydney', label: 'Sydney, Melbourne, Canberra', offset: dayjs().tz('Australia/Sydney').format('Z') }
        ];
    }

    /**
     * Format time for display in user's timezone
     * @param {string} userId - User's Discord ID
     * @param {Date|string} time - Time to format
     * @param {string} format - dayjs format string
     * @returns {Promise<string>} Formatted time string
     */
    async formatTimeForUser(userId, time, format = 'YYYY-MM-DD HH:mm:ss z') {
        const userTime = await this.convertToUserTime(userId, time);
        return userTime.format(format);
    }

    /**
     * Clear timezone cache for a user
     * @param {string} userId - User's Discord ID
     */
    clearUserCache(userId) {
        this.timezoneCache.delete(userId);
    }

    /**
     * Get timezone statistics for debugging
     * @returns {object} Timezone usage statistics
     */
    async getTimezoneStats() {
        try {
            const result = await pool.query(`
                SELECT
                    timezone,
                    COUNT(*) as user_count,
                    COUNT(*) FILTER (WHERE last_activity_date >= CURRENT_DATE) as active_today
                FROM users
                WHERE is_active = true
                GROUP BY timezone
                ORDER BY user_count DESC
            `);

            return {
                timezones: result.rows,
                totalUsers: result.rows.reduce((sum, row) => sum + parseInt(row.user_count), 0),
                cacheSize: this.timezoneCache.size
            };

        } catch (error) {
            this.logger.warn('Fallback: Could not get timezone stats', { error: error.message });
            return {
                timezones: [],
                totalUsers: 0,
                cacheSize: this.timezoneCache.size
            };
        }
    }
}

// Export singleton instance
module.exports = new TimezoneService();
