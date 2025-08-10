import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import {
  createTaskTemplate,
} from "../../utils/embedTemplates.ts";
import { db } from "../../db/db.ts";
import { tasksTable } from "../../db/schema.ts";
import { desc, eq } from "drizzle-orm";
import assert from "node:assert/strict";
import { DAILY_TASK_LIMIT, TASK_POINT_SCORE } from "../../utils/constants.ts";

export default {
  data: new SlashCommandBuilder()
    .setName("viewtasks")
    .setDescription("View all your tasks with their numbers"),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const discordId = interaction.user.id;

    const tasks = await db.select({
      title: tasksTable.title,
      isCompleted: tasksTable.isCompleted,
      completedAt: tasksTable.completedAt,
    }).from(tasksTable).where(
      eq(tasksTable.discordId, discordId)
    ).orderBy(desc(tasksTable.isCompleted), tasksTable.createdAt);

    assert(tasks.length < DAILY_TASK_LIMIT, `Expected tasks length to be less than ${DAILY_TASK_LIMIT} but found ${tasks.length}`);

    if (tasks.length === 0) {
      const embed = createTaskTemplate(interaction.user, [], {
        emptyState: true,
        emptyStateMessage:
          "🌟 **Ready to get productive?**\nUse `/addtask <description>` to create your first task!",
        helpText: `Tip: Completing tasks earns you ${TASK_POINT_SCORE} points each!`,
        useEnhancedLayout: true,
      });
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const incompleteTasks = tasks.filter(t => !t.isCompleted);
    const completedTasks = tasks.filter(t => t.isCompleted);

    // Calculate task statistics
    const totalTasks = tasks.length;
    const totalCompleted = completedTasks.length;
    const totalPending = incompleteTasks.length;
    const totalTaskPoints = totalCompleted * TASK_POINT_SCORE;
    const completionRate =
      totalTasks > 0 ? (totalCompleted / totalTasks) * 100 : 0;

    // Get daily task limit information
    await interaction.editReply({ embeds: [(createTaskTemplate(
        interaction.user,
        {
          incompleteTasks,
          completedTasks,
          stats: {
            totalTasks,
            totalCompleted,
            totalPending,
            totalTaskPoints,
            completionRate,
          },
        },
        {
          showProgress: true,
          includeRecentCompleted: true,
          useEnhancedLayout: true,
          useTableFormat: true,
          maxRecentCompleted: 5,
          showDailyLimit: true,
        }
      ))] });
    return;
  },
};
