const { pool, getCachedUser, setCachedUser, clearUserCache, calculatePointsForHours, checkAndPerformMonthlyReset, getUserHouse, updateHousePoints } = require('../models/db');
const dayjs = require('dayjs');
const { measureDatabase } = require('../utils/performanceMonitor');
const queryCache = require('../utils/queryCache');

class VoiceService {
    // Get or create user in database with caching
    async getOrCreateUser(discordId, username) {
        return measureDatabase('getOrCreateUser', async () => {
            // Check cache first
            const cachedUser = getCachedUser(discordId);
            if (cachedUser) {
                // Update username if it changed (but don't query DB every time)
                if (cachedUser.username !== username) {
                    const client = await pool.connect();
                    try {
                        await client.query(
                            'UPDATE users SET username = $1, updated_at = CURRENT_TIMESTAMP WHERE discord_id = $2',
                            [username, discordId]
                        );
                        cachedUser.username = username;
                        setCachedUser(discordId, cachedUser);
                    } finally {
                        client.release();
                    }
                }
                return cachedUser;
            }

            const client = await pool.connect();
            try {
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
            } catch (error) {
                console.error('Error in getOrCreateUser:', error);
                throw error;
            } finally {
                client.release();
            }
        })();
    }

    // Start a voice session when user joins VC
    async startVoiceSession(discordId, username, voiceChannelId, voiceChannelName) {
        return measureDatabase('startVoiceSession', async () => {
            const client = await pool.connect();
            try {
                const user = await this.getOrCreateUser(discordId, username);
                const now = new Date();
                const today = dayjs().format('YYYY-MM-DD');

                // Insert new session
                const session = await client.query(
                    `INSERT INTO vc_sessions (user_id, discord_id, voice_channel_id, voice_channel_name, joined_at, date)
                     VALUES ($1, $2, $3, $4, $5, $6)
                     RETURNING *`,
                    [user.id, discordId, voiceChannelId, voiceChannelName, now, today]
                );

                console.log(`👥 Voice session started for ${username} in ${voiceChannelName}`);
                return session.rows[0];
            } catch (error) {
                console.error('Error starting voice session:', error);
                throw error;
            } finally {
                client.release();
            }
        })();
    }

    // End a voice session when user leaves VC
    async endVoiceSession(discordId, voiceChannelId, member = null) {
        return measureDatabase('endVoiceSession', async () => {
            const client = await pool.connect();
            try {
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
                const pointsEarned = await this.calculateAndAwardPoints(discordId, durationMinutes, member);

                // Update daily stats
                await this.updateDailyStats(discordId, session.date, durationMinutes, pointsEarned);

                // Update streak if user spent at least 15 minutes
                if (durationMinutes >= 15) {
                    await this.updateStreak(discordId, session.date);
                }

                console.log(`👋 Voice session ended for ${discordId}. Duration: ${durationMinutes} minutes, Points earned: ${pointsEarned}`);
                return { ...session, duration_minutes: durationMinutes, left_at: now, points_earned: pointsEarned };
            } catch (error) {
                console.error('Error ending voice session:', error);
                throw error;
            } finally {
                client.release();
            }
        })();
    }

