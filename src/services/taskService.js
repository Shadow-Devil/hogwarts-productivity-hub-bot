const { pool } = require('../models/db');
const { measureDatabase } = require('../utils/performanceMonitor');
const voiceService = require('./voiceService');

class TaskService {
    // Add a new task for a user
    async addTask(discordId, title) {
        return measureDatabase('addTask', async () => {
            const client = await pool.connect();
            try {
                // First ensure user exists in database
                await this.ensureUserExists(discordId, client);
                
                const result = await client.query(
                    `INSERT INTO tasks (user_id, discord_id, title)
                     VALUES ((SELECT id FROM users WHERE discord_id = $1), $1, $2)
                     RETURNING id, title, created_at`,
                    [discordId, title]
                );
                
                return result.rows[0];
            } catch (error) {
                console.error('Error adding task:', error);
                throw error;
            } finally {
                client.release();
            }
        })();
    }

    // Remove a task by its number (position in user's task list)
    async removeTask(discordId, taskNumber) {
        return measureDatabase('removeTask', async () => {
            const client = await pool.connect();
            try {
                // Get all incomplete tasks for the user, ordered by creation date
                const tasksResult = await client.query(
                    `SELECT id, title FROM tasks 
                     WHERE discord_id = $1 AND is_complete = FALSE 
                     ORDER BY created_at ASC`,
                    [discordId]
                );
                
                if (tasksResult.rows.length === 0) {
                    return { success: false, message: 'You have no tasks to remove.' };
                }
                
                if (taskNumber < 1 || taskNumber > tasksResult.rows.length) {
                    return { 
                        success: false, 
                        message: `Invalid task number. You have ${tasksResult.rows.length} task(s).` 
                    };
                }
                
                const taskToRemove = tasksResult.rows[taskNumber - 1];
                
                // Delete the task
                await client.query(
                    'DELETE FROM tasks WHERE id = $1',
                    [taskToRemove.id]
                );
                
                return { 
                    success: true, 
                    task: taskToRemove,
                    message: `Removed task: "${taskToRemove.title}"` 
                };
            } catch (error) {
                console.error('Error removing task:', error);
                throw error;
            } finally {
                client.release();
            }
        })();
    }

    // Get all tasks for a user
    async getUserTasks(discordId) {
        return measureDatabase('getUserTasks', async () => {
            const client = await pool.connect();
            try {
                const result = await client.query(
                    `SELECT id, title, is_complete, created_at, completed_at, points_awarded
                     FROM tasks 
                     WHERE discord_id = $1 
                     ORDER BY is_complete ASC, created_at ASC`,
                    [discordId]
                );
                
                return result.rows;
            } catch (error) {
                console.error('Error getting user tasks:', error);
                throw error;
            } finally {
                client.release();
            }
        })();
    }

    // Mark a task as complete
    async completeTask(discordId, taskNumber, member = null) {
        return measureDatabase('completeTask', async () => {
            const client = await pool.connect();
            try {
                // First, check if user is in a voice channel
                const voiceValidation = await this.validateVoiceChannelRequirements(discordId);
                if (!voiceValidation.valid) {
                    return { success: false, message: voiceValidation.message };
                }
                
                // Get all incomplete tasks for the user, ordered by creation date
                const tasksResult = await client.query(
                    `SELECT id, title, created_at FROM tasks 
                     WHERE discord_id = $1 AND is_complete = FALSE 
                     ORDER BY created_at ASC`,
                    [discordId]
                );
                
                if (tasksResult.rows.length === 0) {
                    return { success: false, message: 'You have no incomplete tasks.' };
                }
                
                if (taskNumber < 1 || taskNumber > tasksResult.rows.length) {
                    return { 
                        success: false, 
                        message: `Invalid task number. You have ${tasksResult.rows.length} incomplete task(s).` 
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
                    [pointsAwarded, taskToComplete.id]
                );
                
                // Award points to user using voice service
                await voiceService.calculateAndAwardPoints(discordId, 0, member, pointsAwarded);
                
                return { 
                    success: true, 
                    task: taskToComplete,
                    points: pointsAwarded,
                    message: `✅ Completed: "${taskToComplete.title}" (+${pointsAwarded} points)` 
                };
            } catch (error) {
                console.error('Error completing task:', error);
                throw error;
            } finally {
                client.release();
            }
        })();
    }

    // Validate voice channel requirements for task completion
    async validateVoiceChannelRequirements(discordId) {
        const client = await pool.connect();
        try {
            // Check if user has an active voice session
            const activeSessionResult = await client.query(
                `SELECT joined_at FROM vc_sessions 
                 WHERE discord_id = $1 AND left_at IS NULL 
                 ORDER BY joined_at DESC LIMIT 1`,
                [discordId]
            );
            
            if (activeSessionResult.rows.length === 0) {
                return { 
                    valid: false, 
                    message: '🚫 You must be in a voice channel to complete tasks.' 
                };
            }
            
            return { valid: true };
        } catch (error) {
            console.error('Error validating voice channel requirements:', error);
            return { 
                valid: false, 
                message: '❌ An error occurred while validating voice channel requirements.' 
            };
        } finally {
            client.release();
        }
    }

    // Validate task age requirements for task completion
    async validateTaskAge(taskId) {
        const client = await pool.connect();
        try {
            // Check task creation time
            const taskResult = await client.query(
                `SELECT created_at FROM tasks WHERE id = $1`,
                [taskId]
            );
            
            if (taskResult.rows.length === 0) {
                return { 
                    valid: false, 
                    message: '❌ Task not found.' 
                };
            }
            
            const createdAt = new Date(taskResult.rows[0].created_at);
            const now = new Date();
            const minutesSinceCreation = (now - createdAt) / (1000 * 60);
            
            if (minutesSinceCreation < 20) {
                const remainingTime = Math.ceil(20 - minutesSinceCreation);
                return { 
                    valid: false, 
                    message: `⏰ Task must be at least 20 minutes old before it can be completed. Time remaining: ${remainingTime} minute(s).` 
                };
            }
            
            return { valid: true };
        } catch (error) {
            console.error('Error validating task age:', error);
            return { 
                valid: false, 
                message: '❌ An error occurred while validating task age requirements.' 
            };
        } finally {
            client.release();
        }
    }

    // Ensure user exists in database
    async ensureUserExists(discordId, client) {
        await client.query(
            `INSERT INTO users (discord_id, username) 
             VALUES ($1, $1) 
             ON CONFLICT (discord_id) DO NOTHING`,
            [discordId]
        );
    }

    // Get task statistics for a user
    async getTaskStats(discordId) {
        return measureDatabase('getTaskStats', async () => {
            const client = await pool.connect();
            try {
                const result = await client.query(
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
            } catch (error) {
                console.error('Error getting task stats:', error);
                throw error;
            } finally {
                client.release();
            }
        })();
    }
}

module.exports = new TaskService();
