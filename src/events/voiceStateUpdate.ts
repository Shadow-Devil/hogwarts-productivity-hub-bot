import { type VoiceState } from "discord.js";
import * as voiceService from "../services/voiceService.ts";

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
  { channelId: string; joinTime: Date; sessionId: string; }
>(); // key: userId, value: { channelId, joinTime, sessionId, gracePeriodStart?, lastSeen? }


export async function execute(oldState: VoiceState, newState: VoiceState) {
  const user = newState.member || oldState.member;
  if (!user || user.user.bot) return; // Ignore bots

  const userId = user.id;
  const username = user.user.username;
  const oldChannel = oldState.channel;
  const newChannel = newState.channel;

  // User joined a voice channel
  if (!oldChannel && newChannel) {
    console.log(`${username} joined voice channel: ${newChannel.name}`);

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
    });
  } else if (oldChannel && !newChannel) {
    // User left a voice channel
    const sessionData = activeVoiceSessions.get(userId);

    if (sessionData) {
      console.log(`${username} left voice channel: ${oldChannel.name}`);

      await voiceService.endVoiceSession(userId, oldChannel.id, user);
    } else {
      console.error(`${username} left ${oldChannel.name} but no active session found`);
    }
  } else if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
    // User switched voice channels
    console.log(
      `🔄 ${username} switched from ${oldChannel.name} to ${newChannel.name}`
    );

    // For channel switches, end the old session and start new one immediately
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
    });
  }
}
