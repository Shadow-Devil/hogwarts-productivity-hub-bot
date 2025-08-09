import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import taskService from "../../services/taskService.ts";
import {
  createSuccessTemplate,
  createErrorTemplate,
} from "../../utils/embedTemplates.ts";
import {
  safeDeferReply,
  safeErrorReply,
} from "../../utils/interactionUtils.ts";
import dayjs from "dayjs";

export default {
  data: new SlashCommandBuilder()
    .setName("removetask")
    .setDescription("Remove a task from your to-do list")
    .addIntegerOption((option) =>
      option
        .setName("number")
        .setDescription(
          "The task number to remove (use /viewtasks to see numbers)"
        )
        .setRequired(true)
        .setMinValue(1)
    ),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      // Immediately defer to prevent timeout
      const deferred = await safeDeferReply(interaction);
      if (!deferred) {
        console.warn("Failed to defer removetask interaction");
        return;
      }

      const discordId = interaction.user.id;
      const taskNumber = interaction.options.getInteger("number");

      const result = await taskService.removeTask(discordId, taskNumber);

      if (result.success) {
        const resetTime = Math.floor(
          dayjs().add(1, "day").startOf("day").valueOf() / 1000
        );

        // Create slot information with reclaim status
        let slotInfo = "";

        if (result.stats) {
          const slotReclaimedText = result.slotReclaimed
            ? " ✨ **Slot Reclaimed!**"
            : result.slotReclaimed === false && "maxRecoverableSlots" in result
              ? " 🚫 **Slot Not Reclaimed**"
              : "";
          slotInfo = `\n\n**Daily Task Slots:** ${result.stats.remaining}/${result.stats.limit} remaining • **Resets:** <t:${resetTime}:R>${slotReclaimedText}`;
        }

        const embed = createSuccessTemplate(
          `✅ Task Removed Successfully`,
          `**${result.message}**\n\nℹ️ The task has been permanently removed from your to-do list.${slotInfo}`,
          {}
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      } else {
        const embed = createErrorTemplate(
          `❌ Task Removal Failed`,
          result.message,
          {
            helpText: `ℹ️ Use \`/viewtasks\` to check your task numbers`,
          }
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }
    } catch (error) {
      console.error("Error in /removetask:", error);

      const embed = createErrorTemplate(
        `❌ Task Removal Error`,
        "An unexpected error occurred while removing your task. Please try again in a moment.",
        {
          helpText: `ℹ️ If this problem persists, contact support`,
        }
      );

      await safeErrorReply(interaction, embed);
    }
  },
};
