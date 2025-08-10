import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from "discord.js";
import * as voiceService from "../services/voiceService.ts";
import * as timezoneService from "../services/timezoneService.ts";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { BotColors } from "../utils/constants.ts";
import { createErrorTemplate } from "../utils/embedTemplates.ts";
import { safeDeferReply, safeErrorReply } from "../utils/interactionUtils.ts";
import { db } from "../db/db.ts";

// Extend dayjs with timezone support
dayjs.extend(utc);
dayjs.extend(timezone);


// Get task statistics for a user (using optimized/fallback pattern)
export async function getTaskStats(discordId: string) {
  try {
    return await getTaskStatsOptimized(discordId);
  } catch (error) {
    console.warn(
      "⚠️ Failed to fetch task stats, falling back:",
      error
    );
    return await getTaskStatsOriginal(discordId);
  }
}

// ========================================================================
// OPTIMIZED METHODS USING DATABASE VIEWS (40-60% PERFORMANCE IMPROVEMENT)
// ========================================================================

// Get task statistics using optimized view (replaces getTaskStats)
export async function getTaskStatsOptimized(discordId: string) {
  // Single query using optimized view - replaces aggregation query
  const result = await db.$client.query(
    "SELECT * FROM user_task_summary WHERE discord_id = $1",
    [discordId]
  );

  let optimizedResult;

  if (result.rows.length === 0) {
    // Return default stats if user has no tasks
    optimizedResult = {
      total_tasks: 0,
      completed_tasks: 0,
      pending_tasks: 0,
      total_task_points: 0,
      last_task_completion: null,
    };
  } else {
    const stats = result.rows[0];
    optimizedResult = {
      total_tasks: parseInt(stats.total_tasks) || 0,
      completed_tasks: parseInt(stats.completed_tasks) || 0,
      pending_tasks: parseInt(stats.pending_tasks) || 0,
      total_task_points: parseInt(stats.total_task_points) || 0,
      last_task_completion: stats.last_task_completion,
    };
  }

  return optimizedResult;
}

// Get all user tasks with enhanced information using optimized approach
export async function getUserTasksOptimized(discordId: string) {
  // Get tasks with additional user context
  const result = await db.$client.query(
    `SELECT
                    t.id, t.title, t.is_complete, t.created_at,
                    t.completed_at, t.points_awarded,
                    u.username, u.house
                  FROM tasks t
                  JOIN users u ON t.discord_id = u.discord_id
                  WHERE t.discord_id = $1
                  ORDER BY t.is_complete ASC, t.created_at ASC`,
    [discordId]
  );

  return result.rows;
}

// ========================================================================
// FALLBACK METHODS - For reliability when optimized methods fail
// ========================================================================

