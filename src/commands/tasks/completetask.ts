import { AutocompleteInteraction, ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import {
  createSuccessTemplate,
  createErrorTemplate,
} from "../../utils/embedTemplates.ts";
import dayjs from "dayjs";
import { db } from "../../db/db.ts";
import { tasksTable, usersTable } from "../../db/schema.ts";
import { eq, and, sql } from "drizzle-orm";

const TASK_POINT_SCORE = 2;


export default {
  data: new SlashCommandBuilder()
    .setName("completetask")
    .setDescription("Mark a task as complete and earn 2 points")
    .addIntegerOption((option) =>
      option
        .setName("task")
        .setDescription(
          "The task number to complete (use /viewtasks to see numbers)"
        )
        .setRequired(true)
        .setAutocomplete(true)
    ),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const discordId = interaction.user.id;
    const taskId = interaction.options.getInteger("task", true);

    // Get all incomplete tasks for the user, ordered by creation date
    const tasksResult = await db.select().from(tasksTable).where(and(
      eq(tasksTable.discordId, discordId),
      eq(tasksTable.isCompleted, false),
      eq(tasksTable.id, taskId))
    ).orderBy(tasksTable.createdAt);

    if (tasksResult.length === 0) {
      await interaction.editReply({
        embeds: [createErrorTemplate(
          `❌ Task Completion Failed`,
          `Could not find task. Use \`/viewtasks\` to check your tasks`,
        )]
      });
      return;
    }

    const taskToComplete = tasksResult[0]!!;
    if (dayjs().diff(dayjs(taskToComplete.createdAt), 'minute') < 20) {
      await interaction.editReply({
        embeds: [createErrorTemplate(
          `❌ Task Completion Failed`,
          `You can only complete tasks that are at least 20 minutes old. Please try again later.`,
        )]
      });
      return;
    }


    // Mark task as complete
    db.transaction(async (tx) => {
      await tx.update(tasksTable)
        .set({
          isCompleted: true,
          completedAt: new Date(),
        })
        .where(eq(tasksTable.id, taskToComplete.id));
      // Update user's total points
      await tx.update(usersTable)
        .set({
          totalPoints: sql`${usersTable.totalPoints} + ${TASK_POINT_SCORE}`,
        })
        .where(eq(usersTable.discordId, discordId));
    });

    await interaction.editReply({
      embeds: [(createSuccessTemplate(
        `✅ Task Completed Successfully!`,
        `**✅ Completed: "${taskToComplete.title}" (+${TASK_POINT_SCORE} points)**\n\n🚀 Great job on completing your task! Keep up the momentum and continue building your productivity streak.`,
        {
          celebration: true,
          points: 2,
          includeEmoji: true,
          useEnhancedLayout: true,
          useTableFormat: true,
          showBigNumbers: true,
        }
      ))]
    });
  },
  autocomplete: async (interaction: AutocompleteInteraction) => {
    const results = await db.select({ title: tasksTable.title, id: tasksTable.id }).from(tasksTable).where(
      and(
        eq(tasksTable.discordId, interaction.user.id),
        eq(tasksTable.isCompleted, false)
      )
    );
    interaction.respond(results.map((task) => ({
      name: task.title,
      value: task.id,
    })));
  }
};
