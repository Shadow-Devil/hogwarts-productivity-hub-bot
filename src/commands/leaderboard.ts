import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import * as voiceService from "../services/voiceService.ts";
import * as timezoneService from "../services/timezoneService.ts";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import {
  createLeaderboardTemplate,
  createErrorTemplate,
} from "../utils/embedTemplates.ts";
import { safeDeferReply, safeErrorReply } from "../utils/interactionUtils.ts";

// Extend dayjs with timezone support
dayjs.extend(utc);
dayjs.extend(timezone);

export default {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View voice channel time leaderboards")
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("Choose leaderboard type")
        .setRequired(true)
        .addChoices(
          { name: "📅 Monthly", value: "monthly" },
          { name: "🌟 All Time", value: "alltime" }
        )
    ),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      // Immediately defer to prevent timeout
      const deferred = await safeDeferReply(interaction);
      if (!deferred) {
        console.warn("Failed to defer leaderboard interaction");
        return;
      }

      const leaderboardType = interaction.options.getString("type", true);
      const leaderboard =
        await voiceService.getLeaderboardOptimized(leaderboardType);

      if (!leaderboard || leaderboard.length === 0) {
        const embed = createErrorTemplate(
          `ℹ️ No Leaderboard Data`,
          "No data is available for the leaderboard yet. Be the first to start tracking your voice time!",
          {
            helpText: "Join a voice channel to start accumulating hours",
            additionalInfo:
              "Your time in voice channels automatically contributes to both monthly and all-time rankings.",
          }
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Get current user information for the template
      const currentUserId = interaction.user.id;

      const embed = createLeaderboardTemplate(
        leaderboardType,
        leaderboard,
        {
          id: currentUserId,
          username: interaction.user.username,
        },
        {
          maxEntries: 10,
          showUserPosition: true,
          includeMedals: true,
          includeStats: true,
          useEnhancedLayout: true,
          useTableFormat: true,
        }
      );

      // Add timezone context to footer for monthly leaderboards
      if (leaderboardType === "monthly") {
        try {
          const userTimezone =
            await timezoneService.getUserTimezone(currentUserId);
          const monthStart = dayjs().tz(userTimezone).startOf("month");
          const monthEnd = dayjs().tz(userTimezone).endOf("month");

          const footerText = `🗓️ Monthly period: ${monthStart.format("MMM D")} - ${monthEnd.format("MMM D, YYYY")} (${userTimezone}) | Global rankings update hourly`;
          embed.setFooter({ text: footerText });
        } catch (error) {
          console.warn(
            "Could not add timezone info to leaderboard:",
            error
          );
          embed.setFooter({
            text: "🗓️ Monthly rankings reset on 1st of each month | Global rankings update hourly",
          });
        }
      } else {
        embed.setFooter({
          text: "🏆 All-time rankings since bot launch | Updated in real-time",
        });
      }

      await interaction.editReply({ embeds: [embed] });
      return;
    } catch (error) {
      console.error("Error in /leaderboard:", error);

      const embed = createErrorTemplate(
        `❌ Leaderboard Load Failed`,
        "An error occurred while fetching the leaderboard data. Please try again in a moment.",
        {
          helpText: `ℹ️ If this problem persists, contact support`,
        }
      );

      await safeErrorReply(interaction, embed);
    }
  },
};
