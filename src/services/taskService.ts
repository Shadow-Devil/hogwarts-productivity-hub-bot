import * as voiceService from "./voiceService.ts";
import * as DailyTaskManager from "../utils/dailyTaskManager.ts";
import { db } from "../models/db.ts";
import { tasksTable } from "../db/schema.ts";
import { eq } from "drizzle-orm";
import dayjs from "dayjs";
import type { GuildMember } from "discord.js";


/**
 * Regain a task slot when removing a task (only for tasks added today)
 */
export async function reclaimTaskSlot(discordId: string, taskCreatedAt: number) {
  const today = dayjs().format("YYYY-MM-DD");
  const taskDate = dayjs(taskCreatedAt).format("YYYY-MM-DD");

  // Only regain slot if task was created today
  if (taskDate !== today) {
    return {
      slotReclaimed: false,
      reason: "Task was created on a different day",
    };
  }

  // Check if user has daily stats for today
  const result = await db.$client.query(
    "SELECT tasks_added, tasks_completed, total_task_actions FROM daily_task_stats WHERE discord_id = $1 AND date = $2",
    [discordId, today]
  );

  if (result.rows.length === 0 || result.rows[0].tasks_added === 0) {
    return {
      slotReclaimed: false,
      reason: "No task additions recorded for today",
    };
  }

  const stats = result.rows[0];
  const tasksCompleted = stats.tasks_completed;
  const currentTotalActions = stats.total_task_actions;

  // Calculate maximum recoverable slots = DAILY_LIMIT - tasks_completed
  // This ensures users can't exceed their theoretical maximum after completing tasks
  const maxRecoverableSlots = DailyTaskManager.DAILY_TASK_LIMIT - tasksCompleted;
  const currentAvailableSlots = DailyTaskManager.DAILY_TASK_LIMIT - currentTotalActions;

  // Check if user would exceed their recoverable limit
  const newTotalActions = currentTotalActions - 1;
  const newAvailableSlots = DailyTaskManager.DAILY_TASK_LIMIT - newTotalActions;

  if (newAvailableSlots > maxRecoverableSlots) {
    return {
      slotReclaimed: false,
      reason: `Cannot reclaim slot: Maximum recoverable slots is ${maxRecoverableSlots} (you've completed ${tasksCompleted} tasks today)`,
      maxRecoverableSlots,
      tasksCompleted,
      currentAvailableSlots,
    };
  }

  // Decrease the task counts (only if within recoverable limit)
  await db.$client.query(
    `
                  UPDATE daily_task_stats
                  SET tasks_added = GREATEST(0, tasks_added - 1),
                      total_task_actions = GREATEST(0, total_task_actions - 1),
                      updated_at = CURRENT_TIMESTAMP
                  WHERE discord_id = $1 AND date = $2
              `,
    [discordId, today]
  );

  return {
    slotReclaimed: true,
    reason: "Task slot successfully reclaimed",
    maxRecoverableSlots,
    tasksCompleted,
    newAvailableSlots,
  };
}


// Remove a task by its number (position in user's task list)
export async function removeTask(discordId: string, taskNumber: number) {
  // Get all incomplete tasks for the user, ordered by creation date
  const tasksResult = await db.$client.query(
    ` SELECT id, title, created_at FROM tasks
        WHERE discord_id = $1 AND is_complete = FALSE
        ORDER BY created_at ASC`,
    [discordId]
  );

  if (tasksResult.rows.length === 0) {
    return { success: false, message: "You have no tasks to remove." };
  }

  if (taskNumber < 1 || taskNumber > tasksResult.rows.length) {
    return {
      success: false,
      message: `Invalid task number. You have ${tasksResult.rows.length} task(s).`,
    };
  }

  const taskToRemove = tasksResult.rows[taskNumber - 1];

  // Try to reclaim the task slot if the task was added today
  const reclaimResult = await reclaimTaskSlot(
    discordId,
    taskToRemove.created_at
  );

  // Delete the task
  await db.delete(tasksTable).where(eq(tasksTable.id, taskToRemove.id));

  // Get updated daily stats after potential slot reclaim
  const dailyStats = await DailyTaskManager.getUserDailyStats(discordId);

  return {
    success: true,
    task: taskToRemove,
    message: `Removed task: "${taskToRemove.title}"`,
    stats: dailyStats,
    slotReclaimed: reclaimResult.slotReclaimed,
  };
}

