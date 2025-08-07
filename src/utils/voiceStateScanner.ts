/**
 * Voice State Scanner
 * Scans Discord voice states on bot startup and automatically starts tracking
 * for users already in voice channels
 */

import voiceService from "../services/voiceService.ts";
// Get grace period sessions if available
import { gracePeriodSessions } from "../events/voiceStateUpdate.ts";
import type { Client } from "discord.js";

class VoiceStateScanner {
  private isScanning: boolean;
  private scanResults: {
    totalUsersFound: number;
    trackingStarted: number;
    errors: number;
    channels: Array<{ id: string; name: string; userCount: number }>;
  };

  constructor() {
    this.isScanning = false;
    this.scanResults = {
      totalUsersFound: 0,
      trackingStarted: 0,
      errors: 0,
      channels: [],
    };
  }

  /**
   * Scan all voice channels and start tracking for users already in voice
   * @param {Client} client - Discord client instance
   * @param {Map} activeVoiceSessions - Active voice sessions map from voiceStateUpdate
   * @returns {Object} Scan results
   */
  async scanAndStartTracking(
    client: Client,
    activeVoiceSessions: Map<string, any>
  ) {
    if (this.isScanning) {
      console.log("🔄 Voice state scan already in progress, skipping...");
      return this.scanResults;
    }

    this.isScanning = true;
    this.resetScanResults();

    const startTime = Date.now();

    try {
      // Get all guilds (should be only one for this bot)
      const guilds = client.guilds.cache;

      if (guilds.size === 0) {
        console.log("⚠️  No guilds found for voice state scanning");
        return this.scanResults;
      }

      for (const [, guild] of guilds) {
        console.log(`🏰 Scanning guild: ${guild.name} (${guild.id})`);
        await this.scanGuildVoiceStates(
          guild,
          activeVoiceSessions,
          gracePeriodSessions
        );
      }

      const scanDuration = Date.now() - startTime;

      console.log("✅ Voice state scan completed");
      console.log("═".repeat(40));
      console.log("📊 VOICE SCAN SUMMARY:");
      console.log(`   🔍 Scan Duration: ${scanDuration}ms`);
      console.log(`   👥 Users Found: ${this.scanResults.totalUsersFound}`);
      console.log(
        `   ✅ Tracking Started: ${this.scanResults.trackingStarted}`
      );
      console.log(`   ❌ Errors: ${this.scanResults.errors}`);
      console.log(`   🎤 Active Channels: ${this.scanResults.channels.length}`);

      if (this.scanResults.channels.length > 0) {
        console.log("   📍 Voice Channels with Users:");
        this.scanResults.channels.forEach((channel) => {
          console.log(`      • ${channel.name}: ${channel.userCount} users`);
        });
      }

      if (this.scanResults.trackingStarted > 0) {
        console.log(
          `   🎯 Successfully started automatic tracking for ${this.scanResults.trackingStarted} users`
        );
      } else if (this.scanResults.totalUsersFound > 0) {
        console.log("   ℹ️  All found users were already being tracked");
      } else {
        console.log("   📭 No users currently in voice channels");
      }
      console.log("═".repeat(40));

      return this.scanResults;
    } catch (error) {
      console.error("❌ Error during voice state scan:", error);
      this.scanResults.errors++;
      return this.scanResults;
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Scan voice states for a specific guild
   * @param {Guild} guild - Discord guild
   * @param {Map} activeVoiceSessions - Active voice sessions map
   * @param {Map} gracePeriodSessions - Grace period sessions map
   */
  async scanGuildVoiceStates(
    guild,
    activeVoiceSessions,
    gracePeriodSessions = null
  ) {
    try {
      // Get all voice channels in the guild
      const voiceChannels = guild.channels.cache.filter(
        (channel) =>
          channel.type === 2 && // Voice channel type
          channel.members.size > 0 // Has members
      );

      console.log(`🎤 Found ${voiceChannels.size} voice channels with users`);

      for (const [_channelId, channel] of voiceChannels) {
        await this.scanVoiceChannel(
          channel,
          activeVoiceSessions,
          gracePeriodSessions
        );
      }
    } catch (error) {
      console.error(`❌ Error scanning guild ${guild.name}:`, error);
      this.scanResults.errors++;
    }
  }

  /**
   * Scan a specific voice channel and start tracking for users
   * @param {VoiceChannel} channel - Discord voice channel
   * @param {Map} activeVoiceSessions - Active voice sessions map
   * @param {Map} gracePeriodSessions - Grace period sessions map
   */
  async scanVoiceChannel(
    channel,
    activeVoiceSessions,
    gracePeriodSessions = null
  ) {
    try {
      const members = channel.members;

      if (members.size === 0) {
        return;
      }

      console.log(`🔍 Scanning ${channel.name}: ${members.size} users found`);

      // Add to scan results
      this.scanResults.channels.push({
        id: channel.id,
        name: channel.name,
        userCount: members.size,
      });

      const usersStarted = [];

      for (const [memberId, member] of members) {
        try {
          // Skip bots
          if (member.user.bot) {
            continue;
          }

          this.scanResults.totalUsersFound++;

          // Check if user already has an active session or is in grace period
          if (activeVoiceSessions.has(memberId)) {
            console.log(
              `⏭️  User ${member.user.username} already being tracked, skipping...`
            );
            continue;
          }

          // Check if user is in grace period - if so, resume their session
          if (gracePeriodSessions && gracePeriodSessions.has(memberId)) {
            console.log(
              `🔄 User ${member.user.username} found in voice during grace period - resuming session`
            );

            const sessionData = gracePeriodSessions.get(memberId);
            sessionData.lastSeen = new Date();
            sessionData.channelId = channel.id; // Update channel in case they switched
            delete sessionData.gracePeriodStart;

            // Remove from grace period and ensure they're in active sessions
            gracePeriodSessions.delete(memberId);
            if (!activeVoiceSessions.has(memberId)) {
              activeVoiceSessions.set(memberId, sessionData);
            }

            this.scanResults.trackingStarted++;
            usersStarted.push(member.user.username);
            console.log(
              `✅ Session resumed for ${member.user.username} in ${channel.name}`
            );
            continue;
          }

          // Start voice session for this user
          const session = await voiceService.startVoiceSession(
            memberId,
            member.user.username,
            channel.id,
            channel.name
          );

          // Add to active sessions tracking with last seen timestamp
          activeVoiceSessions.set(memberId, {
            channelId: channel.id,
            joinTime: new Date(), // Use current time as join time for scanning
            sessionId: session.id,
            lastSeen: new Date(), // Track when user was last confirmed in voice
          });

          this.scanResults.trackingStarted++;
          usersStarted.push(member.user.username);

          console.log(
            `✅ Started tracking for ${member.user.username} in ${channel.name}`
          );
        } catch (userError) {
          console.error(
            `❌ Error starting tracking for user ${member.user.username}:`,
            userError
          );
          this.scanResults.errors++;
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
      this.scanResults.errors++;
    }
  }

  /**
   * Reset scan results for a new scan
   */
  resetScanResults() {
    this.scanResults = {
      totalUsersFound: 0,
      trackingStarted: 0,
      errors: 0,
      channels: [],
    };
  }

  /**
   * Check if a scan is currently in progress
   * @returns {boolean} True if scanning
   */
  isCurrentlyScanning() {
    return this.isScanning;
  }
}

export default new VoiceStateScanner();
