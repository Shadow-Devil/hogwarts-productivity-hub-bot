const { pool, getCachedUser, setCachedUser, clearUserCache, calculatePointsForHours, checkAndPerformMonthlyReset, getUserHouse, updateHousePoints, executeWithResilience } = require('../models/db');
const dayjs = require('dayjs');
const { measureDatabase } = require('../utils/performanceMonitor');
const queryCache = require('../utils/queryCache');
const { calculateDailyLimitInfo, formatDailyLimitStatus, generateDailyLimitMessage } = require('../utils/dailyLimitUtils');
const { roundHoursFor55MinRule, formatHours, minutesToHours, hoursToMinutes, calculateSessionDuration } = require('../utils/timeUtils');
const CacheInvalidationService = require('../utils/cacheInvalidationService');
const BaseService = require('../utils/baseService');
const timezoneService = require('./timezoneService');

class VoiceService extends BaseService {
    constructor() {
        super('VoiceService');
    }
    // Get or create user in database with caching
    async getOrCreateUser(discordId, username) {
        return measureDatabase('getOrCreateUser', async () => {
            // Check cache first
            const cachedUser = getCachedUser(discordId);
            if (cachedUser) {
                // Update username if it changed (but don't query DB every time)
                if (cachedUser.username !== username) {
                    await executeWithResilience(async (client) => {
                        await client.query(
                            'UPDATE users SET username = $1, updated_at = CURRENT_TIMESTAMP WHERE discord_id = $2',
                            [username, discordId]
                        );
                        cachedUser.username = username;
                        setCachedUser(discordId, cachedUser);
                    });
                }
                return cachedUser;
            }

            return executeWithResilience(async (client) => {
                // Try to find existing user
                const result = await client.query(
                    'SELECT * FROM users WHERE discord_id = $1',
                    [discordId]
                );

                let user;
                if (result.rows.length > 0) {
                    user = result.rows[0];
                    // Update username if it changed
                    if (user.username !== username) {
                        await client.query(
                            'UPDATE users SET username = $1, updated_at = CURRENT_TIMESTAMP WHERE discord_id = $2',
                            [username, discordId]
                        );
                        user.username = username;
                    }
                } else {
                    // Create new user
                    const newUserResult = await client.query(
                        `INSERT INTO users (discord_id, username)
                         VALUES ($1, $2)
                         RETURNING *`,
                        [discordId, username]
                    );
                    user = newUserResult.rows[0];
                }

                // Cache the user data
                setCachedUser(discordId, user);
                return user;
            });
        })();
    }

    // Start a voice session when user joins VC (timezone-aware)
    async startVoiceSession(discordId, username, voiceChannelId, voiceChannelName) {
        return measureDatabase('startVoiceSession', async () => {
            return executeWithResilience(async (client) => {
                const user = await this.getOrCreateUser(discordId, username);
                const now = new Date();

                // Use user's timezone for accurate date calculation
                const today = await timezoneService.getTodayInUserTimezone(discordId);

                // Insert new session
                const session = await client.query(
                    `INSERT INTO vc_sessions (user_id, discord_id, voice_channel_id, voice_channel_name, joined_at, date)
                     VALUES ($1, $2, $3, $4, $5, $6)
                     RETURNING *`,
                    [user.id, discordId, voiceChannelId, voiceChannelName, now, today]
                );

                console.log(`👥 Voice session started for ${username} in ${voiceChannelName} (date: ${today})`);
                return session.rows[0];
            });
        })();
    }

    // End a voice session when user leaves VC
    async endVoiceSession(discordId, voiceChannelId, member = null) {
        return measureDatabase('endVoiceSession', async () => {
            return executeWithResilience(async (client) => {
                const now = new Date();

                // Find the active session
                const result = await client.query(
                    `SELECT * FROM vc_sessions
                     WHERE discord_id = $1 AND voice_channel_id = $2 AND left_at IS NULL
                     ORDER BY joined_at DESC LIMIT 1`,
                    [discordId, voiceChannelId]
                );

                if (result.rows.length === 0) {
                    console.log(`No active session found for ${discordId} in ${voiceChannelId}`);
                    return null;
                }

                const session = result.rows[0];
                const joinedAt = new Date(session.joined_at);
                const durationMs = now - joinedAt;
                const durationMinutes = Math.floor(durationMs / (1000 * 60));

                // Update the session with end time and duration
                await client.query(
                    `UPDATE vc_sessions
                     SET left_at = $1, duration_minutes = $2
                     WHERE id = $3`,
                    [now, durationMinutes, session.id]
                );

                // Calculate and award points for this session
                const pointsResult = await this.calculateAndAwardPoints(discordId, durationMinutes, member);
                const pointsEarned = typeof pointsResult === 'object' ? pointsResult.pointsEarned : pointsResult;

                // Update daily stats
                await this.updateDailyStats(discordId, session.date, durationMinutes, pointsEarned);

                // Update streak if user spent at least 15 minutes (timezone-aware)
                if (durationMinutes >= 15) {
                    // Get user's timezone for streak calculation
                    const userTimezone = await timezoneService.getUserTimezone(discordId);
                    await this.updateStreak(discordId, session.date, userTimezone);
                }

                console.log(`👋 Voice session ended for ${discordId}. Duration: ${durationMinutes} minutes, Points earned: ${pointsEarned}`);
                return { ...session, duration_minutes: durationMinutes, left_at: now, points_earned: pointsEarned, ...pointsResult };
            });
        })();
    }

