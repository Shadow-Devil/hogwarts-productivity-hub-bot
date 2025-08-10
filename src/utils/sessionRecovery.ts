import { db } from "../db/db.ts";
import * as voiceService from "../services/voiceService.ts";
import { voiceSessionsTable } from "../db/schema.ts";
import { and, gt, isNull } from "drizzle-orm";

/**
 * Session Recovery System
 * Handles crash recovery, periodic session saves, and graceful shutdowns
 * Enhanced with grace period session support for unstable connections
 */

let isShuttingDown = false;
let periodicSaveInterval: NodeJS.Timeout | null = null;
let activeVoiceSessions: Map<string, any> | null = null; // Will be set from voiceStateUpdate
let gracePeriodSessions: Map<string, any> | null = null; // Will be set from voiceStateUpdate

// Configuration
const config: {
  saveIntervalMs: number; // Save every 2 minutes
  maxSessionDurationHours: number; // Consider sessions over 24h as stale (increased for long study sessions)
  recoveryGracePeriodMs: number; // 5 minutes grace period for recovery
} = {
  saveIntervalMs: 2 * 60 * 1000,
  maxSessionDurationHours: 24,
  recoveryGracePeriodMs: 5 * 60 * 1000,
};


setupGracefulShutdown();

/**
 * Initialize the session recovery system
 */
export async function initialize(activeVoiceSessionsMap: Map<string, any>, gracePeriodSessionsMap: Map<string, any> | null = null) {
  activeVoiceSessions = activeVoiceSessionsMap;
  gracePeriodSessions = gracePeriodSessionsMap;

  // Recover any incomplete sessions from previous runs
  const recoveredSessions = await recoverIncompleteSessions();

  // Start periodic session state saving
  startPeriodicSaving();
  return recoveredSessions;
}

/**
 * Recover incomplete sessions from database
 */
async function recoverIncompleteSessions() {
  const now = new Date();
  const staleThreshold = new Date(
    now.getTime() - config.maxSessionDurationHours * 60 * 60 * 1000
  );

  // Find incomplete sessions (no left_at timestamp)
  const result = await db.select()
    .from(voiceSessionsTable)
    .where(and(isNull(voiceSessionsTable.leftAt), gt(voiceSessionsTable.joinedAt, staleThreshold)))
    .orderBy(voiceSessionsTable.joinedAt);

  let recoveredCount = 0;
  for (const session of result) {
    try {
      await processIncompleteSession(session, now);
      recoveredCount++;
    } catch (error) {
      console.error(`❌ Error recovering session ${session.id}:`, error);
    }
  }

  return recoveredCount;
}

/**
 * Process a single incomplete session
 */
async function processIncompleteSession(session: { joinedAt: Date; id: number; discordId: string; }, now: Date) {
  const sessionStartTime = session.joinedAt;
  const sessionDurationMs = now.getTime() - sessionStartTime.getTime();

  // Use last heartbeat if available, otherwise estimate end time
  const estimatedEndTime = new Date(
      sessionStartTime.getTime() +
      Math.min(sessionDurationMs, 3 * 60 * 60 * 1000)
    ); // Max 3 hours

  const estimatedDurationMs =
    estimatedEndTime.getTime() - sessionStartTime.getTime();
  const sessionDurationMinutes = Math.floor(
    estimatedDurationMs / (1000 * 60)
  );

  // Don't award points for very short sessions (likely connection issues)
  if (sessionDurationMinutes < 1) {
    await db.$client.query(
      `
          UPDATE voice_sessions
          SET left_at = $1, duration_minutes = 0, recovery_note = 'Recovered: Session too short'
          WHERE id = $2
      `,
      [estimatedEndTime, session.id]
    );

    console.log(
      `🔄 Recovered short session for ${session.discordId}: 0 minutes`
    );
    return;
  }

  // Update the session with estimated end time and duration
  await db.$client.query(
    `
        UPDATE voice_sessions
        SET left_at = $1, duration_minutes = $2, recovery_note = 'Recovered from crash'
        WHERE id = $3
    `,
    [estimatedEndTime, sessionDurationMinutes, session.id]
  );

  // Calculate and award points for the recovered session
  try {
    const pointsResult = await voiceService.calculateAndAwardPoints(
      session.discordId,
      sessionDurationMinutes
    );
    const pointsEarned =
      typeof pointsResult === "object"
        ? pointsResult.pointsEarned
        : pointsResult;

    // Update daily stats
    await voiceService.updateDailyStats(
      session.discordId,
      sessionDurationMinutes,
      pointsEarned
    );

    console.log(
      `✅ Recovered session for ${session.discordId}: ${sessionDurationMinutes} minutes, ${pointsEarned} points`
    );
  } catch (error) {
    console.error(
      `❌ Error calculating points for recovered session ${session.id}:`,
      error
    );
  }
}

/**
 * Start periodic saving of session states
 */
function startPeriodicSaving() {
  if (periodicSaveInterval) {
    clearInterval(periodicSaveInterval);
  }

  periodicSaveInterval = setInterval(async () => {
    if (!isShuttingDown) {
      try {
        await saveActiveSessionStates();
      } catch (error) {
        console.error("❌ Error during periodic session save:", error);
      }
    }
  }, config.saveIntervalMs);
}

/**
 * Save current state of all active sessions (heartbeat)
 */
