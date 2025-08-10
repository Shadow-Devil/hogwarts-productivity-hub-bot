import { AutocompleteInteraction, ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import {
  createSuccessTemplate,
  createErrorTemplate,
} from "../../utils/embedTemplates.ts";
import { db, fetchTasks } from "../../db/db.ts";
import { tasksTable } from "../../db/schema.ts";
import { eq, and } from "drizzle-orm";
import { assert } from "console";

export default {
  data: new SlashCommandBuilder()
    .setName("canceltask")
    .setDescription("Remove a task from your to-do list")
    .addIntegerOption((option) =>
      option
        .setName("task")
        .setDescription(
          "The task to remove (use /viewtasks to see all)"
        )
        .setRequired(true)
        .setAutocomplete(true)
    ),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    interaction.deferReply();

    const discordId = interaction.user.id;
    const taskId = interaction.options.getInteger("task", true);

    const tasksResult = await db.delete(tasksTable).where(
      and(
        eq(tasksTable.discordId, discordId),
        eq(tasksTable.isCompleted, false),
        eq(tasksTable.id, taskId)
      )
    ).returning({ id: tasksTable.id, title: tasksTable.title });

    if (tasksResult.length === 0) {
      const embed = createErrorTemplate(
        `❌ Task Removal Failed`,
        "Task not found. Use `/viewtasks` to check your tasks.",
      );
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    assert(tasksResult.length === 1, "Expected exactly one task to be removed but found: " + tasksResult.length);

    await interaction.editReply({ embeds: [(createSuccessTemplate(
        `✅ Task Removed Successfully`,
        `**Removed task: "${tasksResult[0]!!.title}"**\n\nℹ️ The task has been permanently removed from your to-do list.`
      ))] });
    return;

  },
  autocomplete: async (interaction: AutocompleteInteraction) => {
    const results = await fetchTasks(interaction.user.id);
    interaction.respond(results.map(task => ({
      name: task.title,
      value: task.id,
    })));
  }
};