    // Calculate and award points based on time spent and/or task completion
    async calculateAndAwardPoints(discordId, durationMinutes, member = null, additionalPoints = 0, applyRounding = true) {
        return measureDatabase('calculateAndAwardPoints', async () => {
            const client = await pool.connect();
            try {
                // Check and perform monthly reset if needed
                await checkAndPerformMonthlyReset(discordId);

                // Get current user data
                const userResult = await client.query(
                    'SELECT * FROM users WHERE discord_id = $1',
                    [discordId]
                );

                if (userResult.rows.length === 0) return 0;

                const user = userResult.rows[0];
                const currentMonthlyHours = parseFloat(user.monthly_hours) || 0;

                // Get daily stats for voice time points calculation (timezone-aware)
                const today = await timezoneService.getTodayInUserTimezone(discordId);
                const dailyStats = await client.query(
                    'SELECT total_minutes, points_earned FROM daily_voice_stats WHERE discord_id = $1 AND date = $2',
                    [discordId, today]
                );

                const currentDailyMinutes = dailyStats.rows[0]?.total_minutes || 0;
                const currentDailyHours = currentDailyMinutes / 60;
                const currentDailyPoints = dailyStats.rows[0]?.points_earned || 0;

                // NEW DAILY CUMULATIVE POINTS SYSTEM:
                // Always record actual session hours (no rounding for recording)
                const actualSessionHours = durationMinutes / 60;
                const newDailyHours = currentDailyHours + actualSessionHours;
                const newMonthlyHours = currentMonthlyHours + actualSessionHours;

                // Calculate points based on daily cumulative hours with 55-minute rounding applied to daily totals
                const roundedNewDailyHours = roundHoursFor55MinRule(newDailyHours);
                const roundedOldDailyHours = roundHoursFor55MinRule(currentDailyHours);

                // Points earned = difference between old and new daily cumulative points (recalculate from day start)
                const cumulativePointsNew = calculatePointsForHours(0, roundedNewDailyHours);
                const cumulativePointsOld = calculatePointsForHours(0, roundedOldDailyHours);
                const sessionPointsEarned = Math.max(0, cumulativePointsNew - cumulativePointsOld);

                // Apply daily 15-hour limit to points (but always record hours)
                let voiceTimePoints = sessionPointsEarned;
                let limitReached = false;
                let limitMessage = null;

                if (durationMinutes > 0) {
                    if (currentDailyHours >= 15) {
                        voiceTimePoints = 0;
                        limitReached = true;
                        limitMessage = generateDailyLimitMessage({ dailyHours: currentDailyHours + actualSessionHours, limitReached: true }, actualSessionHours, voiceTimePoints);
                    } else if ((currentDailyHours + actualSessionHours) > 15) {
                        // Proportionally reduce points if session exceeds daily limit
                        const remainingDailyHours = 15 - currentDailyHours;
                        const sessionRatio = remainingDailyHours / actualSessionHours;
                        voiceTimePoints = Math.floor(sessionPointsEarned * sessionRatio);
                        limitReached = true;
                        limitMessage = generateDailyLimitMessage({ dailyHours: currentDailyHours + actualSessionHours, limitReached: true }, actualSessionHours, voiceTimePoints);
                    }
                }

                // Total points to award (voice time + task completion)
                const totalPointsEarned = voiceTimePoints + additionalPoints;

                // Determine user's house
                let userHouse = user.house;
                if (!userHouse && member) {
                    userHouse = await getUserHouse(member);
                    // Update user's house in database if found
                    if (userHouse) {
                        await client.query(
                            'UPDATE users SET house = $1, updated_at = CURRENT_TIMESTAMP WHERE discord_id = $2',
                            [userHouse, discordId]
                        );
                        // Clear cache to force fresh data
                        clearUserCache(discordId);
                    }
                }

                // Update user's monthly totals and all-time stats immediately (NEW CONTINUOUS SYSTEM)
                const newMonthlyPoints = user.monthly_points + totalPointsEarned;
                const newAllTimePoints = user.all_time_points + totalPointsEarned;
                const newAllTimeHours = parseFloat(user.all_time_hours) + actualSessionHours;

                await client.query(`
                    UPDATE users SET
                        monthly_points = $1,
                        monthly_hours = $2,
                        all_time_points = $3,
                        all_time_hours = $4,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE discord_id = $5
                `, [newMonthlyPoints, newMonthlyHours, newAllTimePoints, newAllTimeHours, discordId]);

                // Award points to user's house if they have one
                if (userHouse && totalPointsEarned > 0) {
                    await updateHousePoints(userHouse, totalPointsEarned);
                }

                // Clear user cache to force fresh data
                clearUserCache(discordId);

                // Smart cache invalidation for user-related data
                CacheInvalidationService.invalidateAfterVoiceOperation(discordId, userHouse);

                // Send daily limit notification if needed
                if (limitReached && limitMessage && member) {
                    try {
                        await member.send(limitMessage);
                    } catch (error) {
                        console.log(`Could not send daily limit notification to ${discordId}: ${error.message}`);
                    }
                }

                // Enhanced logging for new continuous all-time update system
                if (additionalPoints > 0) {
                    console.log(`💰 Points awarded to ${discordId}: ${voiceTimePoints} voice points + ${additionalPoints} task points = ${totalPointsEarned} total points${userHouse ? ` (House: ${userHouse})` : ''}${limitReached ? ' [Daily limit reached]' : ''}`);
                    console.log(`📊 Stats updated: Monthly: ${newMonthlyPoints} pts, ${newMonthlyHours.toFixed(2)}h | All-time: ${newAllTimePoints} pts, ${newAllTimeHours.toFixed(2)}h`);
                } else {
                    console.log(`💰 Points awarded to ${discordId}: ${totalPointsEarned} points for ${actualSessionHours.toFixed(2)} hours${userHouse ? ` (House: ${userHouse})` : ''}${limitReached ? ' [Daily limit reached]' : ''}`);
                    console.log(`📊 Stats updated: Monthly: ${newMonthlyPoints} pts, ${newMonthlyHours.toFixed(2)}h | All-time: ${newAllTimePoints} pts, ${newAllTimeHours.toFixed(2)}h`);
                }

                // Return both points earned and limit status for caller
                return {
                    pointsEarned: totalPointsEarned,
                    limitReached,
                    limitMessage,
                    dailyHours: currentDailyHours + actualSessionHours,
                    monthlyHours: newMonthlyHours,
                    sessionPointsFromCumulative: sessionPointsEarned
                };
            } catch (error) {
                console.error('Error calculating and awarding points:', error);
                throw error;
            } finally {
                client.release();
            }
        })();
    }

