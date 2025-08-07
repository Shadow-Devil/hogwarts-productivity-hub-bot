const { executeWithResilience } = require("../models/db");
const { measureDatabase } = require("../utils/performanceMonitor");
const queryCache = require("../utils/queryCache");
const voiceService = require("./voiceService");
const DailyTaskManager = require("../utils/dailyTaskManager");
const dailyTaskManager = new DailyTaskManager();
const BaseService = require("../utils/baseService");
const CacheInvalidationService = require("../utils/cacheInvalidationService");

class TaskService extends BaseService {
  constructor() {
    super("TaskService");
  }
  // Add a new task for a user
  async addTask(discordId, title) {
    return measureDatabase("addTask", async () => {
      // Check daily task limit first
      const limitCheck = await dailyTaskManager.canUserAddTask(discordId);
      if (!limitCheck.canAdd) {
        return {
          success: false,
          message: `🚫 **Daily Task Limit Reached!**\n\nYou've reached your daily limit of **${limitCheck.limit} tasks** (${limitCheck.currentActions}/${limitCheck.limit}). Your limit resets at midnight.\n\n💡 **Tip:** Focus on completing your existing tasks to earn points!`,
          limitReached: true,
          stats: limitCheck,
        };
      }

      return executeWithResilience(async (client) => {
        // First ensure user exists in database
        await this.ensureUserExists(discordId, client);

        const result = await client.query(
          `INSERT INTO tasks (user_id, discord_id, title)
                     VALUES ((SELECT id FROM users WHERE discord_id = $1), $1, $2)
                     RETURNING id, title, created_at`,
          [discordId, title],
        );

        // Record task action for daily limit tracking
        await dailyTaskManager.recordTaskAction(discordId, "add");

        // Smart cache invalidation for user-related data
        CacheInvalidationService.invalidateAfterTaskOperation(discordId);

        const task = result.rows[0];
        return {
          success: true,
          task,
          stats: await dailyTaskManager.getUserDailyStats(discordId),
        };
      });
    })();
  }

