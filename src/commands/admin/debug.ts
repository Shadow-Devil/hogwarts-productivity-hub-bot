import {
  SlashCommandBuilder,
  MessageFlags,
  EmbedBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import { getUserVoiceChannel } from "../../utils/voiceUtils.ts";
import {
  createHeader,
  formatDataTable,
  createStatsCard,
} from "../../utils/visualHelpers.ts";
import {
  activeVoiceSessions,
  gracePeriodSessions,
} from "../../events/voiceStateUpdate.ts";

export default {
  data: new SlashCommandBuilder()
    .setName("debug")
    .setDescription("Debug voice channel detection"),
  async execute(
    interaction: ChatInputCommandInteraction,
    { activeVoiceTimers }: { activeVoiceTimers: Map<string, any> }
  ) {
    try {
      // Defer reply immediately to prevent timeout issues
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

      console.log(`Debug command triggered by ${interaction.user.tag}`);

      // Get session tracking information
      const userSession = activeVoiceSessions.get(interaction.user.id);
      const userInGracePeriod = gracePeriodSessions.get(interaction.user.id);

      // Test voice channel detection
      const voiceChannel = await getUserVoiceChannel(interaction);

      if (voiceChannel) {
        console.log(
          `Voice channel found via cached member: ${voiceChannel.name} (${voiceChannel.id})`
        );

        // Check if there's an active timer in this voice channel
        let timerStatus = "No active timer";
        let timerPhase = "N/A";
        let timeRemaining = 0;

        if (activeVoiceTimers.has(voiceChannel.id)) {
          const timer = activeVoiceTimers.get(voiceChannel.id);
          timeRemaining = Math.ceil(
            (timer.endTime - new Date().getTime()) / 60000
          );
          timerStatus = "Active timer detected";
          timerPhase = timer.phase.toUpperCase();
        }

        const embed = new EmbedBuilder()
          .setTitle(
            createHeader(
              "Voice Channel Debug",
              "Detection Working",
              "🔍",
              "large"
            )
          )
          .setColor(0x00ff00)
          .setTimestamp();

        // Debug overview with enhanced grace period info
        let sessionTracked = "❌ Not Tracked";
        let sessionAge = 0;
        let gracePeriodInfo = "N/A";

        if (userSession) {
          sessionTracked = "✅ Tracked";
          sessionAge = Math.floor(
            (Date.now() - userSession.joinTime.getTime()) / (1000 * 60)
          );
        }

        if (userInGracePeriod) {
          const gracePeriodElapsed = Math.floor(
            (Date.now() - userInGracePeriod.gracePeriodStart) / (1000 * 60)
          );
          const gracePeriodRemaining = Math.max(0, 5 - gracePeriodElapsed);
          sessionTracked = "⏸️ Grace Period";
          gracePeriodInfo = `${gracePeriodRemaining} min remaining`;
        }

        const debugStats = createStatsCard(
          "Debug Status",
          {
            Detection: "✅ Working",
            "Channel Members": `${voiceChannel.members.size}`,
            "Session Tracking": sessionTracked,
            "Session Age": userSession ? `${sessionAge} min` : "N/A",
            "Grace Period": gracePeriodInfo,
            "Timer Status": timerStatus,
            Phase: timerPhase,
          },
          {
            emphasizeFirst: true,
          }
        );

        embed.setDescription(
          `Voice channel detection is working correctly!\n\n${debugStats}`
        );

        // Channel info in table format
        const channelData = [
          ["Channel Name", voiceChannel.name],
          ["Channel ID", voiceChannel.id],
          ["Channel Type", `${voiceChannel.type}`],
          ["Members Count", `${voiceChannel.members.size}`],
          ["Timer Status", timerStatus],
          [
            "Time Remaining",
            timeRemaining > 0 ? `${timeRemaining} minutes` : "N/A",
          ],
        ];

        const channelTable = formatDataTable(channelData, [18, 25]);

        embed.addFields([
          {
            name: createHeader("Channel Information", null, "📍", "emphasis"),
            value: channelTable,
            inline: false,
          },
        ]);

        if (activeVoiceTimers.has(voiceChannel.id)) {
          embed.addFields([
            {
              name: createHeader("Active Timer", null, "⏳", "emphasis"),
              value: `**Phase:** ${timerPhase}\n**Time Remaining:** ${timeRemaining} minutes`,
              inline: false,
            },
          ]);
        } else {
          embed.addFields([
            {
              name: createHeader("Timer Status", null, "✅", "emphasis"),
              value: "No active timer - Ready for new session!",
              inline: false,
            },
          ]);
        }

        await interaction.editReply({ embeds: [embed] });
      } else {
        console.log(`User ${interaction.user.tag} is not in any voice channel`);

        // Get global session statistics with grace period info
        const totalActiveSessions = activeVoiceSessions.size;
        const totalGracePeriodSessions = gracePeriodSessions
          ? gracePeriodSessions.size
          : 0;
        const sessionsOlderThanHour = Array.from(
          activeVoiceSessions.values()
        ).filter(
          (session) => Date.now() - session.joinTime.getTime() > 60 * 60 * 1000
        ).length;

        const embed = new EmbedBuilder()
          .setTitle(
            createHeader(
              "Voice Channel Debug",
              "No Channel Detected",
              "🔍",
              "large"
            )
          )
          .setColor(0xff0000)
          .setTimestamp();

        const debugStats = createStatsCard(
          "Debug Status",
          {
            Detection: "❌ No Channel",
            "User Status": "Not in Voice",
            "Active Sessions": `${totalActiveSessions}`,
            "Grace Period": `${totalGracePeriodSessions}`,
            "Long Sessions": `${sessionsOlderThanHour}`,
            Recommendation: "Join Voice Channel",
            "Commands Available": "Limited",
          },
          {
            emphasizeFirst: true,
          }
        );

        embed.setDescription(
          `No voice channel detected for your user.\n\n${debugStats}`
        );

        // Troubleshooting steps in table format
        const troubleshootingData = [
          ["Step 1", "Join a voice channel"],
          ["Step 2", "Check Discord permissions"],
          ["Step 3", "Try leaving and rejoining"],
          ["Step 4", "Restart Discord if needed"],
        ];

        const troubleshootingTable = formatDataTable(
          troubleshootingData,
          [10, 30]
        );

        embed.addFields([
          {
            name: createHeader("Troubleshooting Steps", null, "🔧", "emphasis"),
            value: troubleshootingTable,
            inline: false,
          },
        ]);

        await interaction.editReply({ embeds: [embed] });
      }
    } catch (error) {
      console.error("Error in /debug:", error);

      const errorMessage = "❌ Debug check failed. Please try again later.";
      try {
        if (interaction.deferred) {
          await interaction.editReply({ content: errorMessage });
        } else if (!interaction.replied) {
          await interaction.reply({
            content: errorMessage,
            flags: [MessageFlags.Ephemeral],
          });
        }
      } catch (err) {
        console.error("Error sending debug error reply:", err);
      }
    }
  },
};
