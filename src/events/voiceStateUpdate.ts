import { type VoiceState } from "discord.js";
import { db, ensureUserExists } from "../db/db.ts";
import { endVoiceSession, startVoiceSession } from "../utils/voiceUtils.ts";
import { wrapWithAlerting } from "../utils/alerting.ts";

export async function execute(oldState: VoiceState, newState: VoiceState) {
  const user = newState.member || oldState.member;
  if (!user || user.user.bot) return; // Ignore bots

  const userId = user.id;
  const username = user.user.username;
  const oldChannel = oldState.channel;
  const newChannel = newState.channel;
  console.log("+".repeat(5) + ` Voice state update for ${username} (${oldChannel} -> ${newChannel})`);
  await ensureUserExists(user);

  await wrapWithAlerting(async () => {
    // User joined a voice channel
    if (!oldChannel && newChannel) {
      await startVoiceSession(userId, username, db);
    } else if (oldChannel && !newChannel) {
      await endVoiceSession(userId, username, db);
    } else if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
      // For channel switches, end the old session and start new one immediately
      await endVoiceSession(userId, username, db);
      await startVoiceSession(userId, username, db);
    }
  }, `Voice state update for ${username} (${userId})`);
  console.log("-".repeat(5))
}
