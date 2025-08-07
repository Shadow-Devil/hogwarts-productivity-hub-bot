import { executeWithResilience } from "../models/db";
import { measureDatabase } from "./performanceMonitor";
import dayjs from "dayjs";

/**
 * Session Recovery System
 * Handles crash recovery, periodic session saves, and graceful shutdowns
 * Enhanced with grace period session support for unstable connections
 */
class SessionRecovery {
  private isShuttingDown: boolean;
  private periodicSaveInterval: NodeJS.Timeout | null;
  private activeVoiceSessions: Map<string, any> | null; // Will be set from voiceStateUpdate
  private gracePeriodSessions: Map<string, any> | null; // Will be set from voiceStateUpdate

  // Configuration
  private config: {
    saveIntervalMs: number; // Save every 2 minutes
    maxSessionDurationHours: number; // Consider sessions over 24h as stale (increased for long study sessions)
    recoveryGracePeriodMs: number; // 5 minutes grace period for recovery
  };

  constructor() {
    this.isShuttingDown = false;
    this.periodicSaveInterval = null;
    this.activeVoiceSessions = null;
    this.gracePeriodSessions = null;

    // Configuration
    this.config = {
      saveIntervalMs: 2 * 60 * 1000,
      maxSessionDurationHours: 24,
      recoveryGracePeriodMs: 5 * 60 * 1000,
    };

    this.setupGracefulShutdown();
  }

  /**
   * Initialize the session recovery system
   */
  async initialize(activeVoiceSessionsMap, gracePeriodSessionsMap = null) {
    this.activeVoiceSessions = activeVoiceSessionsMap;
    this.gracePeriodSessions = gracePeriodSessionsMap;

    // Recover any incomplete sessions from previous runs
    const recoveredSessions = await this.recoverIncompleteSessions();

    // Start periodic session state saving
    this.startPeriodicSaving();

    console.log(
      `✅ Session recovery system initialized. Recovered ${recoveredSessions} sessions.`,
    );
    return recoveredSessions;
  }

  /**
   * Recover incomplete sessions from database
   */
  async recoverIncompleteSessions() {
    return measureDatabase("recoverIncompleteSessions", async () => {
      return executeWithResilience(async (client) => {
        const now = new Date();
        const staleThreshold = new Date(
          now.getTime() - this.config.maxSessionDurationHours * 60 * 60 * 1000,
        );

        // Find incomplete sessions (no left_at timestamp)
        const result = await client.query(
          `
                    SELECT * FROM vc_sessions
                    WHERE left_at IS NULL
                    AND joined_at > $1
                    ORDER BY joined_at ASC
                `,
          [staleThreshold],
        );

        console.log(
          `🔄 Found ${result.rows.length} incomplete sessions to recover`,
        );

        let recoveredCount = 0;
        for (const session of result.rows) {
          try {
            await this.processIncompleteSession(client, session, now);
            recoveredCount++;
          } catch (error) {
            console.error(`❌ Error recovering session ${session.id}:`, error);
          }
        }

        return recoveredCount;
      });
    })();
  }

