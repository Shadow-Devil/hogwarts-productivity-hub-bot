const { pool, executeWithResilience } = require('../models/db');
const { measureDatabase } = require('./performanceMonitor');
const dayjs = require('dayjs');

/**
 * Session Recovery System
 * Handles crash recovery, periodic session saves, and graceful shutdowns
 */
class SessionRecovery {
    constructor() {
        this.isShuttingDown = false;
        this.periodicSaveInterval = null;
        this.activeVoiceSessions = null; // Will be set from voiceStateUpdate

        // Configuration
        this.config = {
            saveIntervalMs: 2 * 60 * 1000,      // Save every 2 minutes
            maxSessionDurationHours: 12,        // Consider sessions over 12h as stale
            recoveryGracePeriodMs: 5 * 60 * 1000 // 5 minutes grace period for recovery
        };

        this.setupGracefulShutdown();
    }

    /**
     * Initialize the session recovery system
     */
    async initialize(activeVoiceSessionsMap) {
        this.activeVoiceSessions = activeVoiceSessionsMap;

        // Recover any incomplete sessions from previous runs
        const recoveredSessions = await this.recoverIncompleteSessions();

        // Start periodic session state saving
        this.startPeriodicSaving();

        console.log('🛡️ Session recovery system initialized');

        return {
            recoveredSessions: recoveredSessions || 0,
            isInitialized: true
        };
    }

    /**
     * Recover incomplete sessions from database on startup
     */
    async recoverIncompleteSessions() {
        return measureDatabase('recoverIncompleteSessions', async () => {
            return executeWithResilience(async (client) => {
                const now = new Date();
                const maxSessionDuration = new Date(now.getTime() - (this.config.maxSessionDurationHours * 60 * 60 * 1000));

                // Find sessions that are still marked as active but were likely interrupted
                const incompleteSessionsResult = await client.query(`
                    SELECT id, discord_id, voice_channel_id, voice_channel_name, joined_at, last_heartbeat
                    FROM vc_sessions
                    WHERE left_at IS NULL
                    AND joined_at > $1
                    ORDER BY joined_at DESC
                `, [maxSessionDuration]);

                const incompleteSessions = incompleteSessionsResult.rows;

                if (incompleteSessions.length === 0) {
                    console.log('✅ No incomplete sessions found during recovery');
                    return 0;
                }

                console.log(`🔄 Found ${incompleteSessions.length} incomplete sessions to recover`);

                for (const session of incompleteSessions) {
                    await this.processIncompleteSession(client, session, now);
                }

                console.log(`✅ Session recovery completed for ${incompleteSessions.length} sessions`);
                return incompleteSessions.length;
            });
        })();
    }

    /**
     * Process a single incomplete session
     */
    async processIncompleteSession(client, session, now) {
        const joinedAt = new Date(session.joined_at);
        const lastHeartbeat = session.last_heartbeat ? new Date(session.last_heartbeat) : joinedAt;

        // Calculate session duration up to last known heartbeat
        const estimatedEndTime = new Date(lastHeartbeat.getTime() + this.config.recoveryGracePeriodMs);
        const sessionDurationMs = Math.min(estimatedEndTime.getTime(), now.getTime()) - joinedAt.getTime();
        const sessionDurationMinutes = Math.max(0, Math.floor(sessionDurationMs / (1000 * 60)));

        if (sessionDurationMinutes < 1) {
            // Session was too short, just mark as completed with 0 duration
            await client.query(`
                UPDATE vc_sessions
                SET left_at = $1, duration_minutes = 0, recovery_note = 'Recovered: Session too short'
                WHERE id = $2
            `, [estimatedEndTime, session.id]);

            console.log(`🔄 Recovered short session for ${session.discord_id}: 0 minutes`);
            return;
        }

        // Update the session with estimated end time and duration
        await client.query(`
            UPDATE vc_sessions
            SET left_at = $1, duration_minutes = $2, recovery_note = 'Recovered from crash'
            WHERE id = $3
        `, [estimatedEndTime, sessionDurationMinutes, session.id]);

        // Calculate and award points for the recovered session
        const voiceService = require('../services/voiceService');
        try {
            const pointsEarned = await voiceService.calculateAndAwardPoints(
                session.discord_id,
                sessionDurationMinutes
            );

            // Update daily stats
            const sessionDate = dayjs(session.joined_at).format('YYYY-MM-DD');
            await voiceService.updateDailyStats(
                session.discord_id,
                sessionDate,
                sessionDurationMinutes,
                pointsEarned
            );

            console.log(`🔄 Recovered session for ${session.discord_id}: ${sessionDurationMinutes} minutes, ${pointsEarned} points`);
        } catch (error) {
            console.error(`❌ Error awarding points for recovered session ${session.id}:`, error);
        }
    }

    /**
     * Start periodic saving of session states
     */
    startPeriodicSaving() {
        if (this.periodicSaveInterval) {
            clearInterval(this.periodicSaveInterval);
        }

        this.periodicSaveInterval = setInterval(async () => {
            if (!this.isShuttingDown && this.activeVoiceSessions) {
                await this.saveActiveSessionStates();
            }
        }, this.config.saveIntervalMs);

        console.log(`🕐 Started periodic session saving every ${this.config.saveIntervalMs / 1000} seconds`);
    }

