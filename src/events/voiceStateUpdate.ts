import { type VoiceState } from "discord.js";
import { ensureUserExists } from "../db/db.ts";
import { endVoiceSession, startVoiceSession } from "../utils/voiceUtils.ts";

export async function execute(oldState: VoiceState, newState: VoiceState) {
  const user = newState.member || oldState.member;
  if (!user || user.user.bot) return; // Ignore bots

  const userId = user.id;
  const username = user.user.username;
  const oldChannel = oldState.channel;
  const newChannel = newState.channel;
  await ensureUserExists(userId);

  // User joined a voice channel
  if (!oldChannel && newChannel) {
    console.log(`${username} joined voice channel: ${newChannel.name}`);
    await startVoiceSession(userId);

  } else if (oldChannel && !newChannel) {
    console.log(`${username} left voice channel: ${oldChannel.name}`);
    await endVoiceSession(userId);

  } else if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
    console.log(`${username} switched from ${oldChannel.name} to ${newChannel.name}`);
    // For channel switches, end the old session and start new one immediately
    await endVoiceSession(userId);
    await startVoiceSession(userId);
  }
}
