import { Events, type VoiceState } from "discord.js";
import voiceService from "../services/voiceService.ts";
import dayjs from "dayjs";

/**
 * Voice State Update Handler with Smart Session Management
 *
 * Features:
 * - Tracks active voice sessions in memory for efficient management
 * - Smart cleanup system that only removes truly abandoned sessions
 * - Verifies users are actually not in voice before cleanup (prevents false positives)
 * - Only checks sessions older than 1 hour to avoid interfering with legitimate long sessions
 * - Updates channel tracking when users move between channels
 * - Runs cleanup every 15 minutes to minimize performance impact
 */

// Track active voice sessions with grace period support for unstable connections
export const activeVoiceSessions = new Map<
  string,
  { channelId; joinTime; sessionId; gracePeriodStart?; lastSeen? }
>(); // key: userId, value: { channelId, joinTime, sessionId, gracePeriodStart?, lastSeen? }

// Grace period configuration for users with unstable connections
const GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes
export const gracePeriodSessions = new Map(); // Track sessions in grace period

// Store client reference for cleanup operations
let discordClient = null;

// Enhanced smart cleanup with grace period handling
// Runs every 15 minutes and processes both active sessions and grace period sessions
setInterval(async () => {
  if (
    (activeVoiceSessions.size === 0 && gracePeriodSessions.size === 0) ||
    !discordClient
  )
    return;

  console.log(
    `🔍 Running enhanced session cleanup check (${activeVoiceSessions.size} active, ${gracePeriodSessions.size} grace period)...`
  );

  try {
    const cleanupCandidates = [];
    const oneHourAgo = Date.now() - 60 * 60 * 1000; // Sessions older than 1 hour
    let sessionsChecked = 0;
    let longSessions = 0;
    let gracePeriodExpired = 0;

    // Process grace period sessions first
    for (const [userId, sessionData] of gracePeriodSessions.entries()) {
      const gracePeriodElapsed = Date.now() - sessionData.gracePeriodStart;

      if (gracePeriodElapsed >= GRACE_PERIOD_MS) {
        // Grace period expired - truly end the session
        console.log(
          `⏰ Grace period expired for user ${userId} (${Math.floor(gracePeriodElapsed / 1000 / 60)} minutes)`
        );

        try {
          await voiceService.endVoiceSession(
            userId,
            sessionData.channelId,
            null
          );

          // Remove from both maps
          gracePeriodSessions.delete(userId);
          activeVoiceSessions.delete(userId);
          gracePeriodExpired++;
        } catch (error) {
          console.error(
            `Error ending grace period session for ${userId}:`,
            error
          );
        }
      } else {
        // Check if user has returned to voice during grace period
        for (const [_guildId, guild] of discordClient.guilds.cache) {
          try {
            const voiceState = guild.voiceStates.cache.get(userId);
            if (voiceState?.channel) {
              console.log(
                `🔄 User ${userId} returned during grace period - resuming session`
              );

              // Update session data and remove from grace period
              const activeSession = activeVoiceSessions.get(userId);
              if (activeSession) {
                activeSession.lastSeen = new Date();
                delete activeSession.gracePeriodStart;

                // Update channel if they switched
                if (activeSession.channelId !== voiceState.channel.id) {
                  console.log(`🔄 User ${userId} resumed in different channel`);
                  activeSession.channelId = voiceState.channel.id;
                }
              }
              gracePeriodSessions.delete(userId);
              break;
            }
          } catch (error) {
            console.warn(
              `Error checking voice state during grace period for user ${userId}:`,
              error.message
            );
          }
        }
      }
    }

    // Process regular active sessions (existing logic enhanced)
    for (const [userId, sessionData] of activeVoiceSessions.entries()) {
      // Skip sessions currently in grace period
      if (gracePeriodSessions.has(userId)) continue;

      sessionsChecked++;

      // Only check sessions that are older than 1 hour (likely legitimate long sessions)
      if (sessionData.joinTime.getTime() < oneHourAgo) {
        longSessions++;
        let userStillInVoice = false;

        // Check all guilds to see if user is actually in a voice channel
        for (const [_guildId, guild] of discordClient.guilds.cache) {
          try {
            // Check voice states cache first (most efficient)
            const voiceState = guild.voiceStates.cache.get(userId);
            if (voiceState?.channel) {
              userStillInVoice = true;
              // Update the session data with current channel if it changed
              if (sessionData.channelId !== voiceState.channel.id) {
                console.log(
                  `🔄 User ${userId} moved channels - updating tracking`
                );
                sessionData.channelId = voiceState.channel.id;
              }
              // Update last seen timestamp
              sessionData.lastSeen = new Date();
              break;
            }
          } catch (error) {
            console.warn(
              `Error checking voice state for user ${userId} in guild ${guild.name}:`,
              error.message
            );
          }
        }

        if (!userStillInVoice) {
          const sessionAge = Math.floor(
            (Date.now() - sessionData.joinTime.getTime()) / (1000 * 60)
          );
          cleanupCandidates.push({ userId, sessionAge });
        }
      }
    }

    // Clean up only truly abandoned sessions (not in grace period)
    for (const { userId, sessionAge } of cleanupCandidates) {
      console.log(
        `🧹 Cleaning up abandoned session for user ${userId} (${sessionAge} minutes old, not in any voice channel)`
      );
      activeVoiceSessions.delete(userId);
      gracePeriodSessions.delete(userId); // Safety cleanup
    }

    if (cleanupCandidates.length > 0 || gracePeriodExpired > 0) {
      console.log(
        `✅ Enhanced cleanup completed: ${cleanupCandidates.length} abandoned sessions removed, ${gracePeriodExpired} grace periods expired`
      );
      console.log(
        `📊 Cleanup stats: ${sessionsChecked} active sessions checked, ${longSessions} long sessions verified, ${gracePeriodSessions.size} in grace period`
      );
    } else if (longSessions > 0 || gracePeriodSessions.size > 0) {
      console.log(
        `✅ Enhanced cleanup completed: All ${longSessions} long sessions are legitimate, ${gracePeriodSessions.size} users in grace period`
      );
    }
  } catch (error) {
    console.error("❌ Error during smart session cleanup:", error);
  }
}, 900000); // Run every 15 minutes