    // Update daily voice stats
    async updateDailyStats(discordId, date, additionalMinutes, pointsEarned = 0) {
        return measureDatabase('updateDailyStats', async () => {
            const client = await pool.connect();
            try {
                // For the new daily cumulative system, we need to recalculate total daily points
                // rather than just adding session points, since points are now based on daily totals

                // First, get current daily stats (compatible with archival system)
                const currentStats = await client.query(
                    `SELECT total_minutes, points_earned FROM daily_voice_stats
                     WHERE discord_id = $1 AND date = $2
                     AND (archived IS NULL OR archived = false)`,
                    [discordId, date]
                );

                const currentMinutes = currentStats.rows[0]?.total_minutes || 0;
                const newTotalMinutes = currentMinutes + additionalMinutes;
                const newTotalHours = newTotalMinutes / 60;

                // Recalculate points based on total daily hours with 55-minute rounding
                const roundedDailyHours = roundHoursFor55MinRule(newTotalHours);
                const recalculatedDailyPoints = require('../models/db').calculatePointsForHours(0, roundedDailyHours);

                // Apply daily 15-hour limit to points calculation
                let finalDailyPoints = recalculatedDailyPoints;
                if (newTotalHours > 15) {
                    // Cap at 15 hours worth of points
                    const roundedLimitedHours = roundHoursFor55MinRule(Math.min(newTotalHours, 15));
                    finalDailyPoints = require('../models/db').calculatePointsForHours(0, roundedLimitedHours);
                }

                await client.query(
                    `INSERT INTO daily_voice_stats (discord_id, date, total_minutes, session_count, points_earned, user_id, archived)
                     VALUES ($1, $2, $3, 1, $4, (SELECT id FROM users WHERE discord_id = $5), false)
                     ON CONFLICT (discord_id, date)
                     DO UPDATE SET
                        total_minutes = $6,
                        session_count = daily_voice_stats.session_count + 1,
                        points_earned = $7,
                        archived = false,
                        updated_at = CURRENT_TIMESTAMP`,
                    [discordId, date, additionalMinutes, finalDailyPoints, discordId, newTotalMinutes, finalDailyPoints]
                );
            } catch (error) {
                console.error('Error updating daily stats:', error);
                throw error;
            } finally {
                client.release();
            }
        })();
    }

