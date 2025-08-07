import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import taskService from "../../services/taskService.ts";
import {
  createSuccessTemplate,
  createErrorTemplate,
} from "../../utils/embedTemplates.ts";
import { StatusEmojis } from "../../utils/constants.ts";
import {
  safeDeferReply,
  safeErrorReply,
} from "../../utils/interactionUtils.ts";
import dayjs from "dayjs";

export default {
  data: new SlashCommandBuilder()
    .setName("completetask")
    .setDescription("Mark a task as complete and earn 2 points")
    .addIntegerOption((option) =>
      option
        .setName("number")
        .setDescription(
          "The task number to complete (use /viewtasks to see numbers)"
        )
        .setRequired(true)
        .setMinValue(1)
    ),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      // Immediately defer to prevent timeout
      const deferred = await safeDeferReply(interaction);
      if (!deferred) {
        console.warn("Failed to defer completetask interaction");
        return;
      }

      const discordId = interaction.user.id;
      const taskNumber = interaction.options.getInteger("number");
      const member = interaction.member;

      const result = await taskService.completeTask(
        discordId,
        taskNumber,
        member
      );

      if (result.success === false) {
        if ("limitReached" in result && result.limitReached) {
          const resetTime = Math.floor(
            dayjs().add(1, "day").startOf("day").valueOf() / 1000
          );

          const embed = createErrorTemplate(
            `${StatusEmojis.WARNING} Daily Task Limit Reached`,
            result.message,
            {
              helpText: `${StatusEmojis.INFO} Daily Progress: ${result.stats.currentActions}/${result.stats.limit} task actions used`,
              additionalInfo: `**Remaining:** ${result.stats.remaining} actions\n**Resets:** <t:${resetTime}:R>`,
            }
          );
          await interaction.editReply({ embeds: [embed] });
          return;
        } else {
          const embed = createErrorTemplate(
            `${StatusEmojis.ERROR} Task Completion Failed`,
            result.message,
            {
              helpText: `${StatusEmojis.INFO} Use \`/viewtasks\` to check your task numbers`,
            }
          );
          await interaction.editReply({ embeds: [embed] });
          return;
        }
      } else {
        const embed = createSuccessTemplate(
          `${StatusEmojis.COMPLETED} Task Completed Successfully!`,
          `**${result.message}**\n\n${StatusEmojis.READY} Great job on completing your task! Keep up the momentum and continue building your productivity streak.`,
          {
            celebration: true,
            points: 2,
            includeEmoji: true,
            useEnhancedLayout: true,
            useTableFormat: true,
            showBigNumbers: true,
            additionalInfo: `${StatusEmojis.IN_PROGRESS} **Daily Progress:** ${result.stats.total_task_actions}/${result.stats.limit} task actions used • **${result.stats.remaining} remaining**`,
          }
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }
    } catch (error) {
      console.error("Error in /completetask:", error);

      const embed = createErrorTemplate(
        `${StatusEmojis.ERROR} Task Completion Error`,
        "An unexpected error occurred while completing your task. Please try again in a moment.",
        {
          helpText: `${StatusEmojis.INFO} If this problem persists, contact support`,
        }
      );

      await safeErrorReply(interaction, embed);
    }
  },
};