// Midnight crossover handler - runs every hour to check for sessions crossing midnight
setInterval(async () => {
  if (activeVoiceSessions.size === 0 || !discordClient) return;

  const now = dayjs();
  const isJustAfterMidnight = now.hour() === 0 && now.minute() < 60; // First hour of the day

  if (!isJustAfterMidnight) return; // Only run in the first hour after midnight

  console.log(
    `🌅 Checking for midnight crossover sessions (${activeVoiceSessions.size} active sessions)...`
  );

  try {
    let crossoversHandled = 0;

    for (const [userId, sessionData] of activeVoiceSessions.entries()) {
      try {
        // Check if session started yesterday (before midnight)
        const sessionStartDay = dayjs(sessionData.joinTime).format(
          "YYYY-MM-DD"
        );
        const today = dayjs().format("YYYY-MM-DD");

        if (sessionStartDay !== today) {
          // This session crossed midnight, handle it
          console.log(`🌅 Handling midnight crossover for user ${userId}`);

          // Find the user's member object for notifications
          let member = null;
          for (const [_guildId, guild] of discordClient.guilds.cache) {
            try {
              member = await guild.members.fetch(userId);
              if (member) break;
            } catch (error) {
              // User might not be in this guild
              continue;
            }
          }

          const result = await voiceService.handleMidnightCrossover(
            userId,
            sessionData.channelId,
            member
          );

          if (result && result.todaySession) {
            // Update the active session tracking with new session
            activeVoiceSessions.set(userId, {
              channelId: sessionData.channelId,
              joinTime: new Date(), // Reset to midnight
              sessionId: result.todaySession.id,
            });
            crossoversHandled++;
          }
        }
      } catch (error) {
        console.error(
          `Error handling midnight crossover for user ${userId}:`,
          error
        );
      }
    }

    if (crossoversHandled > 0) {
      console.log(
        `✅ Midnight crossover completed: ${crossoversHandled} sessions processed`
      );
    }
  } catch (error) {
    console.error("❌ Error during midnight crossover check:", error);
  }
}, 3600000); // Run every hour

// Function to set the Discord client reference (called from main bot file)
export function setDiscordClient(client) {
  discordClient = client;
  console.log("✅ Discord client reference set for smart session cleanup");
}

