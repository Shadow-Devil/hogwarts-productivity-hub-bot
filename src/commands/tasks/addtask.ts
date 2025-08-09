import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import taskService from "../../services/taskService.ts";
import {
  createSuccessTemplate,
  createErrorTemplate,
} from "../../utils/embedTemplates.ts";
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
        .setMinLength(1)
        .setMaxLength(500)
    ),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      // Immediately defer to prevent timeout
      const deferred = await safeDeferReply(interaction);
      if (!deferred) {
        console.warn("Failed to defer addtask interaction");
        return;
      }

      const title = interaction.options.getString("title", true);

      // Validate title length and content
      if (title.trim().length === 0) {
        const embed = createErrorTemplate(
          `❌ Invalid Task Title`,
          "Task title cannot be empty. Please provide a meaningful description for your task.",
          {
            helpText: `ℹ️ Try: \`/addtask Write project proposal\``,
          }
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      if (title.length > 500) {
        const embed = createErrorTemplate(
          `⚠️ Task Title Too Long`,
          "Task title must be 500 characters or less for optimal readability.",
          {
            helpText: `ℹ️ Current length: ${title.length}/500 characters`,
          }
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Add the task
      const result = await taskService.addTask(
        interaction.user.id,
        title.trim()
      );

      if (result.success === false) {
        if (result.limitReached) {
          const resetTime = Math.floor(
            dayjs().add(1, "day").startOf("day").valueOf() / 1000
          );

          const embed = createErrorTemplate(
            `⚠️ Daily Task Limit Reached`,
            result.message,
            {
              helpText: `ℹ️ Daily Progress: ${result.stats.currentActions}/${result.stats.limit} task actions used`,
              additionalInfo: `**Remaining:** ${result.stats.remaining} actions • **Resets:** <t:${resetTime}:R>`,
            }
          );
          await interaction.editReply({ embeds: [embed] });
          return;
        } else {
          const embed = createErrorTemplate(
            `❌ Task Creation Failed`,
            result,
            { helpText: `ℹ️ Please try again` }
          );
          await interaction.editReply({ embeds: [embed] });
          return;
        }
      }

      const embed = createSuccessTemplate(
        `✅ Task Added Successfully!`,
        `**${result.task.title}**\n\n🚀 Your task has been added to your personal to-do list and is ready for completion.`,
        {
          celebration: true,
          points: 2,
        }
      );

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Error in /addtask:", error);

      const embed = createErrorTemplate(
        `❌ Task Creation Failed`,
        "An unexpected error occurred while adding your task. Please try again in a moment.",
        {
          helpText: `ℹ️ If this problem persists, contact support`,
        }
      );

      await safeErrorReply(interaction, embed);
    }
  },
};
