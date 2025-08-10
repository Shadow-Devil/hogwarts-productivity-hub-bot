import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { getUserVoiceChannel } from "../../utils/voiceUtils.ts";
import {
  createTimerTemplate,
  createErrorTemplate,
} from "../../utils/embedTemplates.ts";
import { safeDeferReply, safeErrorReply } from "../../utils/interactionUtils.ts";
import dayjs from "dayjs";
import assert from "node:assert/strict";
import { fetchUserTimezone } from "../../db/db.ts";


export default {
  data: new SlashCommandBuilder()
    .setName("time")
    .setDescription("Check your active Pomodoro timer status"),
  async execute(
    interaction: ChatInputCommandInteraction,
    { activeVoiceTimers }: {
      activeVoiceTimers: Map<string, { endTime: number; phase: "work" | "break"; startTime: number }>;
    }
  ): Promise<void> {
    try {
      // Immediately defer to prevent timeout
      const deferred = await safeDeferReply(interaction);
      if (!deferred) {
        console.warn("Failed to defer time interaction");
        return;
      }

      // Get user's voice channel
      const voiceChannel = await getUserVoiceChannel(interaction);

      if (!voiceChannel) {
        const embed = createErrorTemplate(
          `❌ Voice Channel Required`,
          "You must be in a voice channel to check timer status and track your productivity sessions.",
          {
            helpText: "Join a voice channel first, then try again",
            additionalInfo:
              "Timer status is tied to your current voice channel location.",
          }
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const voiceChannelId = voiceChannel.id;

      // Check if there's an active timer in this voice channel
      if (!activeVoiceTimers.has(voiceChannelId)) {
        const embed = createTimerTemplate(
          "no_timer",
          {
            voiceChannel: voiceChannel,
          },
          { includeMotivation: true }
        );

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Get timer info
      const timer = activeVoiceTimers.get(voiceChannelId);
      assert(timer !== undefined, "Timer should exist for active voice channel");

      const now = new Date().getTime();
      const timeRemaining = Math.max(
        0,
        Math.ceil((timer.endTime - now) / 1000 / 60)
      );

      const embed = createTimerTemplate(
        "status",
        {
          voiceChannel: voiceChannel,
          phase: timer.phase,
          timeRemaining: timeRemaining,
          workTime:
            timer.phase === "work"
              ? timeRemaining + Math.ceil((now - timer.startTime) / 1000 / 60)
              : null,
          breakTime:
            timer.phase === "break"
              ? timeRemaining + Math.ceil((now - timer.startTime) / 1000 / 60)
              : null,
        },
        { showProgress: true }
      );

      // Add timezone context to timer status
      try {
        const userTimezone = await fetchUserTimezone(
          interaction.user.id
        );
        const sessionEndTime = dayjs(timer.endTime).tz(userTimezone);
        const localTime = dayjs().tz(userTimezone);

        // Create timezone-aware footer
        const timerFooter = `🌍 Session ends at: ${sessionEndTime.format("h:mm A")} (${userTimezone}) | Local time: ${localTime.format("h:mm A")}`;

        // Update embed with timezone footer
        embed.setFooter({ text: timerFooter });
      } catch (error) {
        console.warn(
          "Could not add timezone info to timer status:",
          error
        );
        // Use default footer if timezone fails
        embed.setFooter({
          text: "Use /stoptimer to stop early • Stay focused!",
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Error in /time command:", error);

      const embed = createErrorTemplate(
        `❌ Timer Status Check Failed`,
        "An error occurred while checking your timer status. Please try again in a moment.",
        {
          helpText: `ℹ️ If this problem persists, contact support`,
        }
      );

      await safeErrorReply(interaction, embed);
    }
  },
};