// Manual cleanup function for debugging/admin purposes
export async function manualCleanup() {
  if (!discordClient) {
    console.log("❌ Cannot run manual cleanup: Discord client not set");
    return { error: "Discord client not available" };
  }

  console.log("🔧 Running manual session cleanup...");

  const cleanupCandidates = [];
  const results = {
    totalSessions: activeVoiceSessions.size,
    gracePeriodSessions: gracePeriodSessions.size,
    checkedSessions: 0,
    cleanedUp: 0,
    gracePeriodExpired: 0,
    errors: 0,
  };

  // Check grace period sessions first
  for (const [userId, sessionData] of gracePeriodSessions.entries()) {
    const gracePeriodElapsed = Date.now() - sessionData.gracePeriodStart;

    if (gracePeriodElapsed >= GRACE_PERIOD_MS) {
      console.log(
        `🧹 Manual cleanup: Grace period expired for user ${userId} (${Math.floor(gracePeriodElapsed / 1000 / 60)} minutes)`
      );

      try {
        await voiceService.endVoiceSession(userId, sessionData.channelId, null);

        gracePeriodSessions.delete(userId);
        activeVoiceSessions.delete(userId);
        results.gracePeriodExpired++;
      } catch (error) {
        console.error(
          `Error ending grace period session for ${userId}:`,
          error
        );
        results.errors++;
      }
    }
  }

  // Check active sessions
  for (const [userId, sessionData] of activeVoiceSessions.entries()) {
    // Skip sessions in grace period
    if (gracePeriodSessions.has(userId)) continue;

    results.checkedSessions++;
    let userStillInVoice = false;

    try {
      // Check all guilds to see if user is actually in a voice channel
      for (const [_guildId, guild] of discordClient.guilds.cache) {
        const voiceState = guild.voiceStates.cache.get(userId);
        if (voiceState?.channel) {
          userStillInVoice = true;
          break;
        }
      }

      if (!userStillInVoice) {
        const sessionAge = Math.floor(
          (Date.now() - sessionData.joinTime.getTime()) / (1000 * 60)
        );
        cleanupCandidates.push({ userId, sessionAge });
      }
    } catch (error) {
      console.error(`Error checking user ${userId}:`, error.message);
      results.errors++;
    }
  }

  // Clean up abandoned sessions
  for (const { userId, sessionAge } of cleanupCandidates) {
    console.log(
      `🧹 Manual cleanup: Removing abandoned session for user ${userId} (${sessionAge} minutes old)`
    );
    activeVoiceSessions.delete(userId);
    gracePeriodSessions.delete(userId); // Safety cleanup
    results.cleanedUp++;
  }

  console.log(
    `✅ Manual cleanup completed: ${results.cleanedUp}/${results.checkedSessions} sessions cleaned up, ${results.gracePeriodExpired} grace periods expired`
  );
  return results;
}

export async function execute(oldState: VoiceState, newState: VoiceState) {
  try {
    const user = newState.member || oldState.member;
    if (!user || user.user.bot) return; // Ignore bots

    const userId = user.id;
    const username = user.user.username;
    const oldChannel = oldState.channel;
    const newChannel = newState.channel;

    // User joined a voice channel
    if (!oldChannel && newChannel) {
      // Check if user is returning from grace period
      if (gracePeriodSessions.has(userId)) {
        console.log(
          `🔄 ${username} returned during grace period to: ${newChannel.name}`
        );

        // Resume the existing session
        const sessionData = activeVoiceSessions.get(userId);
        if (sessionData) {
          sessionData.lastSeen = new Date();
          sessionData.channelId = newChannel.id; // Update channel in case they switched
          delete sessionData.gracePeriodStart;
        }
        gracePeriodSessions.delete(userId);

        console.log(
          `✅ Session resumed for ${username} - no interruption to voice tracking`
        );
      } else {
        console.log(`👥 ${username} joined voice channel: ${newChannel.name}`);

        // Start new voice session in database
        const session = await voiceService.startVoiceSession(
          userId,
          username,
          newChannel.id,
          newChannel.name
        );

        // Track in memory for cleanup
        activeVoiceSessions.set(userId, {
          channelId: newChannel.id,
          joinTime: new Date(),
          sessionId: session.id,
          lastSeen: new Date(),
        });
      }
    } else if (oldChannel && !newChannel) {
      // User left a voice channel
      const sessionData = activeVoiceSessions.get(userId);

      if (sessionData) {
        // Start grace period instead of immediately ending session
        console.log(
          `⏸️ ${username} left voice channel: ${oldChannel.name} - starting 5-minute grace period`
        );

        sessionData.gracePeriodStart = Date.now();
        gracePeriodSessions.set(userId, sessionData);

        console.log(
          `🕐 Grace period started for ${username} - session will end if not back within 5 minutes`
        );
      } else {
        console.log(
          `⚠️ ${username} left ${oldChannel.name} but no active session found`
        );
      }
    } else if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
      // User switched voice channels
      console.log(
        `🔄 ${username} switched from ${oldChannel.name} to ${newChannel.name}`
      );

      // For channel switches, end the old session and start new one immediately (no grace period needed)
      await voiceService.endVoiceSession(userId, oldChannel.id, user);

      // Start session in new channel
      const session = await voiceService.startVoiceSession(
        userId,
        username,
        newChannel.id,
        newChannel.name
      );

      // Update memory tracking
      activeVoiceSessions.set(userId, {
        channelId: newChannel.id,
        joinTime: new Date(),
        sessionId: session.id,
        lastSeen: new Date(),
      });

      // Remove from grace period if they were in one
      gracePeriodSessions.delete(userId);
    }
  } catch (error) {
    console.error("Error in voiceStateUpdate:", error);
  }
}