  /**
   * Process a single incomplete session
   */
  async processIncompleteSession(client, session, now) {
    const sessionStartTime = new Date(session.joined_at);
    const sessionDurationMs = now.getTime() - sessionStartTime.getTime();

    // Use last heartbeat if available, otherwise estimate end time
    const lastHeartbeat = session.last_heartbeat
      ? new Date(session.last_heartbeat)
      : null;
    let estimatedEndTime;

    if (lastHeartbeat) {
      // Add grace period to last heartbeat
      estimatedEndTime = new Date(
        lastHeartbeat.getTime() + this.config.recoveryGracePeriodMs,
      );
    } else {
      // No heartbeat data, estimate based on reasonable session length
      estimatedEndTime = new Date(
        sessionStartTime.getTime() +
          Math.min(sessionDurationMs, 3 * 60 * 60 * 1000),
      ); // Max 3 hours
    }

    const estimatedDurationMs =
      estimatedEndTime.getTime() - sessionStartTime.getTime();
    const sessionDurationMinutes = Math.floor(
      estimatedDurationMs / (1000 * 60),
    );

    // Don't award points for very short sessions (likely connection issues)
    if (sessionDurationMinutes < 1) {
      await client.query(
        `
                UPDATE vc_sessions
                SET left_at = $1, duration_minutes = 0, recovery_note = 'Recovered: Session too short'
                WHERE id = $2
            `,
        [estimatedEndTime, session.id],
      );

      console.log(
        `🔄 Recovered short session for ${session.discord_id}: 0 minutes`,
      );
      return;
    }

    // Update the session with estimated end time and duration
    await client.query(
      `
            UPDATE vc_sessions
            SET left_at = $1, duration_minutes = $2, recovery_note = 'Recovered from crash'
            WHERE id = $3
        `,
      [estimatedEndTime, sessionDurationMinutes, session.id],
    );

    // Calculate and award points for the recovered session
    const voiceService = require("../services/voiceService");
    try {
      const pointsResult = await voiceService.calculateAndAwardPoints(
        session.discord_id,
        sessionDurationMinutes,
      );
      const pointsEarned =
        typeof pointsResult === "object"
          ? pointsResult.pointsEarned
          : pointsResult;

      // Update daily stats
      await voiceService.updateDailyStats(
        session.discord_id,
        session.date,
        sessionDurationMinutes,
        pointsEarned,
      );

      console.log(
        `✅ Recovered session for ${session.discord_id}: ${sessionDurationMinutes} minutes, ${pointsEarned} points`,
      );
    } catch (error) {
      console.error(
        `❌ Error calculating points for recovered session ${session.id}:`,
        error,
      );
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
      if (!this.isShuttingDown) {
        try {
          await this.saveActiveSessionStates();
        } catch (error) {
          console.error("❌ Error during periodic session save:", error);
        }
      }
    }, this.config.saveIntervalMs);