async function saveActiveSessionStates() {
  if (!activeVoiceSessions || activeVoiceSessions.size === 0) {
    return;
  }
  const now = new Date();
  const activeSessions = Array.from(activeVoiceSessions.entries());

  for (const [userId, sessionData] of activeSessions) {
    try {
      // Calculate current session duration
      const durationMs = now.getTime() - sessionData.joinTime.getTime();
      const durationMinutes = Math.floor(durationMs / (1000 * 60));

      // Update the session with current progress (heartbeat)
      await db.$client.query(
        `
          UPDATE voice_sessions
          SET last_heartbeat = $1, current_duration_minutes = $2
          WHERE id = $3 AND left_at IS NULL
      `,
        [now, durationMinutes, sessionData.sessionId]
      );
    } catch (error) {
      console.error(
        `❌ Error saving session state for user ${userId}:`,
        error
      );
    }
  }

  console.log(
    `💾 Heartbeat saved for ${activeSessions.length} active sessions`
  );
}

/**
 * Handle graceful shutdown
 */
export async function handleGracefulShutdown() {
  isShuttingDown = true;

  console.log("🛑 Starting graceful shutdown of session recovery system...");

  // Stop periodic saving
  if (periodicSaveInterval) {
    clearInterval(periodicSaveInterval);
    periodicSaveInterval = null;
  }

  // Close all active sessions
  await closeAllActiveSessions();

  console.log("✅ Session recovery system shutdown complete");
}

/**
 * Close all currently active sessions during shutdown
 */
async function closeAllActiveSessions() {
  if (!activeVoiceSessions || activeVoiceSessions.size === 0) {
    console.log("ℹ️ No active sessions to close");
    return;
  }
  const now = new Date();
  let closedSessions = 0;

  console.log(
    `🔄 Closing ${activeVoiceSessions.size} active voice sessions...`
  );

  for (const [userId, sessionData] of activeVoiceSessions.entries()) {
    try {
      // Calculate session duration
      const durationMs = now.getTime() - sessionData.joinTime.getTime();
      const durationMinutes = Math.floor(durationMs / (1000 * 60));

      // Update session in database
      await db.$client.query(
        `
            UPDATE voice_sessions
            SET left_at = $1, duration_minutes = $2, recovery_note = 'Graceful shutdown'
            WHERE id = $3 AND left_at IS NULL
        `,
        [now, durationMinutes, sessionData.sessionId]
      );

      // Award points if session was long enough
      if (durationMinutes > 0) {
        const pointsResult = await voiceService.calculateAndAwardPoints(
          userId,
          durationMinutes
        );
        const pointsEarned =
          typeof pointsResult === "object"
            ? pointsResult.pointsEarned
            : pointsResult;

        await voiceService.updateDailyStats(
          userId,
          durationMinutes,
          pointsEarned
        );

        console.log(
          `✅ Closed session for ${userId}: ${durationMinutes} minutes, ${pointsEarned} points`
        );
      }

      closedSessions++;
    } catch (error) {
      console.error(`❌ Error closing session for user ${userId}:`, error);
    }
  }

  // Clear both active sessions and grace period sessions maps
  activeVoiceSessions.clear();

  // Also clear grace period sessions and end any pending sessions
  if (gracePeriodSessions && gracePeriodSessions.size > 0) {
    console.log(
      `🔄 Processing ${gracePeriodSessions.size} grace period sessions...`
    );

    for (const [userId, sessionData] of gracePeriodSessions.entries()) {
      try {
        console.log(
          `⏰ Ending grace period session for ${userId} during shutdown`
        );
        await voiceService.endVoiceSession(
          userId,
          sessionData.channelId,
          null
        );
      } catch (error) {
        console.error(
          `Error ending grace period session for ${userId}:`,
          error
        );
      }
    }
    gracePeriodSessions.clear();
    console.log("✅ Grace period sessions cleared during shutdown");
  }

  console.log(
    `✅ Successfully closed ${closedSessions} voice sessions during shutdown`
  );
}

/**
 * Setup graceful shutdown handlers
 */
function setupGracefulShutdown() {
  // Note: SIGINT/SIGTERM are handled by main index.js shutdown()
  // This only handles unexpected crashes and exceptions

  // Handle uncaught exceptions
  process.on("uncaughtException", async (error) => {
    console.error(
      "💥 Uncaught Exception - attempting session recovery:",
      error
    );
    try {
      await forceSave();
    } catch (saveError) {
      console.error(
        "❌ Failed to save sessions during uncaught exception:",
        saveError
      );
    }
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on("unhandledRejection", async (reason, _promise) => {
    console.error(
      "💥 Unhandled Rejection - attempting session recovery:",
      reason
    );
    try {
      await forceSave();
    } catch (saveError) {
      console.error(
        "❌ Failed to save sessions during unhandled rejection:",
        saveError
      );
    }
  });
}

/**
 * Force save all session states (emergency)
 */
export async function forceSave() {
  if (isShuttingDown) return;

  console.log("🚨 Emergency session state save triggered...");
  try {
    await saveActiveSessionStates();
    console.log("✅ Emergency save completed");
  } catch (error) {
    console.error("❌ Emergency save failed:", error);
    throw error;
  }
}

/**
 * Get recovery system statistics
 */
export function getRecoveryStats() {
  return {
    isShuttingDown: isShuttingDown,
    isPeriodicSavingActive: !!periodicSaveInterval,
    activeSessions: activeVoiceSessions
      ? activeVoiceSessions.size
      : 0,
    gracePeriodSessions: gracePeriodSessions
      ? gracePeriodSessions.size
      : 0,
    saveInterval: config.saveIntervalMs,
    maxSessionDurationHours: config.maxSessionDurationHours,
    isInitialized: false,
  };
}