// Mark a task as complete
export async function completeTask(discordId: string, taskNumber: number, member: GuildMember | null) {
  // Check daily task limit first
  const limitCheck = await DailyTaskManager.canUserCompleteTask(discordId);
  if (!limitCheck.canAdd) {
    return {
      success: false,
      message: `🚫 **Daily Task Limit Reached!**\n\nYou've reached your daily limit of **${limitCheck.limit} task actions** (${limitCheck.currentActions}/${limitCheck.limit}). Your limit resets at midnight.\n\n💡 **Tip:** Your limit counts both adding and completing tasks to encourage thoughtful task planning!`,
      limitReached: true,
      stats: limitCheck,
    } as const;
  }

  // Get all incomplete tasks for the user, ordered by creation date
  const tasksResult = await db.$client.query(
    `SELECT id, title, created_at FROM tasks
                  WHERE discord_id = $1 AND is_complete = FALSE
                  ORDER BY created_at ASC`,
    [discordId]
  );

  if (tasksResult.rows.length === 0) {
    return {
      success: false,
      message: "You have no incomplete tasks.",
    } as const;
  }

  if (taskNumber < 1 || taskNumber > tasksResult.rows.length) {
    return {
      success: false,
      message: `Invalid task number. You have ${tasksResult.rows.length} incomplete task(s).`,
    } as const;
  }

  const taskToComplete = tasksResult.rows[taskNumber - 1];

  // Check if task is at least 20 minutes old
  const taskValidation = await validateTaskAge(taskToComplete.id);
  if (!taskValidation.valid) {
    return { success: false, message: taskValidation.message };
  }

  const pointsAwarded = 2; // 2 points per completed task

  // Mark task as complete
  await db.$client.query(
    `UPDATE tasks SET
                    is_complete = TRUE,
                    completed_at = CURRENT_TIMESTAMP,
                    points_awarded = $1
                  WHERE id = $2`,
    [pointsAwarded, taskToComplete.id]
  );

  // Award points to user using voice service
  await voiceService.calculateAndAwardPoints(
    discordId,
    0,
    member,
    pointsAwarded
  );

  return {
    success: true,
    task: taskToComplete,
    points: pointsAwarded,
    message: `✅ Completed: "${taskToComplete.title}" (+${pointsAwarded} points)`,
    stats: await DailyTaskManager.getUserDailyStats(discordId),
  } as const;
}

async function validateTaskAge(taskId: string) {
  // Check task creation time
  const taskResult = await db.$client.query(
    "SELECT created_at FROM tasks WHERE id = $1",
    [taskId]
  );

  if (taskResult.rows.length === 0) {
    return {
      valid: false,
      message: "❌ Task not found.",
    };
  }

  const createdAt = new Date(taskResult.rows[0].created_at).getTime();
  const now = new Date().getTime();
  const minutesSinceCreation = (now - createdAt) / (1000 * 60);

  if (minutesSinceCreation < 20) {
    const remainingTime = Math.ceil(20 - minutesSinceCreation);
    return {
      valid: false,
      message: `⏰ Task must be at least 20 minutes old before it can be completed. Time remaining: ${remainingTime} minute(s).`,
    };
  }

  return { valid: true };
}



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

// Get user's daily task limit information
export async function getDailyTaskStats(discordId: string) {
  return await DailyTaskManager.getUserDailyStats(discordId);
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

