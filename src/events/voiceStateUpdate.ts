import { type VoiceState } from "discord.js";
import { db, ensureUserExists } from "../db/db.ts";
import { endVoiceSession, startVoiceSession } from "../utils/voiceUtils.ts";
import { wrapWithAlerting } from "../utils/alerting.ts";

export async function execute(oldState: VoiceState, newState: VoiceState) {
  const user = newState.member || oldState.member;
  if (!user || user.user.bot) return; // Ignore bots

  const discordId = user.id;
  const username = user.user.username;
  const oldChannel = oldState.channel;
  const newChannel = newState.channel;

  const oldVoiceSession = {
    discordId,
    username,
    channelId: oldChannel?.id || null,
    channelName: oldChannel?.name || null,
  }
  const newVoiceSession = {
    discordId,
    username,
    channelId: newChannel?.id || null,
    channelName: newChannel?.name || null,
  }
  console.log("+".repeat(5) + ` Voice state update for ${username} (${oldChannel?.name} -> ${newChannel?.name})`);
  await ensureUserExists(user);

  await wrapWithAlerting(async () => {
    // User joined a voice channel
    if (!oldChannel && newChannel) {
      await startVoiceSession(newVoiceSession, db);
    } else if (oldChannel && !newChannel) {
      await endVoiceSession(oldVoiceSession, db);
    } else if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
      // For channel switches, end the old session and start new one immediately
      await endVoiceSession(oldVoiceSession, db);
      await startVoiceSession(newVoiceSession, db);
    }
  }, `Voice state update for ${username} (${discordId})`);
  console.log("-".repeat(5))
}