  // Remove a task by its number (position in user's task list)
  async removeTask(discordId, taskNumber) {
    return measureDatabase("removeTask", async () => {
      return executeWithResilience(async (client) => {
        // Get all incomplete tasks for the user, ordered by creation date
        const tasksResult = await client.query(
          `SELECT id, title, created_at FROM tasks
                     WHERE discord_id = $1 AND is_complete = FALSE
                     ORDER BY created_at ASC`,
          [discordId],
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
        const reclaimResult = await dailyTaskManager.reclaimTaskSlot(
          discordId,
          taskToRemove.created_at,
        );

        // Delete the task
        await client.query("DELETE FROM tasks WHERE id = $1", [
          taskToRemove.id,
        ]);

        // Smart cache invalidation for user-related data
        CacheInvalidationService.invalidateAfterTaskOperation(discordId);

        // Get updated daily stats after potential slot reclaim
        const dailyStats = await dailyTaskManager.getUserDailyStats(discordId);

        return {
          success: true,
          task: taskToRemove,
          message: `Removed task: "${taskToRemove.title}"`,
          stats: dailyStats,
          slotReclaimed: reclaimResult.slotReclaimed,
        };
      });
    })();
  }

  // Get all tasks for a user (using optimized/fallback pattern)
  async getUserTasks(discordId) {
    return this.executeWithFallback(
      "getUserTasks",
      this.getUserTasksOptimized.bind(this),
      this.getUserTasksOriginal.bind(this),
      discordId,
    );
  }

  // Mark a task as complete
  async completeTask(discordId, taskNumber, member = null) {
    return measureDatabase("completeTask", async () => {
      // Check daily task limit first
      const limitCheck = await dailyTaskManager.canUserCompleteTask(discordId);
      if (!limitCheck.canAdd) {
        return {
          success: false,
          message: `🚫 **Daily Task Limit Reached!**\n\nYou've reached your daily limit of **${limitCheck.limit} task actions** (${limitCheck.currentActions}/${limitCheck.limit}). Your limit resets at midnight.\n\n💡 **Tip:** Your limit counts both adding and completing tasks to encourage thoughtful task planning!`,
          limitReached: true,
          stats: limitCheck,
        };
      }

      return executeWithResilience(async (client) => {
        // Get all incomplete tasks for the user, ordered by creation date
        const tasksResult = await client.query(
          `SELECT id, title, created_at FROM tasks
                     WHERE discord_id = $1 AND is_complete = FALSE
                     ORDER BY created_at ASC`,
          [discordId],
        );

        if (tasksResult.rows.length === 0) {
          return { success: false, message: "You have no incomplete tasks." };
        }

        if (taskNumber < 1 || taskNumber > tasksResult.rows.length) {
          return {
            success: false,
            message: `Invalid task number. You have ${tasksResult.rows.length} incomplete task(s).`,
          };
        }

        const taskToComplete = tasksResult.rows[taskNumber - 1];

        // Check if task is at least 20 minutes old
        const taskValidation = await this.validateTaskAge(taskToComplete.id);
        if (!taskValidation.valid) {
          return { success: false, message: taskValidation.message };
        }

        const pointsAwarded = 2; // 2 points per completed task

        // Mark task as complete
        await client.query(
          `UPDATE tasks SET
                        is_complete = TRUE,
                        completed_at = CURRENT_TIMESTAMP,
                        points_awarded = $1
                     WHERE id = $2`,
          [pointsAwarded, taskToComplete.id],
        );

        // Record task action for daily limit tracking
        await dailyTaskManager.recordTaskAction(discordId, "complete");

        // Award points to user using voice service
        await voiceService.calculateAndAwardPoints(
          discordId,
          0,
          member,
          pointsAwarded,
        );

        // Smart cache invalidation for user-related data
        CacheInvalidationService.invalidateAfterTaskOperation(discordId);

        return {
          success: true,
          task: taskToComplete,
          points: pointsAwarded,
          message: `✅ Completed: "${taskToComplete.title}" (+${pointsAwarded} points)`,
          stats: await dailyTaskManager.getUserDailyStats(discordId),
        };
      });
    })();
  }

  // Validate voice channel requirements for task completion
  async validateVoiceChannelRequirements(discordId) {
    return executeWithResilience(async (client) => {
      // Check if user has an active voice session
      const activeSessionResult = await client.query(
        `SELECT joined_at FROM vc_sessions
                 WHERE discord_id = $1 AND left_at IS NULL
                 ORDER BY joined_at DESC LIMIT 1`,
        [discordId],
      );

      if (activeSessionResult.rows.length === 0) {
        return {
          valid: false,
          message: "🚫 You must be in a voice channel to complete tasks.",
        };
      }

      return { valid: true };
    });
  } // Validate task age requirements for task completion
  async validateTaskAge(taskId) {
    return executeWithResilience(async (client) => {
      // Check task creation time
      const taskResult = await client.query(
        "SELECT created_at FROM tasks WHERE id = $1",
        [taskId],
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
    });
  }

  // Ensure user exists in database
  async ensureUserExists(discordId, client) {
    await client.query(
      `INSERT INTO users (discord_id, username)
             VALUES ($1, $1)
             ON CONFLICT (discord_id) DO NOTHING`,
      [discordId],
    );
  }

  // Get task statistics for a user (using optimized/fallback pattern)
  async getTaskStats(discordId) {
    return this.executeWithFallback(
      "getTaskStats",
      this.getTaskStatsOptimized.bind(this),
      this.getTaskStatsOriginal.bind(this),
      discordId,
    );
  }

  // Get user's daily task limit information
  async getDailyTaskStats(discordId) {
    return await dailyTaskManager.getUserDailyStats(discordId);
  }

  // ========================================================================
  // OPTIMIZED METHODS USING DATABASE VIEWS (40-60% PERFORMANCE IMPROVEMENT)
  // ========================================================================

  // Get task statistics using optimized view (replaces getTaskStats)
  async getTaskStatsOptimized(discordId) {
    return measureDatabase("getTaskStatsOptimized", async () => {
      // Try cache first
      const cacheKey = `task_stats_optimized:${discordId}`;
      const cached = queryCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      return executeWithResilience(async (client) => {
        // Single query using optimized view - replaces aggregation query
        const result = await client.query(
          "SELECT * FROM user_task_summary WHERE discord_id = $1",
          [discordId],
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

        // Cache task stats for 2 minutes
        queryCache.set(cacheKey, optimizedResult, "taskStats");
        return optimizedResult;
      });
    })();
  }

  // Get all user tasks with enhanced information using optimized approach
  async getUserTasksOptimized(discordId) {
    return measureDatabase("getUserTasksOptimized", async () => {
      // Try cache first
      const cacheKey = `user_tasks_optimized:${discordId}`;
      const cached = queryCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      return executeWithResilience(async (client) => {
        // Get tasks with additional user context
        const result = await client.query(
          `SELECT
                        t.id, t.title, t.is_complete, t.created_at,
                        t.completed_at, t.points_awarded,
                        u.username, u.house
                     FROM tasks t
                     JOIN users u ON t.discord_id = u.discord_id
                     WHERE t.discord_id = $1
                     ORDER BY t.is_complete ASC, t.created_at ASC`,
          [discordId],
        );

        const tasks = result.rows;

        // Cache user tasks for 30 seconds
        queryCache.set(cacheKey, tasks, "userTasks");
        return tasks;
      });
    })();
  }

  // ========================================================================
  // FALLBACK METHODS - For reliability when optimized methods fail
  // ========================================================================

  // Fallback method for task statistics (used only if optimized version fails)
  async getTaskStatsOriginal(discordId) {
    return measureDatabase("getTaskStats", async () => {
      // Try cache first
      const cacheKey = `task_stats:${discordId}`;
      const cached = queryCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      return executeWithResilience(async (client) => {
        const result = await client.query(
          `SELECT
                        COUNT(*) as total_tasks,
                        COUNT(*) FILTER (WHERE is_complete = TRUE) as completed_tasks,
                        COUNT(*) FILTER (WHERE is_complete = FALSE) as pending_tasks,
                        COALESCE(SUM(points_awarded), 0) as total_task_points
                     FROM tasks
                     WHERE discord_id = $1`,
          [discordId],
        );

        const stats = result.rows[0];

        // Cache task stats for 2 minutes
        queryCache.set(cacheKey, stats, "taskStats");
        return stats;
      });
    })();
  }

  // Fallback method for user tasks (used only if optimized version fails)
  async getUserTasksOriginal(discordId) {
    return measureDatabase("getUserTasks", async () => {
      // Try cache first
      const cacheKey = `user_tasks:${discordId}`;
      const cached = queryCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      return executeWithResilience(async (client) => {
        const result = await client.query(
          `SELECT id, title, is_complete, created_at, completed_at, points_awarded
                     FROM tasks
                     WHERE discord_id = $1
                     ORDER BY is_complete ASC, created_at ASC`,
          [discordId],
        );

        const tasks = result.rows;

        // Cache user tasks for 30 seconds (tasks can change frequently)
        queryCache.set(cacheKey, tasks, "userTasks");
        return tasks;
      });
    })();
  }
}

export default new TaskService();