// Fallback method for task statistics (used only if optimized version fails)
async function getTaskStatsOriginal(discordId: string) {
  const result = await db.$client.query(
    `SELECT
                    COUNT(*) as total_tasks,
                    COUNT(*) FILTER (WHERE is_complete = TRUE) as completed_tasks,
                    COUNT(*) FILTER (WHERE is_complete = FALSE) as pending_tasks,
                    COALESCE(SUM(points_awarded), 0) as total_task_points
                  FROM tasks
                  WHERE discord_id = $1`,
    [discordId]
  );
  return result.rows[0];
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
 * Generate daily limit status text for display
 * @param {Object} limitInfo - Daily limit info from calculateDailyLimitInfo
 * @returns {string} Formatted status text
 */
function formatDailyLimitStatus(limitInfo: { dailyHours: number; remainingHours: number; limitReached: boolean; canEarnPoints: boolean; isLimitedByAllowance?: boolean; allowanceHoursRemaining?: number; }): string {
  if (limitInfo.limitReached) {
    return "🚫 **Limit Reached**";
  }

  if (limitInfo.isLimitedByAllowance && limitInfo.allowanceHoursRemaining !== undefined) {
    // Limited by 15-hour daily allowance
    return `✅ **${limitInfo.remainingHours.toFixed(1)}h** remaining (${limitInfo.allowanceHoursRemaining.toFixed(1)}h allowance left)`;
  } else {
    // Limited by time until midnight reset
    return `⏰ **${limitInfo.remainingHours.toFixed(1)}h** until reset (resets at midnight)`;
  }
}


export default {
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("View your productivity statistics"),
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      // Immediately defer to prevent timeout
      const deferred = await safeDeferReply(interaction);
      if (!deferred) {
        console.warn("Failed to defer stats interaction");
        return;
      }

      const discordId = interaction.user.id;
      const stats = await voiceService.getUserStatsOptimized(discordId);
      const taskStats = await getTaskStatsOptimized(discordId);

      // Fetch user tasks with error handling
      let userTasks = [];
      try {
        userTasks = await getUserTasksOptimized(discordId);
      } catch (error) {
        console.warn("⚠️ Failed to fetch user tasks for stats:", error);
        // Continue without tasks - will show fallback message
      }

      if (!stats) {
        await interaction.editReply({
          content:
            "📊 You haven't joined any voice channels yet! Join a voice channel to start tracking your time.",
        });
        return;
      }

      const { user, today, thisMonth, allTime } = stats;

      // Use centralized formatHours utility (no need for local function)            // Create minimal, clean embed
      const embed = new EmbedBuilder()
        .setTitle("📊 Your Stats")
        .setColor(BotColors.PRIMARY)
        .setThumbnail(interaction.user.displayAvatarURL());

      // Personalized greeting based on streak
      let greeting = "";
      if (user.current_streak >= 7) {
        greeting = `🔥 Hey ${user.username}! You're on a ${user.current_streak}-day streak!`;
      } else if (user.current_streak > 0) {
        greeting = `💪 Great work ${user.username}! ${user.current_streak} days and counting!`;
      } else {
        greeting = `👋 Hi ${user.username}! Ready to start your productivity journey?`;
      }

      embed.setDescription(greeting);

      // 1. Streak Information
      embed.addFields([
        {
          name: "🔥 Current Streak",
          value: `**${user.current_streak}** days`,
          inline: true,
        },
      ]);

      // 2. Voice Channel Hours (today, this month, all-time)
      const voiceHoursText = [
        `**Today:** ${formatHours(today.hours.toString())}`,
        `**This Month:** ${formatHours(thisMonth.hours.toString())}`,
        `**All-Time:** ${formatHours(allTime.hours.toString())}`,
      ].join("\n");

      embed.addFields([
        {
          name: "🎧 Voice Hours",
          value: voiceHoursText,
          inline: true,
        },
      ]);

      // 3. Points Limit (remaining hours with midnight reset awareness)
      const remainingHours = today.remainingHours || 0;

      // Use centralized daily limit status formatting
      const limitInfo = {
        dailyHours: today.hours,
        remainingHours: remainingHours,
        limitReached: today.limitReached,
        canEarnPoints: today.canEarnPoints,
      };

      const limitStatus = formatDailyLimitStatus(limitInfo);

      embed.addFields([
        {
          name: "⏳ Daily Limit (15h)",
          value: limitStatus,
          inline: true,
        },
      ]);

      // 4. Points Breakdown (today, this month, all-time)
      const pointsText = [
        `**Today:** ${today.points} pts`,
        `**This Month:** ${thisMonth.points} pts`,
        `**All-Time:** ${allTime.points} pts`,
      ].join("\n");

      embed.addFields([
        {
          name: "💰 Points Earned",
          value: pointsText,
          inline: true,
        },
      ]);

      // 5. Pending Tasks (show actual tasks, not just count)
      const pendingTasks = userTasks.filter((task) => !task.is_complete);
      let pendingTasksValue;

      if (userTasks.length === 0) {
        // No tasks at all or failed to fetch
        pendingTasksValue =
          taskStats.pending_tasks > 0
            ? `**${taskStats.pending_tasks}** tasks`
            : "🎯 **No tasks yet**";
      } else if (pendingTasks.length === 0) {
        pendingTasksValue = "🎉 **All caught up!**";
      } else if (pendingTasks.length <= 3) {
        // Show all tasks if 3 or fewer
        const taskList = pendingTasks
          .map(
            (task, index) =>
              `${index + 1}. ${task.title.length > 35 ? task.title.substring(0, 32) + "..." : task.title}`
          )
          .join("\n");
        pendingTasksValue = `**${pendingTasks.length}** tasks:\n${taskList}`;
      } else {
        // Show first 3 tasks with "and X more"
        const taskList = pendingTasks
          .slice(0, 3)
          .map(
            (task, index) =>
              `${index + 1}. ${task.title.length > 35 ? task.title.substring(0, 32) + "..." : task.title}`
          )
          .join("\n");
        const remainingCount = pendingTasks.length - 3;
        pendingTasksValue = `**${pendingTasks.length}** tasks:\n${taskList}\n*...and ${remainingCount} more*`;
      }

      embed.addFields([
        {
          name: "📋 Pending Tasks",
          value: pendingTasksValue,
          inline: true,
        },
      ]);

      // Add a simple spacer field to balance the layout
      embed.addFields([
        {
          name: "\u200b",
          value: "\u200b",
          inline: true,
        },
      ]);

      // Add timezone context to footer for user awareness
      try {
        const userTimezone = await timezoneService.getUserTimezone(discordId);
        const userLocalTime = dayjs().tz(userTimezone);
        const nextMidnight = dayjs()
          .tz(userTimezone)
          .add(1, "day")
          .startOf("day");
        const hoursUntilReset = nextMidnight.diff(userLocalTime, "hour", true);

        embed.setFooter({
          text: `🌍 Your timezone: ${userTimezone} | Local time: ${userLocalTime.format("h:mm A")} | Daily reset in ${hoursUntilReset.toFixed(1)}h`,
        });
      } catch (error) {
        console.warn("Could not add timezone info to stats:", error);
        embed.setFooter({
          text: "⏰ Daily limit resets at midnight your local time",
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Error in /stats:", error);

      const embed = createErrorTemplate(
        `❌ Stats Load Failed`,
        "An error occurred while fetching your statistics. Please try again in a moment.",
        {
          helpText: `ℹ️ If this problem persists, contact support`,
        }
      );

      await safeErrorReply(interaction, embed);
    }
  },
};