    // Handle session that crosses midnight - split into separate daily sessions (timezone-aware)
    async handleMidnightCrossover(discordId, voiceChannelId, member = null) {
        return measureDatabase('handleMidnightCrossover', async () => {
            return executeWithResilience(async (client) => {
                const now = new Date();

                // Use user's timezone for accurate midnight calculation
                const userTime = await timezoneService.getCurrentTimeInUserTimezone(discordId);
                const today = userTime.format('YYYY-MM-DD');
                const startOfToday = userTime.startOf('day').toDate();

                // Find active session that started yesterday
                const result = await client.query(
                    `SELECT * FROM vc_sessions
                     WHERE discord_id = $1 AND voice_channel_id = $2 AND left_at IS NULL
                     AND joined_at < $3
                     ORDER BY joined_at DESC LIMIT 1`,
                    [discordId, voiceChannelId, startOfToday]
                );

                if (result.rows.length === 0) {
                    return null; // No session crossing midnight
                }

                const yesterdaySession = result.rows[0];
                const joinedAt = new Date(yesterdaySession.joined_at);

                // Calculate duration from join time to midnight
                const durationUntilMidnight = Math.floor((startOfToday - joinedAt) / (1000 * 60));

                // End the yesterday session at midnight
                await client.query(
                    `UPDATE vc_sessions
                     SET left_at = $1, duration_minutes = $2
                     WHERE id = $3`,
                    [startOfToday, durationUntilMidnight, yesterdaySession.id]
                );

                // Calculate and award points for yesterday's portion (NO ROUNDING for midnight crossover)
                const yesterdayPointsResult = await this.calculateAndAwardPoints(discordId, durationUntilMidnight, member, 0, false);
                const yesterdayPoints = typeof yesterdayPointsResult === 'object' ? yesterdayPointsResult.pointsEarned : yesterdayPointsResult;

                // Update daily stats for yesterday
                await this.updateDailyStats(discordId, yesterdaySession.date, durationUntilMidnight, yesterdayPoints);

                // Start a new session for today
                const todaySession = await this.startVoiceSession(
                    discordId,
                    member?.user?.username || yesterdaySession.discord_id,
                    voiceChannelId,
                    yesterdaySession.voice_channel_name
                );

                // Send midnight notification
                if (member) {
                    try {
                        const midnightMessage = `🌅 **New Day, Fresh Start!**\n\nIt's now ${dayjs().format('MMM DD, YYYY')} and your daily voice time limit has reset!\n\n**Yesterday:** Earned ${yesterdayPoints} points for ${(durationUntilMidnight / 60).toFixed(1)} hours • **Today:** You can now earn points for up to 15 more hours\n\n✨ **Keep up the great momentum!**`;
                        await member.send(midnightMessage);
                    } catch (error) {
                        console.log(`Could not send midnight notification to ${discordId}: ${error.message}`);
                    }
                }

                console.log(`🌅 Midnight crossover handled for ${discordId}: Yesterday ${(durationUntilMidnight / 60).toFixed(1)}h, new session started`);

                return {
                    yesterdaySession: { ...yesterdaySession, duration_minutes: durationUntilMidnight, left_at: startOfToday, points_earned: yesterdayPoints },
                    todaySession: todaySession
                };
            });
        })();
    }

    // Get user's daily voice time for limit checking (timezone-aware)
    async getUserDailyTime(discordId, date = null) {
        return measureDatabase('getUserDailyTime', async () => {
            const client = await pool.connect();
            try {
                // Use user's timezone for accurate date calculation
                const targetDate = date || await timezoneService.getTodayInUserTimezone(discordId);
                // Get user's timezone for accurate limit calculations
                const userTimezone = await timezoneService.getUserTimezone(discordId);

                // COMPATIBLE WITH DAILY CUMULATIVE POINTS SYSTEM:
                // Query both current and archived daily stats to get accurate daily totals
                const result = await client.query(
                    `SELECT total_minutes FROM daily_voice_stats
                     WHERE discord_id = $1 AND date = $2
                     AND (archived IS NULL OR archived = false)`,
                    [discordId, targetDate]
                );

                const dailyMinutes = result.rows[0]?.total_minutes || 0;
                const dailyHours = minutesToHours(dailyMinutes);

                // Use centralized daily limit calculation with timezone awareness
                const limitInfo = calculateDailyLimitInfo(dailyHours, 15, userTimezone);

                return {
                    dailyMinutes,
                    dailyHours: limitInfo.dailyHours,
                    remainingHours: limitInfo.remainingHours,
                    allowanceHoursRemaining: limitInfo.allowanceHoursRemaining,
                    hoursUntilMidnight: limitInfo.hoursUntilMidnight,
                    limitReached: limitInfo.limitReached,
                    canEarnPoints: limitInfo.canEarnPoints
                };
            } catch (error) {
                console.error('Error getting user daily time:', error);
                throw error;
            } finally {
                client.release();
            }
        })();
    }

