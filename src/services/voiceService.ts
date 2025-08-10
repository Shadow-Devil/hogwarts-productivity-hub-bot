import dayjs from "dayjs";
import {
  db,
  getUserHouse,
  checkAndPerformHouseMonthlyReset,
  fetchUserTimezone,
} from "../db/db.ts";
import type { GuildMember } from "discord.js";


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
 * Calculate daily limit information for a user
 * @param {number} dailyHours - Current hours spent today
 * @param {number} dailyLimitHours - Daily limit (default 15)
 * @param {string} userTimezone - User's timezone (IANA identifier, e.g., 'America/New_York')
 * @returns {Object} Daily limit information
 */
function calculateDailyLimitInfo(
  dailyHours: number,
  dailyLimitHours: number = 15,
  userTimezone: string | null = null
) {
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
 * Generate daily limit messages for user notifications
 * @param {Object} limitInfo - Daily limit info from calculateDailyLimitInfo
 * @param {number} actualSessionHours - Hours spent in this session
 * @param {number} voiceTimePoints - Points earned from voice time
 * @returns {string|null} Limit message or null if no message needed
 */
function generateDailyLimitMessage(
  limitInfo: {
    dailyHours: number;
    limitReached: boolean;
  },
  actualSessionHours: number,
  voiceTimePoints: number,
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


// Update house points when user earns points (with advisory locking)
async function updateHousePoints(houseName: string, pointsEarned: number) {
  if (!houseName || pointsEarned <= 0) return;
  // Check and perform monthly reset for houses if needed
  await checkAndPerformHouseMonthlyReset();

  // Update house points atomically (continuous all-time update system)
  const result = await db.$client.query(
    `
          UPDATE houses SET
              monthly_points = monthly_points + $1,
              all_time_points = all_time_points + $1,
              total_points = total_points + $1,
              updated_at = CURRENT_TIMESTAMP
          WHERE name = $2
          RETURNING monthly_points, all_time_points, total_points
      `,
    [pointsEarned, houseName]
  );

  if (result.rows.length === 0) {
    throw new Error(`House ${houseName} not found`);
  }

  console.log(
    `🏠 Added ${pointsEarned} points to ${houseName} (Monthly: ${result.rows[0].monthly_points}, All-time: ${result.rows[0].all_time_points}, Total: ${result.rows[0].total_points})`
  );
  return result.rows[0];
}


// Check and perform monthly reset for a user if needed
async function checkAndPerformMonthlyReset(discordId: string) {
  try {
    const firstOfMonth = dayjs().startOf("month").format("YYYY-MM-DD");

    // Get user data
    const userResult = await db.$client.query(
      "SELECT * FROM users WHERE discord_id = $1",
      [discordId]
    );

    if (userResult.rows.length === 0) return;

    const user = userResult.rows[0];
    const lastReset = user.last_monthly_reset
      ? dayjs(user.last_monthly_reset)
      : null;
    const currentMonth = dayjs().startOf("month");

    // Check if we need to perform monthly reset
    if (!lastReset || lastReset.isBefore(currentMonth)) {
      console.log(
        `🔄 Performing monthly reset for user ${discordId} (all-time stats now continuously updated)`
      );

      // Store the monthly summary before reset (for historical tracking)
      if (user.monthly_hours > 0 || user.monthly_points > 0) {
        const lastMonth = lastReset
          ? lastReset.format("YYYY-MM")
          : dayjs().subtract(1, "month").format("YYYY-MM");
        await db.$client.query(
          `
                    INSERT INTO monthly_voice_summary (user_id, discord_id, year_month, total_hours, total_points)
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (discord_id, year_month)
                    DO UPDATE SET
                        total_hours = $4,
                        total_points = $5,
                        updated_at = CURRENT_TIMESTAMP
                `,
          [
            user.id,
            discordId,
            lastMonth,
            user.monthly_hours,
            user.monthly_points,
          ]
        );
      }

      // Reset monthly stats only (all-time stats are continuously updated now)
      await db.$client.query(
        `
                UPDATE users SET
                    monthly_points = 0,
                    monthly_hours = 0,
                    last_monthly_reset = $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE discord_id = $2
            `,
        [firstOfMonth, discordId]
      );
      console.log(`✅ Monthly reset completed for ${discordId}`);
    }
  } catch (error) {
    console.error("Error performing monthly reset:", error);
    throw error;
  }
}


// Calculate points based on hours spent
// First hour daily: 5 points, subsequent hours: 2 points each (daily cumulative system)
// NOTE: Rounding is handled in the voice service, this function receives already-rounded hours
function calculatePointsForHours(startingHours: number, hoursToCalculate: number) {
  let points = 0;
  let remainingHours = hoursToCalculate;
  let currentTotal = startingHours;

  while (remainingHours > 0) {
    if (currentTotal < 1) {
      // First hour territory (5 points per hour)
      const firstHourPortion = Math.min(
        remainingHours,
        1 - Math.floor(currentTotal)
      );
      points += firstHourPortion * 5;
      remainingHours -= firstHourPortion;
      currentTotal += firstHourPortion;
    } else {
      // Subsequent hours territory (2 points per hour)
      points += remainingHours * 2;
      break;
    }
  }

  return points;
}


// Get or create user in database with caching
async function getOrCreateUser(discordId: string, username: string) {
  // Try to find existing user
  const result = await db.$client.query(
    "SELECT * FROM users WHERE discord_id = $1",
    [discordId]
  );

  let user;
  if (result.rows.length > 0) {
    user = result.rows[0];
    // Update username if it changed
    if (user.username !== username) {
      await db.$client.query(
        "UPDATE users SET username = $1, updated_at = CURRENT_TIMESTAMP WHERE discord_id = $2",
        [username, discordId]
      );
      user.username = username;
    }
  } else {
    // Create new user
    const newUserResult = await db.$client.query(
      `INSERT INTO users (discord_id, username)
                      VALUES ($1, $2)
                      RETURNING *`,
      [discordId, username]
    );
    user = newUserResult.rows[0];
  }

  return user;
}

/**
 * Get today's date in user's timezone (YYYY-MM-DD format)
 * @param {string} userId - User's Discord ID
 * @returns {Promise<string>} Today's date in user's timezone
 */
async function getTodayInUserTimezone(userId: string) {
  const userTime = await fetchUserTimezone(userId);
  return dayjs().tz(userTime).format("YYYY-MM-DD");
}

// Start a voice session when user joins VC (timezone-aware)
export async function startVoiceSession(
  discordId: string,
  username: string,
  voiceChannelId: string,
  voiceChannelName: string
) {
  const user = await getOrCreateUser(discordId, username);
  const now = new Date();

  // Use user's timezone for accurate date calculation
  const today = await getTodayInUserTimezone(discordId);

  // Insert new session
  const session = await db.$client.query(
    `INSERT INTO voice_sessions (user_id, discord_id, voice_channel_id, voice_channel_name, joined_at, date)
                     VALUES ($1, $2, $3, $4, $5, $6)
                     RETURNING *`,
    [user.id, discordId, voiceChannelId, voiceChannelName, now, today]
  );

  console.log(
    `👥 Voice session started for ${username} in ${voiceChannelName} (date: ${today})`
  );
  return session.rows[0];
}

// End a voice session when user leaves VC
export async function endVoiceSession(discordId: string, voiceChannelId: string, member: GuildMember | null = null) {
  const now = new Date().getTime();

  // Find the active session
  const result = await db.$client.query(
    `SELECT * FROM voice_sessions
                  WHERE discord_id = $1 AND voice_channel_id = $2 AND left_at IS NULL
                  ORDER BY joined_at DESC LIMIT 1`,
    [discordId, voiceChannelId]
  );

  if (result.rows.length === 0) {
    console.log(
      `No active session found for ${discordId} in ${voiceChannelId}`
    );
    return null;
  }

  const session = result.rows[0];
  const joinedAt = new Date(session.joined_at).getTime();
  const durationMs = now - joinedAt;
  const durationMinutes = Math.floor(durationMs / (1000 * 60));

  // Update the session with end time and duration
  await db.$client.query(
    `UPDATE voice_sessions
                  SET left_at = $1, duration_minutes = $2
                  WHERE id = $3`,
    [now, durationMinutes, session.id]
  );

  // Calculate and award points for this session
  const pointsResult = await calculateAndAwardPoints(
    discordId,
    durationMinutes,
    member
  );
  const pointsEarned =
    typeof pointsResult === "object"
      ? pointsResult.pointsEarned
      : pointsResult;

  // Update daily stats
  await updateDailyStats(
    discordId,
    durationMinutes,
    pointsEarned
  );

  // Update streak if user spent at least 15 minutes (timezone-aware)
  if (durationMinutes >= 15) {
    // Get user's timezone for streak calculation
    const userTimezone = await fetchUserTimezone(discordId);
    await updateStreak(discordId, session.date, userTimezone);
  }

  console.log(
    `👋 Voice session ended for ${discordId}. Duration: ${durationMinutes} minutes, Points earned: ${pointsEarned}`
  );
  return {
    ...session,
    duration_minutes: durationMinutes,
    left_at: now,
    points_earned: pointsEarned,
    ...pointsResult,
  };
}

// Calculate and award points based on time spent and/or task completion
export async function calculateAndAwardPoints(
  discordId: string,
  durationMinutes: number,
  member: GuildMember | null = null,
  additionalPoints = 0,
  applyRounding = true
) {
  try {
    // Check and perform monthly reset if needed
    await checkAndPerformMonthlyReset(discordId);

    // Get current user data
    const userResult = await db.$client.query(
      "SELECT * FROM users WHERE discord_id = $1",
      [discordId]
    );

    if (userResult.rows.length === 0) return 0;

    const user = userResult.rows[0];
    const currentMonthlyHours = parseFloat(user.monthly_hours) || 0;

    // Get daily stats for voice time points calculation (timezone-aware)
    const today = await getTodayInUserTimezone(discordId);
    const dailyStats = await db.$client.query(
      "SELECT total_minutes, points_earned FROM daily_voice_stats WHERE discord_id = $1 AND date = $2",
      [discordId, today]
    );

    const currentDailyMinutes = dailyStats.rows[0]?.total_minutes || 0;
    const currentDailyHours = currentDailyMinutes / 60;

    // NEW DAILY CUMULATIVE POINTS SYSTEM:
    // Record actual session hours (apply rounding based on parameter)
    const actualSessionHours = applyRounding
      ? roundHoursFor55MinRule(durationMinutes / 60)
      : durationMinutes / 60;
    const newDailyHours = currentDailyHours + actualSessionHours;
    const newMonthlyHours = currentMonthlyHours + actualSessionHours;

    // Calculate points based on daily cumulative hours with 55-minute rounding applied to daily totals
    const roundedNewDailyHours = roundHoursFor55MinRule(newDailyHours);
    const roundedOldDailyHours = roundHoursFor55MinRule(currentDailyHours);

    // Points earned = difference between old and new daily cumulative points (recalculate from day start)
    const cumulativePointsNew = calculatePointsForHours(
      0,
      roundedNewDailyHours
    );
    const cumulativePointsOld = calculatePointsForHours(
      0,
      roundedOldDailyHours
    );
    const sessionPointsEarned = Math.max(
      0,
      cumulativePointsNew - cumulativePointsOld
    );

    // Apply daily 15-hour limit to points (but always record hours)
    let voiceTimePoints = sessionPointsEarned;
    let limitReached = false;
    let limitMessage = null;

    if (durationMinutes > 0) {
      if (currentDailyHours >= 15) {
        voiceTimePoints = 0;
        limitReached = true;
        limitMessage = generateDailyLimitMessage(
          {
            dailyHours: currentDailyHours + actualSessionHours,
            limitReached: true,
          },
          actualSessionHours,
          voiceTimePoints
        );
      } else if (currentDailyHours + actualSessionHours > 15) {
        // Proportionally reduce points if session exceeds daily limit
        const remainingDailyHours = 15 - currentDailyHours;
        const sessionRatio = remainingDailyHours / actualSessionHours;
        voiceTimePoints = Math.floor(sessionPointsEarned * sessionRatio);
        limitReached = true;
        limitMessage = generateDailyLimitMessage(
          {
            dailyHours: currentDailyHours + actualSessionHours,
            limitReached: true,
          },
          actualSessionHours,
          voiceTimePoints
        );
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
        await db.$client.query(
          "UPDATE users SET house = $1, updated_at = CURRENT_TIMESTAMP WHERE discord_id = $2",
          [userHouse, discordId]
        );
      }
    }

    // Update user's monthly totals and all-time stats immediately (NEW CONTINUOUS SYSTEM)
    const newMonthlyPoints = user.monthly_points + totalPointsEarned;
    const newAllTimePoints = user.all_time_points + totalPointsEarned;
    const newAllTimeHours =
      parseFloat(user.all_time_hours) + actualSessionHours;

    await db.$client.query(
      `
                    UPDATE users SET
                        monthly_points = $1,
                        monthly_hours = $2,
                        all_time_points = $3,
                        all_time_hours = $4,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE discord_id = $5
                `,
      [
        newMonthlyPoints,
        newMonthlyHours,
        newAllTimePoints,
        newAllTimeHours,
        discordId,
      ]
    );

    // Award points to user's house if they have one
    if (userHouse && totalPointsEarned > 0) {
      await updateHousePoints(userHouse, totalPointsEarned);
    }

    // Send daily limit notification if needed
    if (limitReached && limitMessage && member) {
      try {
        await member.send(limitMessage);
      } catch (error) {
        console.log(
          `Could not send daily limit notification to ${discordId}: ${error}`
        );
      }
    }

    // Enhanced logging for new continuous all-time update system
    if (additionalPoints > 0) {
      console.log(
        `💰 Points awarded to ${discordId}: ${voiceTimePoints} voice points + ${additionalPoints} task points = ${totalPointsEarned} total points${userHouse ? ` (House: ${userHouse})` : ""}${limitReached ? " [Daily limit reached]" : ""}`
      );
      console.log(
        `📊 Stats updated: Monthly: ${newMonthlyPoints} pts, ${newMonthlyHours.toFixed(2)}h | All-time: ${newAllTimePoints} pts, ${newAllTimeHours.toFixed(2)}h`
      );
    } else {
      console.log(
        `💰 Points awarded to ${discordId}: ${totalPointsEarned} points for ${actualSessionHours.toFixed(2)} hours${userHouse ? ` (House: ${userHouse})` : ""}${limitReached ? " [Daily limit reached]" : ""}`
      );
      console.log(
        `📊 Stats updated: Monthly: ${newMonthlyPoints} pts, ${newMonthlyHours.toFixed(2)}h | All-time: ${newAllTimePoints} pts, ${newAllTimeHours.toFixed(2)}h`
      );
    }

    // Return both points earned and limit status for caller
    return {
      pointsEarned: totalPointsEarned,
      limitReached,
      limitMessage,
      dailyHours: currentDailyHours + actualSessionHours,
      monthlyHours: newMonthlyHours,
      sessionPointsFromCumulative: sessionPointsEarned,
    };
  } catch (error) {
    console.error("Error calculating and awarding points:", error);
    throw error;
  }
}

// Update daily voice stats
export async function updateDailyStats(
  discordId: string,
  additionalMinutes: number,
  _pointsEarned = 0
) {
  try {
  // For the new daily cumulative system, we need to recalculate total daily points
  // rather than just adding session points, since points are now based on daily totals

    // First, get current daily stats (compatible with archival system)
    const currentStats = await db.$client.query(
      `SELECT total_minutes, points_earned FROM daily_voice_stats
                     WHERE discord_id = $1 AND date = $2
                     AND (archived IS NULL OR archived = false)`,
      [discordId]
    );

    const currentMinutes = currentStats.rows[0]?.total_minutes || 0;
    const newTotalMinutes = currentMinutes + additionalMinutes;
    const newTotalHours = newTotalMinutes / 60;

    // Recalculate points based on total daily hours with 55-minute rounding
    const roundedDailyHours = roundHoursFor55MinRule(newTotalHours);
    const recalculatedDailyPoints = calculatePointsForHours(
      0,
      roundedDailyHours
    );

    // Apply daily 15-hour limit to points calculation
    let finalDailyPoints = recalculatedDailyPoints;
    if (newTotalHours > 15) {
      // Cap at 15 hours worth of points
      const roundedLimitedHours = roundHoursFor55MinRule(
        Math.min(newTotalHours, 15)
      );
      finalDailyPoints = calculatePointsForHours(0, roundedLimitedHours);
    }

    await db.$client.query(
      `INSERT INTO daily_voice_stats (discord_id, date, total_minutes, session_count, points_earned, user_id, archived)
                     VALUES ($1, $2, $3, 1, $4, (SELECT id FROM users WHERE discord_id = $5), false)
                     ON CONFLICT (discord_id, date)
                     DO UPDATE SET
                        total_minutes = $6,
                        session_count = daily_voice_stats.session_count + 1,
                        points_earned = $7,
                        archived = false,
                        updated_at = CURRENT_TIMESTAMP`,
      [
        discordId,
        additionalMinutes,
        finalDailyPoints,
        discordId,
        newTotalMinutes,
        finalDailyPoints,
      ]
    );
  } catch (error) {
    console.error("Error updating daily stats:", error);
    throw error;
  }
}

// Handle session that crosses midnight - split into separate daily sessions (timezone-aware)
export async function handleMidnightCrossover(discordId: string, voiceChannelId: string, member: GuildMember | null = null) {
  // Use user's timezone for accurate midnight calculation
  const userTime =
    await fetchUserTimezone(discordId);
  const startOfToday = dayjs().tz(userTime).startOf("day").toDate().getTime();

  // Find active session that started yesterday
  const result = await db.$client.query(
    `SELECT * FROM voice_sessions
                     WHERE discord_id = $1 AND voice_channel_id = $2 AND left_at IS NULL
                     AND joined_at < $3
                     ORDER BY joined_at DESC LIMIT 1`,
    [discordId, voiceChannelId, startOfToday]
  );

  if (result.rows.length === 0) {
    return null; // No session crossing midnight
  }

  const yesterdaySession = result.rows[0];
  const joinedAt = new Date(yesterdaySession.joined_at).getTime();

  // Calculate duration from join time to midnight
  const durationUntilMidnight = Math.floor(
    (startOfToday - joinedAt) / (1000 * 60)
  );

  // End the yesterday session at midnight
  await db.$client.query(
    `UPDATE voice_sessions
                     SET left_at = $1, duration_minutes = $2
                     WHERE id = $3`,
    [startOfToday, durationUntilMidnight, yesterdaySession.id]
  );

  // Calculate and award points for yesterday's portion (NO ROUNDING for midnight crossover)
  const yesterdayPointsResult = await calculateAndAwardPoints(
    discordId,
    durationUntilMidnight,
    member,
    0,
    false
  );
  const yesterdayPoints =
    typeof yesterdayPointsResult === "object"
      ? yesterdayPointsResult.pointsEarned
      : yesterdayPointsResult;

  // Update daily stats for yesterday
  await updateDailyStats(
    discordId,
    durationUntilMidnight,
    yesterdayPoints
  );

  // Start a new session for today
  const todaySession = await startVoiceSession(
    discordId,
    member?.user?.username || yesterdaySession.discord_id,
    voiceChannelId,
    yesterdaySession.voice_channel_name
  );

  // Send midnight notification
  if (member) {
    try {
      const midnightMessage = `🌅 **New Day, Fresh Start!**\n\nIt's now ${dayjs().format("MMM DD, YYYY")} and your daily voice time limit has reset!\n\n**Yesterday:** Earned ${yesterdayPoints} points for ${(durationUntilMidnight / 60).toFixed(1)} hours • **Today:** You can now earn points for up to 15 more hours\n\n✨ **Keep up the great momentum!**`;
      await member.send(midnightMessage);
    } catch (error) {
      console.log(
        `Could not send midnight notification to ${discordId}: ${error}`
      );
    }
  }

  console.log(
    `🌅 Midnight crossover handled for ${discordId}: Yesterday ${(durationUntilMidnight / 60).toFixed(1)}h, new session started`
  );

  return {
    yesterdaySession: {
      ...yesterdaySession,
      duration_minutes: durationUntilMidnight,
      left_at: startOfToday,
      points_earned: yesterdayPoints,
    },
    todaySession: todaySession,
  };
}

// Get user's daily voice time for limit checking (timezone-aware)
async function getUserDailyTime(discordId: string, date: string | null = null) {
  try {
    // Use user's timezone for accurate date calculation
    const targetDate =
      date || (await getTodayInUserTimezone(discordId));
    // Get user's timezone for accurate limit calculations
    const userTimezone = await fetchUserTimezone(discordId);

    // COMPATIBLE WITH DAILY CUMULATIVE POINTS SYSTEM:
    // Query both current and archived daily stats to get accurate daily totals
    const result = await db.$client.query(
      `SELECT total_minutes FROM daily_voice_stats
                     WHERE discord_id = $1 AND date = $2
                     AND (archived IS NULL OR archived = false)`,
      [discordId, targetDate]
    );

    const dailyMinutes = result.rows[0]?.total_minutes || 0;
    const dailyHours = (dailyMinutes || 0) / 60;

    // Use centralized daily limit calculation with timezone awareness
    const limitInfo = calculateDailyLimitInfo(dailyHours, 15, userTimezone);

    return {
      dailyMinutes,
      dailyHours: limitInfo.dailyHours,
      remainingHours: limitInfo.remainingHours,
      allowanceHoursRemaining: limitInfo.allowanceHoursRemaining,
      hoursUntilMidnight: limitInfo.hoursUntilMidnight,
      limitReached: limitInfo.limitReached,
      canEarnPoints: limitInfo.canEarnPoints,
    };
  } catch (error) {
    console.error("Error getting user daily time:", error);
    throw error;
  }
}

// Update user streak (only increment once per day) - timezone-aware
async function updateStreak(discordId: string, sessionDate: number, userTimezone: string | null = null) {
  try {
    const user = await db.$client.query(
      "SELECT * FROM users WHERE discord_id = $1",
      [discordId]
    );

    if (user.rows.length === 0) return;

    const userData = user.rows[0];

    // Get user's timezone if not provided
    const timezone = userTimezone || userData.timezone || "UTC";

    // Use timezone-aware date comparisons
    const today = dayjs(sessionDate).tz(timezone);
    const lastVcDate = userData.last_vc_date
      ? dayjs(userData.last_vc_date).tz(timezone)
      : null;

    let newStreak = userData.current_streak;
    let shouldUpdateLastVcDate = false;

    if (!lastVcDate) {
      // First time joining VC
      newStreak = 1;
      shouldUpdateLastVcDate = true;
    } else {
      const daysDiff = today.diff(lastVcDate, "day");

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
        console.log(
          `🔥 Streak maintained for ${discordId}: ${newStreak} days (same day session in ${timezone})`
        );
        return; // No database update needed
      }
    }

    const newLongestStreak = Math.max(userData.longest_streak, newStreak);

    // Only update if streak changed or it's a new day
    if (shouldUpdateLastVcDate) {
      await db.$client.query(
        `UPDATE users
                     SET current_streak = $1, longest_streak = $2, last_vc_date = $3, updated_at = CURRENT_TIMESTAMP
                     WHERE discord_id = $4`,
        [newStreak, newLongestStreak, sessionDate, discordId]
      );

      console.log(
        `🔥 Streak updated for ${discordId}: ${newStreak} days (timezone: ${timezone})`
      );
    }
  } catch (error) {
    console.error("Error updating streak:", error);
    throw error;
  }
}

// ========================================================================
// OPTIMIZED METHODS USING DATABASE VIEWS (40-60% PERFORMANCE IMPROVEMENT)
// ========================================================================

// Get user voice stats using optimized view (replaces getUserStats)
export async function getUserStatsOptimized(discordId: string) {
  // Check and perform monthly reset if needed
  await checkAndPerformMonthlyReset(discordId);

  // Single query using optimized view - replaces 4+ separate queries
  const result = await db.$client.query(
    "SELECT * FROM user_complete_profile WHERE discord_id = $1",
    [discordId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const data = result.rows[0];

  // Get daily limit information
  const dailyLimitInfo = await getUserDailyTime(discordId);

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
      longest_streak: data.longest_streak,
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
      canEarnPoints: dailyLimitInfo.canEarnPoints,
    },
    thisMonth: {
      minutes: data.month_minutes || 0,
      sessions: data.month_sessions || 0,
      points: data.monthly_points,
      hours: parseFloat(data.monthly_hours) || 0,
    },
    allTime: {
      minutes:
        (parseFloat(data.all_time_hours) + parseFloat(data.monthly_hours)) *
        60,
      sessions: data.month_sessions || 0, // Approximation
      points: data.total_all_time_points,
      hours: parseFloat(data.total_all_time_hours) || 0,
    },
    tasks: {
      total: data.total_tasks || 0,
      completed: data.completed_tasks || 0,
      pending: data.pending_tasks || 0,
      points: data.total_task_points || 0,
    },
    isCurrentlyInVoice: data.currently_in_voice,
  };

  return optimizedResult;
}

// Get leaderboard using optimized views
export async function getLeaderboardOptimized(type = "monthly") {
  let result;

  if (type === "monthly") {
    // Use monthly_leaderboard view - single optimized query
    result = await db.$client.query("SELECT * FROM monthly_leaderboard");
  } else {
    // Use alltime_leaderboard view - single optimized query
    result = await db.$client.query("SELECT * FROM alltime_leaderboard");
  }

  const optimizedResult = result.rows.map((entry) => ({
    rank: entry.rank,
    discord_id: entry.discord_id,
    username: entry.username || "Unknown User",
    house: entry.house,
    hours: parseFloat(entry.hours) || 0,
    points: parseInt(entry.points) || 0,
  }));

  return optimizedResult;
}

// Get house leaderboard using optimized views
export async function getHouseLeaderboardOptimized(type: "monthly" | "alltime" = "monthly") {
  // Use house_leaderboard_with_champions view - single optimized query
  const result = await db.$client.query(
    "SELECT * FROM house_leaderboard_with_champions"
  );

  const optimizedResult = result.rows.map((entry) => ({
    rank: parseInt(entry.house_rank) || 0,
    name: entry.house_name,
    points:
      type === "monthly"
        ? parseInt(entry.house_monthly_points) || 0
        : parseInt(entry.house_all_time_points) || 0,
    monthlyPoints: parseInt(entry.house_monthly_points) || 0,
    allTimePoints: parseInt(entry.house_all_time_points) || 0,
    champion: {
      discord_id: entry.champion_discord_id,
      username: entry.champion_username,
      points: parseInt(entry.champion_points) || 0,
    },
  }));

  return optimizedResult;
}



/**
 * Reset daily voice statistics for a user
 * Called by centralResetService for timezone-aware daily resets
 * @param {string} discordId - Discord user ID
 * @returns {Promise<boolean>} Success status
 */
export async function resetDailyStats(discordId: string): Promise<boolean> {
  // Reset daily voice stats and limits
  const result = await db.$client.query(
    `
      UPDATE users
      SET
          daily_hours = 0,
          daily_limit_reached = false,
          last_daily_reset_tz = NOW()
      WHERE discord_id = $1
      RETURNING discord_id`,
    [discordId]
  );

  if (result.rowCount === 0) {
    throw new Error(`User ${discordId} not found for daily reset`);
  }

  console.debug("Daily voice stats reset successfully", {
    userId: discordId,
    timestamp: new Date().toISOString(),
  });

  return true;
}
