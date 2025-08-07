import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from "discord.js";
import {
  createHeader,
  formatDataTable,
  createStatsCard,
} from "../utils/visualHelpers.ts";
import { BotColors } from "../utils/constants.ts";
// Get grace period and active sessions
import {
  activeVoiceSessions,
  gracePeriodSessions,
} from "../events/voiceStateUpdate.ts";

export default {
  data: new SlashCommandBuilder()
    .setName("graceperiod")
    .setDescription(
      "View grace period sessions for users with connection issues",
    ),
  async execute(interaction) {
    try {
      // Defer reply immediately
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

      const embed = new EmbedBuilder()
        .setTitle(
          createHeader(
            "Grace Period Status",
            "Connection Stability Monitor",
            "⏸️",
            "large",
          ),
        )
        .setColor(BotColors.INFO)
        .setTimestamp();

      // Overall statistics
      const totalActive = activeVoiceSessions.size;
      const totalGracePeriod = gracePeriodSessions
        ? gracePeriodSessions.size
        : 0;

      const statsCard = createStatsCard(
        "Session Overview",
        {
          "Active Sessions": `${totalActive}`,
          "Grace Period": `${totalGracePeriod}`,
          "Total Tracked": `${totalActive + totalGracePeriod}`,
          "Grace Period %":
            totalActive + totalGracePeriod > 0
              ? `${Math.round((totalGracePeriod / (totalActive + totalGracePeriod)) * 100)}%`
              : "0%",
        },
        {
          showBigNumbers: true,
          emphasizeFirst: true,
        },
      );

      embed.setDescription(
        `Monitor users experiencing connection issues\n\n${statsCard}`,
      );

      // Grace period sessions details
      if (gracePeriodSessions && gracePeriodSessions.size > 0) {
        const gracePeriodData = [];
        const GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes

        for (const [userId, sessionData] of gracePeriodSessions.entries()) {
          try {
            const gracePeriodElapsed =
              Date.now() - sessionData.gracePeriodStart;
            const gracePeriodRemaining = Math.max(
              0,
              Math.floor((GRACE_PERIOD_MS - gracePeriodElapsed) / (1000 * 60)),
            );
            const sessionAge = Math.floor(
              (Date.now() - sessionData.joinTime.getTime()) / (1000 * 60),
            );

            // Get username (truncated for display)
            let username = "Unknown";
            try {
              const user = await interaction.client.users.fetch(userId);
              username =
                user.username.length > 12
                  ? user.username.substring(0, 9) + "..."
                  : user.username;
            } catch (error) {
              username = `User ${userId.substring(0, 6)}...`;
            }

            gracePeriodData.push([
              username,
              `${gracePeriodRemaining}m left`,
              `${sessionAge}m total`,
            ]);
          } catch (error) {
            console.error(
              `Error processing grace period session ${userId}:`,
              error,
            );
          }
        }

        if (gracePeriodData.length > 0) {
          const gracePeriodTable = formatDataTable(
            gracePeriodData,
            [14, 10, 12],
          );

          embed.addFields([
            {
              name: createHeader(
                "Users in Grace Period",
                null,
                "⏳",
                "emphasis",
              ),
              value: gracePeriodTable,
              inline: false,
            },
          ]);
        }
      } else {
        embed.addFields([
          {
            name: createHeader("Grace Period Sessions", null, "✅", "emphasis"),
            value:
              "No users currently in grace period - all connections stable!",
            inline: false,
          },
        ]);
      }

      // Active sessions summary
      if (activeVoiceSessions.size > 0) {
        const longSessions = Array.from(activeVoiceSessions.values())
          .filter(
            (session) =>
              !gracePeriodSessions ||
              !gracePeriodSessions.has(
                Array.from(activeVoiceSessions.keys()).find(
                  (key) => activeVoiceSessions.get(key) === session,
                ),
              ),
          )
          .filter(
            (session) =>
              Date.now() - session.joinTime.getTime() > 60 * 60 * 1000,
          ).length;

        const recentSessions = Array.from(activeVoiceSessions.values())
          .filter(
            (session) =>
              !gracePeriodSessions ||
              !gracePeriodSessions.has(
                Array.from(activeVoiceSessions.keys()).find(
                  (key) => activeVoiceSessions.get(key) === session,
                ),
              ),
          )
          .filter(
            (session) =>
              Date.now() - session.joinTime.getTime() <= 60 * 60 * 1000,
          ).length;

        const activeStatsData = [
          ["Stable Sessions", `${longSessions + recentSessions}`],
          ["Long Sessions (1h+)", `${longSessions}`],
          ["Recent Sessions", `${recentSessions}`],
          ["Connection Issues", `${totalGracePeriod}`],
        ];

        const activeStatsTable = formatDataTable(activeStatsData, [16, 10]);

        embed.addFields([
          {
            name: createHeader("Session Health", null, "📊", "emphasis"),
            value: activeStatsTable,
            inline: false,
          },
        ]);
      }

      // Add helpful information
      embed.addFields([
        {
          name: createHeader("Grace Period Info", null, "ℹ️", "emphasis"),
          value:
            "**Purpose:** Prevents session loss for users with unstable connections • **Duration:** 5 minutes maximum • **Behavior:** Voice tracking continues during brief disconnections • **Benefits:** Maintains session continuity and 55-minute rounding accuracy",
          inline: false,
        },
      ]);

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Error in /graceperiod:", error);

      const errorMessage =
        "❌ Grace period check failed. Please try again later.";
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
        console.error("Error sending grace period error reply:", err);
      }
    }
  },
};