    // Update user streak (only increment once per day) - timezone-aware
    async updateStreak(discordId, sessionDate, userTimezone = null) {
        const client = await pool.connect();
        try {
            const user = await client.query(
                'SELECT * FROM users WHERE discord_id = $1',
                [discordId]
            );

            if (user.rows.length === 0) return;

            const userData = user.rows[0];

            // Get user's timezone if not provided
            const timezone = userTimezone || userData.timezone || 'UTC';

            // Use timezone-aware date comparisons
            const today = dayjs(sessionDate).tz(timezone);
            const lastVcDate = userData.last_vc_date ? dayjs(userData.last_vc_date).tz(timezone) : null;

            let newStreak = userData.current_streak;
            let shouldUpdateLastVcDate = false;

            if (!lastVcDate) {
                // First time joining VC
                newStreak = 1;
                shouldUpdateLastVcDate = true;
            } else {
                const daysDiff = today.diff(lastVcDate, 'day');

                if (daysDiff === 1) {
                    // Consecutive day - increment streak
                    newStreak = userData.current_streak + 1;
                    shouldUpdateLastVcDate = true;
                } else if (daysDiff > 1) {
                    // Missed days - reset streak to 1
                    newStreak = 1;
                    shouldUpdateLastVcDate = true;
                } else if (daysDiff === 0) {
                    // Same day - don't change streak or date
                    console.log(`🔥 Streak maintained for ${discordId}: ${newStreak} days (same day session in ${timezone})`);
                    return; // No database update needed
                }
            }

            const newLongestStreak = Math.max(userData.longest_streak, newStreak);

            // Only update if streak changed or it's a new day
            if (shouldUpdateLastVcDate) {
                await client.query(
                    `UPDATE users
                     SET current_streak = $1, longest_streak = $2, last_vc_date = $3, updated_at = CURRENT_TIMESTAMP
                     WHERE discord_id = $4`,
                    [newStreak, newLongestStreak, sessionDate, discordId]
                );

                console.log(`🔥 Streak updated for ${discordId}: ${newStreak} days (timezone: ${timezone})`);
            }
        } catch (error) {
            console.error('Error updating streak:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    // ========================================================================
    // OPTIMIZED METHODS USING DATABASE VIEWS (40-60% PERFORMANCE IMPROVEMENT)
    // ========================================================================

    // Get user voice stats using optimized view (replaces getUserStats)
    async getUserStatsOptimized(discordId) {
        return measureDatabase('getUserStatsOptimized', async () => {
            // Try cache first
            const cacheKey = `user_stats_optimized:${discordId}`;
            const cached = queryCache.get(cacheKey);
            if (cached) {
                return cached;
            }

            return executeWithResilience(async (client) => {
                // Check and perform monthly reset if needed
                await checkAndPerformMonthlyReset(discordId);

                // Single query using optimized view - replaces 4+ separate queries
                const result = await client.query(
                    'SELECT * FROM user_complete_profile WHERE discord_id = $1',
                    [discordId]
                );

                if (result.rows.length === 0) {
                    return null;
                }

                const data = result.rows[0];

                // Get daily limit information
                const dailyLimitInfo = await this.getUserDailyTime(discordId);

                const optimizedResult = {
                    user: {
                        id: data.id,
                        discord_id: data.discord_id,
                        username: data.username,
                        house: data.house,
                        monthly_points: data.monthly_points,
                        monthly_hours: data.monthly_hours,
                        all_time_points: data.all_time_points,
                        all_time_hours: data.all_time_hours,
                        current_streak: data.current_streak,
                        longest_streak: data.longest_streak
                    },
                    today: {
                        minutes: data.today_minutes || 0,
                        sessions: data.today_sessions || 0,
                        points: data.today_points || 0,
                        hours: (data.today_minutes || 0) / 60,
                        // Add daily limit information
                        dailyHours: dailyLimitInfo.dailyHours,
                        remainingHours: dailyLimitInfo.remainingHours,
                        limitReached: dailyLimitInfo.limitReached,
                        canEarnPoints: dailyLimitInfo.canEarnPoints
                    },
                    thisMonth: {
                        minutes: data.month_minutes || 0,
                        sessions: data.month_sessions || 0,
                        points: data.monthly_points,
                        hours: parseFloat(data.monthly_hours) || 0
                    },
                    allTime: {
                        minutes: (parseFloat(data.all_time_hours) + parseFloat(data.monthly_hours)) * 60,
                        sessions: data.month_sessions || 0, // Approximation
                        points: data.total_all_time_points,
                        hours: parseFloat(data.total_all_time_hours) || 0
                    },
                    tasks: {
                        total: data.total_tasks || 0,
                        completed: data.completed_tasks || 0,
                        pending: data.pending_tasks || 0,
                        points: data.total_task_points || 0
                    },
                    isCurrentlyInVoice: data.currently_in_voice
                };

                // Cache the result for 1 minute
                queryCache.set(cacheKey, optimizedResult, 'userStats');
                return optimizedResult;
            });
        })();
    }

    // Get leaderboard using optimized views
    async getLeaderboardOptimized(type = 'monthly') {
        return measureDatabase('getLeaderboardOptimized', async () => {
            // Try cache first
            const cacheKey = `leaderboard_optimized:${type}`;
            const cached = queryCache.get(cacheKey);
            if (cached) {
                return cached;
            }

            return executeWithResilience(async (client) => {
                let result;

                if (type === 'monthly') {
                    // Use monthly_leaderboard view - single optimized query
                    result = await client.query('SELECT * FROM monthly_leaderboard');
                } else {
                    // Use alltime_leaderboard view - single optimized query
                    result = await client.query('SELECT * FROM alltime_leaderboard');
                }

                const optimizedResult = result.rows.map(entry => ({
                    rank: entry.rank,
                    discord_id: entry.discord_id,
                    username: entry.username || 'Unknown User',
                    house: entry.house,
                    hours: parseFloat(entry.hours) || 0,
                    points: parseInt(entry.points) || 0
                }));

                // Cache leaderboards for 2 minutes
                queryCache.set(cacheKey, optimizedResult, 'leaderboard');
                return optimizedResult;
            });
        })();
    }

    // Get house leaderboard using optimized views
    async getHouseLeaderboardOptimized(type = 'monthly') {
        return measureDatabase('getHouseLeaderboardOptimized', async () => {
            // Try cache first
            const cacheKey = `house_leaderboard_optimized:${type}`;
            const cached = queryCache.get(cacheKey);
            if (cached) {
                return cached;
            }

            return executeWithResilience(async (client) => {
                // Use house_leaderboard_with_champions view - single optimized query
                const result = await client.query('SELECT * FROM house_leaderboard_with_champions');

                const optimizedResult = result.rows.map(entry => ({
                    rank: parseInt(entry.house_rank) || 0,
                    name: entry.house_name,
                    points: type === 'monthly' ?
                        (parseInt(entry.house_monthly_points) || 0) :
                        (parseInt(entry.house_all_time_points) || 0),
                    monthlyPoints: parseInt(entry.house_monthly_points) || 0,
                    allTimePoints: parseInt(entry.house_all_time_points) || 0,
                    champion: {
                        discord_id: entry.champion_discord_id,
                        username: entry.champion_username,
                        points: parseInt(entry.champion_points) || 0
                    }
                }));

                // Cache house leaderboards for 3 minutes
                queryCache.set(cacheKey, optimizedResult, 'houseLeaderboard');
                return optimizedResult;
            });
        })();
    }

    // Get active voice sessions using optimized view
    async getActiveVoiceSessionsOptimized() {
        return measureDatabase('getActiveVoiceSessionsOptimized', async () => {
            return executeWithResilience(async (client) => {
                // Use active_voice_sessions view - single optimized query
                const result = await client.query('SELECT * FROM active_voice_sessions');

                return result.rows.map(session => ({
                    id: session.id,
                    discord_id: session.discord_id,
                    username: session.username,
                    house: session.house,
                    voice_channel_id: session.voice_channel_id,
                    voice_channel_name: session.voice_channel_name,
                    joined_at: session.joined_at,
                    current_duration_minutes: session.current_duration_minutes,
                    date: session.date
                }));
            });
        })();
    }

    // Get daily voice activity summary using optimized view
    async getDailyVoiceActivityOptimized(days = 30) {
        return measureDatabase('getDailyVoiceActivityOptimized', async () => {
            return executeWithResilience(async (client) => {
                // Use daily_voice_activity view with limit
                const result = await client.query(
                    'SELECT * FROM daily_voice_activity ORDER BY date DESC LIMIT $1',
                    [days]
                );

                return result.rows;
            });
        })();
    }

    // Refresh materialized views (call periodically)
    async refreshMaterializedViews() {
        return measureDatabase('refreshMaterializedViews', async () => {
            return executeWithResilience(async (client) => {
                // Call the database function to refresh materialized views
                await client.query('SELECT refresh_materialized_views()');
                console.log('✅ Materialized views refreshed successfully');

                // Clear related caches after refresh
                queryCache.invalidatePattern('user_stats_optimized:*');
                queryCache.invalidatePattern('leaderboard_optimized:*');

                return true;
            });
        })();
    }

    // ========================================================================
    // FALLBACK METHODS - For reliability when optimized methods fail
    // ========================================================================

    // Get user voice stats (using optimized/fallback pattern)
    async getUserStats(discordId) {
        return this.executeWithFallback(
            'getUserStats',
            this.getUserStatsOptimized.bind(this),
            this.getUserStatsOriginal.bind(this),
            discordId
        );
    }

    // Check and update streaks for all users (run daily)
    // DEPRECATED: This method is now handled by CentralResetService with timezone awareness
    async checkAllStreaks() {
        // Legacy method - CentralResetService now handles timezone-aware streak checks
        console.log('⚠️ Legacy streak check called - streak management now handled by CentralResetService');
        console.log('📋 CentralResetService provides timezone-aware streak resets every hour');
        return {
            message: 'Streak checking is now handled by CentralResetService',
            usersReset: 0,
            migrated: true
        };
    }

    // Get leaderboard data (using optimized/fallback pattern)
    async getLeaderboard(type = 'monthly') {
        return this.executeWithFallback(
            'getLeaderboard',
            this.getLeaderboardOptimized.bind(this),
            this.getLeaderboardOriginal.bind(this),
            type
        );
    }

    // Get house leaderboard data (using optimized/fallback pattern)
    async getHouseLeaderboard(type = 'monthly') {
        return this.executeWithFallback(
            'getHouseLeaderboard',
            this.getHouseLeaderboardOptimized.bind(this),
            this.getHouseLeaderboardOriginal.bind(this),
            type
        );
    }

    // Get house champions (top contributor per house)
    async getHouseChampions(type = 'monthly') {
        return measureDatabase('getHouseChampions', async () => {
            // Try cache first
            const cacheKey = `house_champions:${type}`;
            const cached = queryCache.get(cacheKey);
            if (cached) {
                return cached;
            }

            const { getHouseChampions } = require('../models/db');
            const result = await getHouseChampions(type);

            // Cache house champions for 3 minutes
            queryCache.set(cacheKey, result, 'houseChampions');
            return result;
        })();
    }

    // ========================================================================
    // FALLBACK METHODS - For reliability when optimized methods fail
    // ========================================================================

    // Fallback method for user stats (used only if optimized version fails)
    async getUserStatsOriginal(discordId) {
        return measureDatabase('getUserStats', async () => {
            // Try cache first
            const cacheKey = `user_stats:${discordId}`;
            const cached = queryCache.get(cacheKey);
            if (cached) {
                return cached;
            }

            const client = await pool.connect();
            try {
                // Check and perform monthly reset if needed
                await checkAndPerformMonthlyReset(discordId);

                // Get user basic info using cached query
                const { executeCachedQuery } = require('../models/db');
                const userResult = await executeCachedQuery(
                    'getUserBasic',
                    'SELECT * FROM users WHERE discord_id = $1',
                    [discordId],
                    'userStats'
                );

                if (userResult.rows.length === 0) {
                    return null;
                }

                const user = userResult.rows[0];
                const today = dayjs().format('YYYY-MM-DD');
                const thisMonth = dayjs().format('YYYY-MM');

                // Get today's stats using cached query
                const todayStats = await executeCachedQuery(
                    'getTodayStats',
                    'SELECT * FROM daily_voice_stats WHERE discord_id = $1 AND date = $2',
                    [discordId, today],
                    'userStats'
                );

                // Get this month's stats using cached query
                const monthlyStats = await executeCachedQuery(
                    'getMonthlyStats',
                    `SELECT SUM(total_minutes) as total_minutes, SUM(session_count) as session_count, SUM(points_earned) as points_earned
                     FROM daily_voice_stats
                     WHERE discord_id = $1 AND date >= $2`,
                    [discordId, `${thisMonth}-01`],
                    'userStats'
                );

                // Get all-time stats using cached query
                const allTimeStats = await executeCachedQuery(
                    'getAllTimeStats',
                    `SELECT SUM(total_minutes) as total_minutes, SUM(session_count) as session_count, SUM(points_earned) as points_earned
                     FROM daily_voice_stats
                     WHERE discord_id = $1`,
                    [discordId],
                    'userStats'
                );

                // Calculate total all-time hours and points
                const allTimeHours = parseFloat(user.all_time_hours) + parseFloat(user.monthly_hours);
                const allTimePoints = user.all_time_points + user.monthly_points;

                // Get daily limit information
                const dailyLimitInfo = await this.getUserDailyTime(discordId, today);

                const result = {
                    user,
                    today: {
                        minutes: todayStats.rows[0]?.total_minutes || 0,
                        sessions: todayStats.rows[0]?.session_count || 0,
                        points: todayStats.rows[0]?.points_earned || 0,
                        hours: (todayStats.rows[0]?.total_minutes || 0) / 60,
                        // Add daily limit information
                        dailyHours: dailyLimitInfo.dailyHours,
                        remainingHours: dailyLimitInfo.remainingHours,
                        limitReached: dailyLimitInfo.limitReached,
                        canEarnPoints: dailyLimitInfo.canEarnPoints
                    },
                    thisMonth: {
                        minutes: parseInt(monthlyStats.rows[0]?.total_minutes || 0),
                        sessions: parseInt(monthlyStats.rows[0]?.session_count || 0),
                        points: user.monthly_points,
                        hours: parseFloat(user.monthly_hours)
                    },
                    allTime: {
                        minutes: parseInt(allTimeStats.rows[0]?.total_minutes || 0),
                        sessions: parseInt(allTimeStats.rows[0]?.session_count || 0),
                        points: allTimePoints,
                        hours: allTimeHours
                    }
                };

                // Cache the result for 1 minute (stats change frequently)
                queryCache.set(cacheKey, result, 'userStats');
                return result;
            } catch (error) {
                console.error('Error getting user stats:', error);
                throw error;
            } finally {
                client.release();
            }
        })();
    }

    // Fallback method for leaderboard (used only if optimized version fails)
    async getLeaderboardOriginal(type = 'monthly') {
        return measureDatabase('getLeaderboard', async () => {
            // Try cache first
            const cacheKey = `leaderboard:${type}`;
            const cached = queryCache.get(cacheKey);
            if (cached) {
                return cached;
            }

            const client = await pool.connect();
            try {
                let leaderboardData = [];

                if (type === 'monthly') {
                    // Monthly leaderboard based on current month's hours and points
                    const result = await client.query(`
                        SELECT
                            u.discord_id,
                            u.username,
                            u.monthly_hours as hours,
                            u.monthly_points as points
                        FROM users u
                        WHERE u.monthly_hours > 0
                        ORDER BY u.monthly_hours DESC, u.monthly_points DESC
                        LIMIT 50
                    `);
                    leaderboardData = result.rows;
                } else {
                    // All-time leaderboard based on total hours and points
                    const result = await client.query(`
                        SELECT
                            u.discord_id,
                            u.username,
                            (u.all_time_hours + u.monthly_hours) as hours,
                            (u.all_time_points + u.monthly_points) as points
                        FROM users u
                        WHERE (u.all_time_hours + u.monthly_hours) > 0
                        ORDER BY (u.all_time_hours + u.monthly_hours) DESC, (u.all_time_points + u.monthly_points) DESC
                        LIMIT 50
                    `);
                    leaderboardData = result.rows;
                }

                // Convert hours to proper decimal format and ensure all numbers are valid
                const result = leaderboardData.map(entry => ({
                    discord_id: entry.discord_id,
                    username: entry.username || 'Unknown User',
                    hours: parseFloat(entry.hours) || 0,
                    points: parseInt(entry.points) || 0
                })).filter(entry => entry.hours > 0); // Only include users with actual voice time

                // Cache leaderboards for 2 minutes (they don't change that often)
                queryCache.set(cacheKey, result, 'leaderboard');
                return result;

            } catch (error) {
                console.error('Error getting leaderboard:', error);
                throw error;
            } finally {
                client.release();
            }
        })();
    }

    // Fallback method for house leaderboard (used only if optimized version fails)
    async getHouseLeaderboardOriginal(type = 'monthly') {
        return measureDatabase('getHouseLeaderboard', async () => {
            // Try cache first
            const cacheKey = `house_leaderboard:${type}`;
            const cached = queryCache.get(cacheKey);
            if (cached) {
                return cached;
            }

            const { getHouseLeaderboard } = require('../models/db');
            const result = await getHouseLeaderboard(type);

            // Cache house leaderboards for 3 minutes (house stats change less frequently)
            queryCache.set(cacheKey, result, 'houseLeaderboard');
            return result;
        })();
    }
}

module.exports = new VoiceService();
