import { db } from "../db/db.ts";
import * as voiceService from "../services/voiceService.ts";
import { voiceSessionTable } from "../db/schema.ts";
import { and, gt, isNull } from "drizzle-orm";
import { activeVoiceSessions } from "../events/voiceStateUpdate.ts";

/**
 * Session Recovery System
 * Handles crash recovery, periodic session saves, and graceful shutdowns
 * Enhanced with grace period session support for unstable connections
 */
let periodicSaveInterval: NodeJS.Timeout | null = null;

// Configuration
const config = {
  saveIntervalMs: 2 * 60 * 1000,// Save every 2 minutes
  maxSessionDurationHours: 24, // Consider sessions over 24h as stale (increased for long study sessions)
  recoveryGracePeriodMs: 5 * 60 * 1000, // 5 minutes grace period for recovery
};

/**
 * Initialize the session recovery system
 */
export async function initialize() {

  // Recover any incomplete sessions from previous runs
  const recoveredSessions = await recoverIncompleteSessions();

  if (recoveredSessions > 0) {
    console.debug(`Recovered ${recoveredSessions} incomplete sessions from previous runs`);
  }

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
    .from(voiceSessionTable)
    .where(and(isNull(voiceSessionTable.leftAt), gt(voiceSessionTable.joinedAt, staleThreshold)))
    .orderBy(voiceSessionTable.joinedAt);

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

  periodicSaveInterval = setInterval(saveActiveSessionStates, config.saveIntervalMs);
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