    // Calculate and award points based on time spent and/or task completion
    async calculateAndAwardPoints(discordId, durationMinutes, member = null, additionalPoints = 0) {
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
                const sessionHours = durationMinutes / 60;
                const currentMonthlyHours = parseFloat(user.monthly_hours) || 0;
                
                // Calculate points earned for voice time
                const voiceTimePoints = durationMinutes > 0 ? calculatePointsForHours(currentMonthlyHours, sessionHours) : 0;
                
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
                
                // Update user's monthly totals
                const newMonthlyPoints = user.monthly_points + totalPointsEarned;
                const newMonthlyHours = currentMonthlyHours + sessionHours;
                
                await client.query(`
                    UPDATE users SET 
                        monthly_points = $1,
                        monthly_hours = $2,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE discord_id = $3
                `, [newMonthlyPoints, newMonthlyHours, discordId]);
                
                // Award points to user's house if they have one
                if (userHouse && totalPointsEarned > 0) {
                    await updateHousePoints(userHouse, totalPointsEarned);
                }
                
                // Clear user cache to force fresh data
                clearUserCache(discordId);
                
                // Clear query caches that depend on this user's data
                queryCache.delete(`user_stats:${discordId}`);
                queryCache.deletePattern('leaderboard:*');
                queryCache.deletePattern('house_*');
                
                if (additionalPoints > 0) {
                    console.log(`💰 Points awarded to ${discordId}: ${voiceTimePoints} voice points + ${additionalPoints} task points = ${totalPointsEarned} total points${userHouse ? ` (House: ${userHouse})` : ''}`);
                } else {
                    console.log(`💰 Points awarded to ${discordId}: ${totalPointsEarned} points for ${sessionHours.toFixed(2)} hours${userHouse ? ` (House: ${userHouse})` : ''}`);
                }
                return totalPointsEarned;
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
                await client.query(
                    `INSERT INTO daily_voice_stats (discord_id, date, total_minutes, session_count, points_earned, user_id)
                     VALUES ($1, $2, $3, 1, $4, (SELECT id FROM users WHERE discord_id = $5))
                     ON CONFLICT (discord_id, date) 
                     DO UPDATE SET 
                        total_minutes = daily_voice_stats.total_minutes + $6,
                        session_count = daily_voice_stats.session_count + 1,
                        points_earned = daily_voice_stats.points_earned + $7,
                        updated_at = CURRENT_TIMESTAMP`,
                    [discordId, date, additionalMinutes, pointsEarned, discordId, additionalMinutes, pointsEarned]
                );
            } catch (error) {
                console.error('Error updating daily stats:', error);
                throw error;
            } finally {
                client.release();
            }
        })();
    }

    // Update user streak (only increment once per day)
    async updateStreak(discordId, sessionDate) {
        const client = await pool.connect();
        try {
            const user = await client.query(
                'SELECT * FROM users WHERE discord_id = $1',
                [discordId]
            );

            if (user.rows.length === 0) return;

            const userData = user.rows[0];
            const today = dayjs(sessionDate);
            const lastVcDate = userData.last_vc_date ? dayjs(userData.last_vc_date) : null;

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
                    console.log(`🔥 Streak maintained for ${discordId}: ${newStreak} days (same day session)`);
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

                console.log(`🔥 Streak updated for ${discordId}: ${newStreak} days`);
            }
        } catch (error) {
            console.error('Error updating streak:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Get user voice stats
    async getUserStats(discordId) {
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
                
                // Get user basic info
                const userResult = await client.query(
                    'SELECT * FROM users WHERE discord_id = $1',
                    [discordId]
                );

                if (userResult.rows.length === 0) {
                    return null;
                }

                const user = userResult.rows[0];
                const today = dayjs().format('YYYY-MM-DD');
                const thisMonth = dayjs().format('YYYY-MM');

                // Get today's stats
                const todayStats = await client.query(
                    'SELECT * FROM daily_voice_stats WHERE discord_id = $1 AND date = $2',
                    [discordId, today]
                );

                // Get this month's stats
                const monthlyStats = await client.query(
                    `SELECT SUM(total_minutes) as total_minutes, SUM(session_count) as session_count, SUM(points_earned) as points_earned
                     FROM daily_voice_stats 
                     WHERE discord_id = $1 AND date >= $2`,
                    [discordId, `${thisMonth}-01`]
                );

                // Get all-time stats (combining current monthly + all-time stored)
                const allTimeStats = await client.query(
                    `SELECT SUM(total_minutes) as total_minutes, SUM(session_count) as session_count, SUM(points_earned) as points_earned
                     FROM daily_voice_stats 
                     WHERE discord_id = $1`,
                    [discordId]
                );

                // Calculate total all-time hours and points
                const allTimeHours = parseFloat(user.all_time_hours) + parseFloat(user.monthly_hours);
                const allTimePoints = user.all_time_points + user.monthly_points;

                const result = {
                    user,
                    today: {
                        minutes: todayStats.rows[0]?.total_minutes || 0,
                        sessions: todayStats.rows[0]?.session_count || 0,
                        points: todayStats.rows[0]?.points_earned || 0,
                        hours: (todayStats.rows[0]?.total_minutes || 0) / 60
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

    // Check and update streaks for all users (run daily)
    async checkAllStreaks() {
        const client = await pool.connect();
        try {
            const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
            
            // Get all users who didn't join VC yesterday and have current streaks
            const usersToReset = await client.query(
                `SELECT DISTINCT u.discord_id, u.current_streak 
                 FROM users u 
                 WHERE u.current_streak > 0 
                 AND NOT EXISTS (
                     SELECT 1 FROM daily_voice_stats dvs 
                     WHERE dvs.discord_id = u.discord_id 
                     AND dvs.date = $1 
                     AND dvs.total_minutes >= 15
                 )`,
                [yesterday]
            );

            for (const user of usersToReset.rows) {
                await client.query(
                    'UPDATE users SET current_streak = 0, updated_at = CURRENT_TIMESTAMP WHERE discord_id = $1',
                    [user.discord_id]
                );
                console.log(`💔 Streak reset for ${user.discord_id} (was ${user.current_streak})`);
            }

            return usersToReset.rows.length;
        } catch (error) {
            console.error('Error checking streaks:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Get leaderboard data for monthly or all-time rankings
    async getLeaderboard(type = 'monthly') {
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

    // Get house leaderboard data
    async getHouseLeaderboard(type = 'monthly') {
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
}

module.exports = new VoiceService();
