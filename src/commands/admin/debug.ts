import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChatInputCommandInteraction,
  type APIEmbedField,
} from "discord.js";
import { getUserVoiceChannel } from "../../utils/voiceUtils.ts";
import {
  formatDataTable,
  createStatsCard,
} from "../../utils/visualHelpers.ts";
import { voiceSessionTable } from "../../db/schema.ts";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db/db.ts";
import type { Command } from "../../types.ts";
import assert from "node:assert";
import dayjs from "dayjs";

export default {
  data: new SlashCommandBuilder()
    .setName("debug")
    .setDescription("Debug voice channel detection"),
  async execute(
    interaction: ChatInputCommandInteraction,
    { activeVoiceTimers }
  ) {
    await interaction.deferReply();

    console.log(`Debug command triggered by ${interaction.user.tag}`);

    // Get session tracking information
    const [voiceSession] = await db.select({
      joinTime: voiceSessionTable.joinedAt,
    }).from(voiceSessionTable)
      .where(and(eq(voiceSessionTable.discordId, interaction.user.id), isNull(voiceSessionTable.leftAt)));

    // Test voice channel detection
    const voiceChannel = getUserVoiceChannel(interaction);

    if (voiceChannel) {
      console.log(`Voice channel found via cached member: ${voiceChannel.name} (${voiceChannel.id})`);

      // Check if there's an active timer in this voice channel
      let timerStatus = "No active timer";
      let timerPhase = "N/A";
      let timeRemaining = 0;

      if (activeVoiceTimers.has(voiceChannel.id)) {
        const timer = activeVoiceTimers.get(voiceChannel.id);
        assert(timer !== undefined, "Active timer should exist for this channel");
        timeRemaining = dayjs(timer.endTime).diff(dayjs(), 'minutes');
        timerStatus = "Active timer detected";
        timerPhase = timer.phase.toUpperCase();
      }
      // Debug overview with enhanced grace period info
      let sessionTracked = "❌ Not Tracked";
      let sessionAge = 0;

      if (voiceSession !== undefined) {
        sessionTracked = "✅ Tracked";
        sessionAge = Math.floor(
          (Date.now() - voiceSession.joinTime.getTime()) / (1000 * 60)
        );
      }

      const debugStats = createStatsCard(
        "Debug Status",
        {
          "Channel Members": `${voiceChannel.members.size}`,
          "Session Tracking": sessionTracked,
          "Session Age": voiceSession !== undefined ? `${sessionAge} min` : "N/A",
          "Timer Status": timerStatus,
          Phase: timerPhase,
        }
      );

      const fields: APIEmbedField[] = [{
        name: "Channel Information",
        // Channel info in table format
        value: formatDataTable([
          ["Channel Name", voiceChannel.name],
          ["Channel ID", voiceChannel.id],
          ["Channel Type", `${voiceChannel.type}`],
          ["Members Count", `${voiceChannel.members.size}`],
          ["Timer Status", timerStatus],
          ["Time Remaining", timeRemaining > 0 ? `${timeRemaining} minutes` : "N/A"],
        ]),
        inline: false,
      },];

      if (activeVoiceTimers.has(voiceChannel.id)) {
        fields.push({
          name: "Active Timer",
          value: `**Phase:** ${timerPhase}\n**Time Remaining:** ${timeRemaining} minutes`,
          inline: false,
        });
      } else {
        fields.push({
          name: "Timer Status",
          value: "No active timer - Ready for new session!",
          inline: false,
        });
      }

      await interaction.editReply({
        embeds: [{
          title: "Voice Channel Debug",
          color: 0x00ff00,
          description: `Voice channel detection is working correctly!\n\n${debugStats}`,
          fields
        }]
      });
    } else {
      console.log(`User ${interaction.user.tag} is not in any voice channel`);

      // Get global session statistics with grace period info
      const totalActiveSessions = await db.$count(voiceSessionTable, isNull(voiceSessionTable.leftAt));
      const debugStats = createStatsCard(
        "Debug Status",
        {
          Detection: "❌ No Channel",
          "User Status": "Not in Voice",
          "Active Sessions": `${totalActiveSessions}`,
          Recommendation: "Join Voice Channel",
          "Commands Available": "Limited",
        }
      );


      await interaction.editReply({
        embeds: [{
          color: 0xff0000,
          title: "Voice Channel Debug",
          description: `No voice channel detected for your user.\n\n${debugStats}`,
          fields: [{
            name: "Troubleshooting Steps",
            // Troubleshooting steps in table format
            value: formatDataTable(
              [
                ["Step 1", "Join a voice channel"],
                ["Step 2", "Check Discord permissions"],
                ["Step 3", "Try leaving and rejoining"],
                ["Step 4", "Restart Discord if needed"],
              ]
            ),
            inline: false,
          },
          ]
        }]
      });
    }
  },
} as Command;