    console.log(
      `✅ Periodic session saving started (every ${this.config.saveIntervalMs / 1000} seconds)`,
    );
  }

  /**
   * Save current state of all active sessions (heartbeat)
   */
  async saveActiveSessionStates() {
    if (!this.activeVoiceSessions || this.activeVoiceSessions.size === 0) {
      return;
    }

    return measureDatabase("saveActiveSessionStates", async () => {
      return executeWithResilience(async (client) => {
        const now = new Date();
        const activeSessions = Array.from(this.activeVoiceSessions.entries());

        for (const [userId, sessionData] of activeSessions) {
          try {
            // Calculate current session duration
            const durationMs = now.getTime() - sessionData.joinTime.getTime();
            const durationMinutes = Math.floor(durationMs / (1000 * 60));

            // Update the session with current progress (heartbeat)
            await client.query(
              `
                            UPDATE vc_sessions
                            SET last_heartbeat = $1, current_duration_minutes = $2
                            WHERE id = $3 AND left_at IS NULL
                        `,
              [now, durationMinutes, sessionData.sessionId],
            );
          } catch (error) {
            console.error(
              `❌ Error saving session state for user ${userId}:`,
              error,
            );
          }
        }

        console.log(
          `💾 Heartbeat saved for ${activeSessions.length} active sessions`,
        );
      });
    })();
  }

  /**
   * Handle graceful shutdown
   */
  async handleGracefulShutdown() {
    this.isShuttingDown = true;

    console.log("🛑 Starting graceful shutdown of session recovery system...");

    // Stop periodic saving
    if (this.periodicSaveInterval) {
      clearInterval(this.periodicSaveInterval);
      this.periodicSaveInterval = null;
    }

    // Close all active sessions
    await this.closeAllActiveSessions();

    console.log("✅ Session recovery system shutdown complete");
  }

  /**
   * Close all currently active sessions during shutdown
   */
  async closeAllActiveSessions() {
    if (!this.activeVoiceSessions || this.activeVoiceSessions.size === 0) {
      console.log("ℹ️ No active sessions to close");
      return;
    }

    return measureDatabase("closeAllActiveSessions", async () => {
      return executeWithResilience(async (client) => {
        const now = new Date();
        const voiceService = require("../services/voiceService");
        let closedSessions = 0;

        console.log(
          `🔄 Closing ${this.activeVoiceSessions.size} active voice sessions...`,
        );

        for (const [
          userId,
          sessionData,
        ] of this.activeVoiceSessions.entries()) {
          try {
            // Calculate session duration
            const durationMs = now.getTime() - sessionData.joinTime.getTime();
            const durationMinutes = Math.floor(durationMs / (1000 * 60));

            // Update session in database
            await client.query(
              `
                            UPDATE vc_sessions
                            SET left_at = $1, duration_minutes = $2, recovery_note = 'Graceful shutdown'
                            WHERE id = $3 AND left_at IS NULL
                        `,
              [now, durationMinutes, sessionData.sessionId],
            );

            // Award points if session was long enough
            if (durationMinutes > 0) {
              const pointsResult = await voiceService.calculateAndAwardPoints(
                userId,
                durationMinutes,
              );
              const pointsEarned =
                typeof pointsResult === "object"
                  ? pointsResult.pointsEarned
                  : pointsResult;

              // Update daily stats
              const sessionDate = dayjs(sessionData.joinTime).format(
                "YYYY-MM-DD",
              );
              await voiceService.updateDailyStats(
                userId,
                sessionDate,
                durationMinutes,
                pointsEarned,
              );

              console.log(
                `✅ Closed session for ${userId}: ${durationMinutes} minutes, ${pointsEarned} points`,
              );
            }

            closedSessions++;
          } catch (error) {
            console.error(
              `❌ Error closing session for user ${userId}:`,
              error,
            );
          }
        }

        // Clear both active sessions and grace period sessions maps
        this.activeVoiceSessions.clear();

        // Also clear grace period sessions and end any pending sessions
        if (this.gracePeriodSessions && this.gracePeriodSessions.size > 0) {
          console.log(
            `🔄 Processing ${this.gracePeriodSessions.size} grace period sessions...`,
          );

          for (const [
            userId,
            sessionData,
          ] of this.gracePeriodSessions.entries()) {
            try {
              console.log(
                `⏰ Ending grace period session for ${userId} during shutdown`,
              );
              await voiceService.endVoiceSession(
                userId,
                sessionData.channelId,
                null,
              );
            } catch (error) {
              console.error(
                `Error ending grace period session for ${userId}:`,
                error,
              );
            }
          }
          this.gracePeriodSessions.clear();
          console.log("✅ Grace period sessions cleared during shutdown");
        }

        console.log(
          `✅ Successfully closed ${closedSessions} voice sessions during shutdown`,
        );
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
    process.on("uncaughtException", async (error) => {
      console.error(
        "💥 Uncaught Exception - attempting session recovery:",
        error,
      );
      try {
        await this.forceSave();
      } catch (saveError) {
        console.error(
          "❌ Failed to save sessions during uncaught exception:",
          saveError,
        );
      }
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on("unhandledRejection", async (reason, _promise) => {
      console.error(
        "💥 Unhandled Rejection - attempting session recovery:",
        reason,
      );
      try {
        await this.forceSave();
      } catch (saveError) {
        console.error(
          "❌ Failed to save sessions during unhandled rejection:",
          saveError,
        );
      }
    });
  }

  /**
   * Force save all session states (emergency)
   */
  async forceSave() {
    if (this.isShuttingDown) return;

    console.log("🚨 Emergency session state save triggered...");
    try {
      await this.saveActiveSessionStates();
      console.log("✅ Emergency save completed");
    } catch (error) {
      console.error("❌ Emergency save failed:", error);
      throw error;
    }
  }

  /**
   * Get recovery system statistics
   */
  getRecoveryStats() {
    return {
      isShuttingDown: this.isShuttingDown,
      isPeriodicSavingActive: !!this.periodicSaveInterval,
      activeSessions: this.activeVoiceSessions
        ? this.activeVoiceSessions.size
        : 0,
      gracePeriodSessions: this.gracePeriodSessions
        ? this.gracePeriodSessions.size
        : 0,
      saveInterval: this.config.saveIntervalMs,
      maxSessionDurationHours: this.config.maxSessionDurationHours,
      isInitialized: false,
    };
  }
}

export default new SessionRecovery();
