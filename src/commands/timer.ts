import { SlashCommandBuilder, MessageFlags, ChatInputCommandInteraction } from "discord.js";
import { getUserVoiceChannel } from "../utils/voiceUtils.ts";
import {
  createTimerTemplate,
  createErrorTemplate,
} from "../utils/embedTemplates.ts";
import {
  safeDeferReply,
  safeErrorReply,
  safeReply,
} from "../utils/interactionUtils.ts";
import dayjs from "dayjs";
import type { Command } from "../commands.ts";
import { fetchUserTimezone } from "../db/db.ts";


export default {
  data: new SlashCommandBuilder()
    .setName("timer")
    .setDescription("Start a work + break timer")
    .addIntegerOption((opt) =>
      opt
        .setName("work")
        .setDescription("Work time in minutes (min 20)")
        .setRequired(true)
        .setMinValue(20)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("break")
        .setDescription("Break time in minutes (optional, min 5)")
        .setRequired(false)
        .setMinValue(5)
    ),
  async execute(
    interaction: ChatInputCommandInteraction,
    { activeVoiceTimers }
  ): Promise<void> {
    try {
      // Immediately defer to prevent timeout
      const deferred = await safeDeferReply(interaction);
      if (!deferred) {
        console.warn("Failed to defer timer interaction");
        return;
      }

      // Use the reliable voice channel detection utility
      const voiceChannel = await getUserVoiceChannel(interaction);

      if (voiceChannel === null) {
        const embed = createErrorTemplate(
          `❌ Voice Channel Required`,
          "You must be in a voice channel to start a Pomodoro timer and track your productivity.",
          {
            helpText: `ℹ️ Join any voice channel first, then try again`,
            additionalInfo:
              "Timers help you maintain focus during productive voice sessions.",
          }
        );

        await safeReply(interaction, {
          embeds: [embed],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const voiceChannelId = voiceChannel.id;
      // Enforce: only one timer per voice channel
      if (activeVoiceTimers.has(voiceChannelId)) {
        const existingTimer = activeVoiceTimers.get(voiceChannelId);

        // Safety check for timer data integrity
        if (!existingTimer || !existingTimer.endTime || !existingTimer.phase) {
          console.warn(
            `Corrupted timer data found for channel ${voiceChannelId}, cleaning up...`
          );
          activeVoiceTimers.delete(voiceChannelId);
        } else {
          const timeRemaining = Math.ceil(
            (existingTimer.endTime - new Date().getTime()) / 60000
          );

          // If timer has already expired, clean it up
          if (timeRemaining <= 0) {
            console.log(
              `Expired timer found for channel ${voiceChannelId}, cleaning up...`
            );
            if (existingTimer.workTimeout)
              clearTimeout(existingTimer.workTimeout);
            if (existingTimer.breakTimeout)
              clearTimeout(existingTimer.breakTimeout);
            activeVoiceTimers.delete(voiceChannelId);
          } else {
            // Timer is valid and active, reject the new timer request
            const embed = createErrorTemplate(
              `⚠️ Timer Already Running`,
              `A Pomodoro timer is already active in <#${voiceChannelId}>! Only one timer per voice channel is allowed.`,
              {
                helpText: `ℹ️ Use \`/stoptimer\` to stop the current timer first`,
                additionalInfo: `**Current Phase:** ${existingTimer.phase.toUpperCase()}\n**Time Remaining:** ${timeRemaining} minutes`,
              }
            );

            if (!interaction.replied && !interaction.deferred) {
              await safeReply(interaction, {
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
              });
            }
            return;
          }
        }
      }
      const work = interaction.options.getInteger("work", true);
      const breakTime = interaction.options.getInteger("break") || 0;
      if (work < 20 || (breakTime > 0 && breakTime < 5)) {
        const embed = createErrorTemplate(
          `⚠️ Invalid Timer Values`,
          "Please ensure your timer values meet the minimum requirements for effective productivity sessions.",
          {
            helpText: `ℹ️ Try again with valid values`,
            additionalInfo:
              "**Minimum Requirements:** Work Time: **20 minutes** • Break Time: **5 minutes** (if specified)",
          }
        );

        await safeReply(interaction, {
          embeds: [embed],
          flags: MessageFlags.Ephemeral,
        });
      }
      const userTimezone = await fetchUserTimezone(
        interaction.user.id
      );
      const now = dayjs().tz(userTimezone);
      const startTime = now.format("HH:mm");
      const endTime = now.add(work, "minutes").format("HH:mm");
      const breakEndTime =
        breakTime > 0
          ? now.add(work + breakTime, "minutes").format("HH:mm")
          : null;

      const embed = createTimerTemplate(
        "start",
        {
          workTime: work,
          breakTime: breakTime,
          voiceChannel: voiceChannel,
          phase: "work",
          startTime: startTime,
          endTime: endTime,
          breakEndTime: breakEndTime,
        },
        {
          showProgress: true,
          includeMotivation: true,
        }
      );

      await safeReply(interaction, { embeds: [embed] });

      // Add timezone context to timer start message
      try {
        // Update the embed footer with timezone info
        const updatedEmbed = createTimerTemplate(
          "start",
          {
            workTime: work,
            breakTime: breakTime,
            voiceChannel: voiceChannel,
            phase: "work",
          },
          {
            showProgress: true,
            includeMotivation: true,
          }
        );

        await interaction.editReply({ embeds: [updatedEmbed] });
      } catch (error) {
        console.warn("Could not add timezone info to timer:", error);
        // Timer already started, timezone display is optional
      }
      const workTimeout = setTimeout(
        async () => {
          try {
            const workCompleteEmbed = createTimerTemplate("work_complete", {
              workTime: work,
              breakTime: breakTime,
              voiceChannel: voiceChannel,
              phase: "work_complete",
            });

            await interaction.followUp({
              content: `<@${interaction.user.id}>`,
              embeds: [workCompleteEmbed],
            });
          } catch (err) {
            console.error("Error sending work over message:", err);
          }
          if (breakTime > 0) {
            const breakTimeout = setTimeout(
              async () => {
                try {
                  const breakCompleteEmbed = createTimerTemplate(
                    "break_complete",
                    {
                      workTime: work,
                      breakTime: breakTime,
                      voiceChannel: voiceChannel,
                      phase: "break_complete",
                    }
                  );

                  await interaction.followUp({
                    content: `<@${interaction.user.id}>`,
                    embeds: [breakCompleteEmbed],
                  });
                } catch (err) {
                  console.error("Error sending break over message:", err);
                }
                activeVoiceTimers.delete(voiceChannelId);
              },
              breakTime * 60 * 1000
            );
            activeVoiceTimers.set(voiceChannelId, {
              breakTimeout,
              phase: "break",
              endTime: new Date(Date.now() + breakTime * 60 * 1000),
            });
          } else {
            activeVoiceTimers.delete(voiceChannelId);
          }
        },
        work * 60 * 1000
      );
      activeVoiceTimers.set(voiceChannelId, {
        workTimeout,
        phase: "work",
        endTime: new Date(Date.now() + work * 60 * 1000),
      });
    } catch (error) {
      console.error("Error in /timer:", error);

      const embed = createErrorTemplate(
        "Timer Creation Failed",
        "An unexpected error occurred while starting your Pomodoro timer. Please try again in a moment.",
        { helpText: "If this problem persists, contact support" }
      );

      await safeErrorReply(interaction, embed);
    }
  },
} as Command;
