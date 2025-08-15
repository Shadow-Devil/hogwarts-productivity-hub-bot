/**
 * Voice State Scanner
 * Scans Discord voice states on bot startup and automatically starts tracking
 * for users already in voice channels
 */

import { client } from "../client.ts";
import { BaseGuildVoiceChannel, ChannelType, Collection, type Guild } from "discord.js";
import { startVoiceSession } from "./voiceUtils.ts";
import { db, ensureUserExists } from "../db/db.ts";
import { voiceSessionTable } from "../db/schema.ts";
import { isNull } from "drizzle-orm";

export let isScanning = false;
let scanResults = {
  totalUsersFound: 0,
  trackingStarted: 0,
  errors: 0,
  channels: [] as Array<{ id: string; name: string; userCount: number }>,
};

/**
 * Scan all voice channels and start tracking for users already in voice
 */
export async function scanAndStartTracking() {
  if (isScanning) {
    console.log("🔄 Voice state scan already in progress, skipping...");
    return scanResults;
  }

  isScanning = true;
  resetScanResults();

  const startTime = Date.now();

  const activeVoiceSessions = await db.select({
    discordId: voiceSessionTable.discordId,
  }).from(voiceSessionTable).where(
    isNull(voiceSessionTable.leftAt),
  ).then(s => s.map(r => r.discordId));

  try {
    // Get all guilds (should be only one for this bot)
    const guilds = client.guilds.cache;

    if (guilds.size === 0) {
      console.log("⚠️  No guilds found for voice state scanning");
      return scanResults;
    }

    for (const [, guild] of guilds) {
      console.log(`🏰 Scanning guild: ${guild.name} (${guild.id})`);
      await scanGuildVoiceStates(
        guild, activeVoiceSessions
      );
    }

    const scanDuration = Date.now() - startTime;

    console.log("📊 VOICE SCAN SUMMARY:");
    console.log(`   🔍 Scan Duration: ${scanDuration}ms`);
    console.log(`   👥 Users Found: ${scanResults.totalUsersFound}`);
    console.log(
      `   ✅ Tracking Started: ${scanResults.trackingStarted}`
    );
    console.log(`   ❌ Errors: ${scanResults.errors}`);
    console.log(`   🎤 Active Channels: ${scanResults.channels.length}`);

    if (scanResults.channels.length > 0) {
      console.log("   📍 Voice Channels with Users:");
      scanResults.channels.forEach((channel) => {
        console.log(`      • ${channel.name}: ${channel.userCount} users`);
      });
    }

    if (scanResults.trackingStarted > 0) {
      console.log(
        `   🎯 Successfully started automatic tracking for ${scanResults.trackingStarted} users`
      );
    } else if (scanResults.totalUsersFound > 0) {
      console.log("   ℹ️  All found users were already being tracked");
    } else {
      console.log("   📭 No users currently in voice channels");
    }
    console.log("═".repeat(40));

    if (scanResults.trackingStarted > 0) {
      console.log(
        `🎤 Auto-started tracking for ${scanResults.trackingStarted} users already in voice channels`
      );
    }

    return scanResults;
  } catch (error) {
    console.error("❌ Error during voice state scan:", error);
    scanResults.errors++;
    return scanResults;
  } finally {
    isScanning = false;
  }
}

/**
 * Scan voice states for a specific guild
 * @param {Guild} guild - Discord guild
 */
async function scanGuildVoiceStates(guild: Guild, activeVoiceSessions: string[]) {
  try {
    // Get all voice channels in the guild
    const voiceChannels = guild.channels.cache.filter(
      (channel) =>
        channel.type === ChannelType.GuildVoice && // Voice channel type
        channel.members.size > 0 // Has members
    ) as Collection<string, BaseGuildVoiceChannel>;

    console.log(`🎤 Found ${voiceChannels.size} voice channels with users`);

    for (const [, channel] of voiceChannels) {
      await scanVoiceChannel(channel, activeVoiceSessions);
    }
  } catch (error) {
    console.error(`❌ Error scanning guild ${guild.name}:`, error);
    scanResults.errors++;
  }
}

/**
 * Scan a specific voice channel and start tracking for users
 * @param {BaseGuildVoiceChannel} channel - Discord voice channel
 */
async function scanVoiceChannel(channel: BaseGuildVoiceChannel, activeVoiceSessions: string[]) {
  try {
    const members = channel.members;

    console.log(`🔍 Scanning ${channel.name}: ${members.size} users found`);

    // Add to scan results
    scanResults.channels.push({
      id: channel.id,
      name: channel.name,
      userCount: members.size,
    });

    const usersStarted = [];

    for (const [discordId, member] of members) {
      try {
        // Skip bots
        if (member.user.bot) {
          continue;
        }

        scanResults.totalUsersFound++;

        // Check if user already has an active session
        if (discordId in activeVoiceSessions) {
          console.log(`User ${member.user.username} already being tracked, skipping...`);
          continue;
        }

        await ensureUserExists(member);
        // Start voice session for this user
        await startVoiceSession({
          discordId,
          username: member.user.username,
          channelId: channel.id,
          channelName: channel.name,
        }, db);

        scanResults.trackingStarted++;
        usersStarted.push(member.user.username);

        console.log(`✅ Started tracking for ${member.user.username} in ${channel.name}`);
      } catch (userError) {
        console.error(`❌ Error starting tracking for user ${member.user.username}:`, userError);
        scanResults.errors++;
      }
    }

    if (usersStarted.length > 0) {
      console.log(
        `🎯 Started tracking for ${usersStarted.length} users in ${channel.name}:`,
        usersStarted.join(", ")
      );
    }
  } catch (error) {
    console.error(`❌ Error scanning voice channel ${channel.name}:`, error);
    scanResults.errors++;
  }
}

/**
 * Reset scan results for a new scan
 */
function resetScanResults() {
  scanResults = {
    totalUsersFound: 0,
    trackingStarted: 0,
    errors: 0,
    channels: [],
  };
}