    /**
     * Save current state of all active sessions (heartbeat)
     */
    async saveActiveSessionStates() {
        if (!this.activeVoiceSessions || this.activeVoiceSessions.size === 0) {
            return;
        }

        return measureDatabase('saveActiveSessionStates', async () => {
            return executeWithResilience(async (client) => {
                const now = new Date();
                const activeSessions = Array.from(this.activeVoiceSessions.entries());

                for (const [userId, sessionData] of activeSessions) {
                    try {
                        // Calculate current session duration
                        const durationMs = now.getTime() - sessionData.joinTime.getTime();
                        const durationMinutes = Math.floor(durationMs / (1000 * 60));

                        // Update the session with current progress (heartbeat)
                        await client.query(`
                            UPDATE vc_sessions
                            SET last_heartbeat = $1, current_duration_minutes = $2
                            WHERE id = $3 AND left_at IS NULL
                        `, [now, durationMinutes, sessionData.sessionId]);

                    } catch (error) {
                        console.error(`❌ Error updating session heartbeat for user ${userId}:`, error);
                    }
                }

                console.log(`💓 Updated heartbeat for ${activeSessions.length} active sessions`);
            });
        })();
    }

    /**
     * Handle graceful shutdown - close all active sessions properly
     */
    async handleGracefulShutdown() {
        if (this.isShuttingDown) return;

        console.log('🛑 Graceful shutdown initiated - closing active voice sessions...');
        this.isShuttingDown = true;

        // Stop periodic saving
        if (this.periodicSaveInterval) {
            clearInterval(this.periodicSaveInterval);
            this.periodicSaveInterval = null;
        }

        // Close all active sessions
        if (this.activeVoiceSessions && this.activeVoiceSessions.size > 0) {
            await this.closeAllActiveSessions();
        }

        console.log('✅ Graceful shutdown completed');
    }

    /**
     * Close all currently active sessions during shutdown
     */
    async closeAllActiveSessions() {
        return measureDatabase('closeAllActiveSessions', async () => {
            return executeWithResilience(async (client) => {
                const now = new Date();
                const activeSessions = Array.from(this.activeVoiceSessions.entries());
                const voiceService = require('../services/voiceService');

                console.log(`🔄 Closing ${activeSessions.length} active sessions during shutdown...`);

                for (const [userId, sessionData] of activeSessions) {
                    try {
                        // Calculate session duration
                        const durationMs = now.getTime() - sessionData.joinTime.getTime();
                        const durationMinutes = Math.floor(durationMs / (1000 * 60));

                        // Update the session in database
                        await client.query(`
                            UPDATE vc_sessions
                            SET left_at = $1, duration_minutes = $2, recovery_note = 'Graceful shutdown'
                            WHERE id = $3 AND left_at IS NULL
                        `, [now, durationMinutes, sessionData.sessionId]);

                        // Award points if session was long enough
                        if (durationMinutes > 0) {
                            const pointsEarned = await voiceService.calculateAndAwardPoints(userId, durationMinutes);

                            // Update daily stats
                            const sessionDate = dayjs(sessionData.joinTime).format('YYYY-MM-DD');
                            await voiceService.updateDailyStats(userId, sessionDate, durationMinutes, pointsEarned);

                            console.log(`✅ Closed session for ${userId}: ${durationMinutes} minutes, ${pointsEarned} points`);
                        }

                    } catch (error) {
                        console.error(`❌ Error closing session for user ${userId}:`, error);
                    }
                }

                // Clear the active sessions map
                this.activeVoiceSessions.clear();
            });
        })();
    }

    /**
     * Setup graceful shutdown handlers
     */
    setupGracefulShutdown() {
        // Note: SIGINT/SIGTERM are handled by main index.js shutdown()
        // This only handles unexpected crashes and exceptions

        // Handle uncaught exceptions
        process.on('uncaughtException', async (error) => {
            console.error('💥 Uncaught Exception:', error);
            try {
                await this.handleGracefulShutdown();
            } catch (shutdownError) {
                console.error('❌ Error during emergency shutdown:', shutdownError);
            }
            process.exit(1);
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', async (reason, promise) => {
            console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
            try {
                await this.handleGracefulShutdown();
            } catch (shutdownError) {
                console.error('❌ Error during emergency shutdown:', shutdownError);
            }
            process.exit(1);
        });
    }

    /**
     * Force save current session states (for manual calls)
     */
    async forceSave() {
        console.log('🔄 Force saving session states...');
        await this.saveActiveSessionStates();
        console.log('✅ Force save completed');
    }

    /**
     * Get recovery statistics
     */
    getRecoveryStats() {
        return {
            isInitialized: this.activeVoiceSessions !== null,
            isShuttingDown: this.isShuttingDown,
            activeSessions: this.activeVoiceSessions ? this.activeVoiceSessions.size : 0,
            saveInterval: this.config.saveIntervalMs / 1000,
            isPeriodicSavingActive: this.periodicSaveInterval !== null
        };
    }
}

module.exports = new SessionRecovery();
