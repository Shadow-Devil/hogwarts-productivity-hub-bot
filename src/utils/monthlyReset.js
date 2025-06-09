/**
 * Monthly reset utility for handling automatic monthly points and hours reset
 */

const { pool, checkAndPerformMonthlyReset } = require('../models/db');
const voiceService = require('../services/voiceService');
const dayjs = require('dayjs');

class MonthlyResetScheduler {
    constructor() {
        this.isRunning = false;
        this.intervalId = null;
    }

    // Start the monthly reset scheduler
    start() {
        if (this.isRunning) {
            console.log('📅 Monthly reset scheduler is already running');
            return;
        }

        // Check every hour for monthly resets
        this.intervalId = setInterval(async () => {
            await this.checkAllUsersForReset();
        }, 60 * 60 * 1000); // Every hour

        // Also run an initial check when starting
        setTimeout(async () => {
            await this.checkAllUsersForReset();
        }, 5000); // 5 seconds after startup

        this.isRunning = true;
        console.log('📅 Monthly reset scheduler started');
    }

    // Stop the scheduler
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
        console.log('📅 Monthly reset scheduler stopped');
    }

    // Check all users for monthly reset and daily streak validation
    async checkAllUsersForReset() {
        const client = await pool.connect();
        try {
            const currentMonth = dayjs().startOf('month');
            
            // 1. Check for monthly resets
            const usersNeedingReset = await client.query(`
                SELECT discord_id 
                FROM users 
                WHERE last_monthly_reset IS NULL 
                   OR last_monthly_reset < $1
            `, [currentMonth.format('YYYY-MM-DD')]);

            console.log(`📅 Checking ${usersNeedingReset.rows.length} users for monthly reset`);

            // Process each user's monthly reset
            for (const user of usersNeedingReset.rows) {
                try {
                    await checkAndPerformMonthlyReset(user.discord_id);
                } catch (error) {
                    console.error(`❌ Error performing monthly reset for ${user.discord_id}:`, error);
                }
            }

            if (usersNeedingReset.rows.length > 0) {
                console.log(`✅ Completed monthly reset check for ${usersNeedingReset.rows.length} users`);
            }

            // 2. Check for daily streak resets (users who missed yesterday)
            try {
                const streaksReset = await voiceService.checkAllStreaks();
                if (streaksReset > 0) {
                    console.log(`🔥 Daily streak check: Reset ${streaksReset} user streaks for missed days`);
                }
            } catch (error) {
                console.error('❌ Error in daily streak check:', error);
            }

        } catch (error) {
            console.error('❌ Error in monthly reset scheduler:', error);
        } finally {
            client.release();
        }
    }

    // Manually trigger reset for all users (admin function)
    async forceResetAllUsers() {
        const client = await pool.connect();
        try {
            const allUsers = await client.query('SELECT discord_id FROM users');
            
            console.log(`🔄 Force resetting ${allUsers.rows.length} users`);
            
            for (const user of allUsers.rows) {
                try {
                    await checkAndPerformMonthlyReset(user.discord_id);
                } catch (error) {
                    console.error(`❌ Error force resetting ${user.discord_id}:`, error);
                }
            }
            
            console.log('✅ Force reset completed for all users');
        } catch (error) {
            console.error('❌ Error in force reset:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Get scheduler status
    getStatus() {
        return {
            isRunning: this.isRunning,
            nextCheck: this.isRunning ? 'Within 1 hour' : 'Not scheduled'
        };
    }
}

// Create singleton instance
const monthlyResetScheduler = new MonthlyResetScheduler();

module.exports = monthlyResetScheduler;
