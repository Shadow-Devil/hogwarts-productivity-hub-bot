import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import taskService from "../../services/taskService.ts";
import {
  createSuccessTemplate,
  createErrorTemplate,
} from "../../utils/embedTemplates.ts";
import { StatusEmojis } from "../../utils/constants.ts";
import { safeDeferReply, safeErrorReply } from "../../utils/interactionUtils.ts";
import dayjs from "dayjs";

export default {
  data: new SlashCommandBuilder()
    .setName("addtask")
    .setDescription("Add a new task to your personal to-do list")
    .addStringOption((option) =>
      option
        .setName("title")
        .setDescription("The task description")
        .setRequired(true)
        .setMaxLength(500),
    ),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      // Immediately defer to prevent timeout
      const deferred = await safeDeferReply(interaction);
      if (!deferred) {
        console.warn("Failed to defer addtask interaction");
        return;
      }

      const discordId = interaction.user.id;
      const title = interaction.options.getString("title");

      // Validate title length and content
      if (title.trim().length === 0) {
        const embed = createErrorTemplate(
          `${StatusEmojis.ERROR} Invalid Task Title`,
          "Task title cannot be empty. Please provide a meaningful description for your task.",
          {
            helpText: `${StatusEmojis.INFO} Try: \`/addtask Write project proposal\``,
          },
        );
        await interaction.editReply({ embeds: [embed] });
        return
      }

      if (title.length > 500) {
        const embed = createErrorTemplate(
          `${StatusEmojis.WARNING} Task Title Too Long`,
          "Task title must be 500 characters or less for optimal readability.",
          {
            helpText: `${StatusEmojis.INFO} Current length: ${title.length}/500 characters`,
          },
        );
        await interaction.editReply({ embeds: [embed] });
        return
      }

      // Add the task
      const result = await taskService.addTask(discordId, title.trim());

      if (result.success === false) {
        if (result.limitReached) {
          const resetTime = Math.floor(
            dayjs().add(1, "day").startOf("day").valueOf() / 1000,
          );

          const embed = createErrorTemplate(
            `${StatusEmojis.WARNING} Daily Task Limit Reached`,
            result.message,
            {
              helpText: `${StatusEmojis.INFO} Daily Progress: ${result.stats.currentActions}/${result.stats.limit} task actions used`,
              additionalInfo: `**Remaining:** ${result.stats.remaining} actions • **Resets:** <t:${resetTime}:R>`,
            },
          );
          await interaction.editReply({ embeds: [embed] });
          return;
        } else {
          const embed = createErrorTemplate(
            `${StatusEmojis.ERROR} Task Creation Failed`,
            result.message,
            { helpText: `${StatusEmojis.INFO} Please try again` },
          );
          await interaction.editReply({ embeds: [embed] });
          return;
        }
      }

      const embed = createSuccessTemplate(
        `${StatusEmojis.COMPLETED} Task Added Successfully!`,
        `**${result.task.title}**\n\n${StatusEmojis.READY} Your task has been added to your personal to-do list and is ready for completion.`,
        {
          celebration: true,
          points: 2,
        }
      );

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Error in /addtask:", error);

      const embed = createErrorTemplate(
        `${StatusEmojis.ERROR} Task Creation Failed`,
        "An unexpected error occurred while adding your task. Please try again in a moment.",
        {
          helpText: `${StatusEmojis.INFO} If this problem persists, contact support`,
        },
      );

      await safeErrorReply(interaction, embed);
    }
  },
};
