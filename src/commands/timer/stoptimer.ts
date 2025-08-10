import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { getUserVoiceChannel } from "../../utils/voiceUtils.ts";
import {
  createSuccessTemplate,
  createErrorTemplate,
} from "../../utils/embedTemplates.ts";
import {
  safeDeferReply,
  safeErrorReply,
  safeReply,
} from "../../utils/interactionUtils.ts";
import dayjs from "dayjs";
import { fetchUserTimezone } from "../../db/db.ts";

export default {
  data: new SlashCommandBuilder()
    .setName("stoptimer")
    .setDescription("Stop the active Pomodoro timer in your voice channel"),
  async execute(
    interaction: ChatInputCommandInteraction,
    { activeVoiceTimers }: {
      activeVoiceTimers: Map<string, { endTime: number; phase: string; startTime: number; workTimeout?: NodeJS.Timeout; breakTimeout?: NodeJS.Timeout }>;
    }
  ): Promise<void> {
    try {
      // Immediately defer to prevent timeout
      const deferred = await safeDeferReply(interaction);
      if (!deferred) {
        console.warn("Failed to defer stoptimer interaction");
        return;
      }

      // Use the reliable voice channel detection utility
      const voiceChannel = await getUserVoiceChannel(interaction);

      if (!voiceChannel) {
        const embed = createErrorTemplate(
          `Voice Channel Required`,
          "You must be in a voice channel to stop a timer and manage your productivity sessions.\nJoin the voice channel with an active timer\nTimer controls are tied to your current voice channel location.",
        );
        await safeReply(interaction, { embeds: [embed] });
        return;
      }

      const voiceChannelId = voiceChannel.id;
      if (!activeVoiceTimers.has(voiceChannelId)) {
        const embed = createErrorTemplate(
          `No Active Timer Found`,
          `No Pomodoro timer is currently running in <#${voiceChannelId}>. There's nothing to stop!\nUse \`/timer <work_minutes>\` to start a new Pomodoro session\nCheck \`/time\` to see if there are any active timers in your current voice channel.`,
        );
        await interaction.reply({ embeds: [embed] });
        return;
      }
      const timer = activeVoiceTimers.get(voiceChannelId);
      if (timer && timer.workTimeout) clearTimeout(timer.workTimeout);
      if (timer && timer.breakTimeout) clearTimeout(timer.breakTimeout);
      activeVoiceTimers.delete(voiceChannelId);

      const embed = createSuccessTemplate(
        `✅ Timer Stopped Successfully`,
        `Your Pomodoro timer in <#${voiceChannelId}> has been stopped. 🚀 No worries - every session counts towards building your productivity habits!`,
        {}
      );

      // Add timezone context showing when timer was stopped
      try {
        const userTimezone = await fetchUserTimezone(
          interaction.user.id
        );
        const stopTime = dayjs().tz(userTimezone);
        const timerFooter = `🌍 Timer stopped at: ${stopTime.format("h:mm A")} (${userTimezone}) | Use /timer to start a new session`;

        embed.setFooter({ text: timerFooter });
      } catch (error) {
        console.warn(
          "Could not add timezone info to timer stop:",
          error
        );
        embed.setFooter({
          text: "Use /timer to start a new session when ready",
        });
      }

      await interaction.editReply({ embeds: [embed] });
      return;
    } catch (error) {
      console.error("Error in /stoptimer:", error);

      const embed = createErrorTemplate(
        `Timer Stop Failed`,
        "An error occurred while stopping your timer. Please try again in a moment.",
      );

      await safeErrorReply(interaction, embed);
    }
  },
};
