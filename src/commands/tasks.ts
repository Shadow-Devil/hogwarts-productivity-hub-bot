import { AutocompleteInteraction, ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import {
  createSuccessTemplate,
  createErrorTemplate,
  createTaskTemplate,
} from "../utils/embedTemplates.ts";
import dayjs from "dayjs";
import { db, ensureUserExists, fetchTasks, fetchUserTimezone } from "../db/db.ts";
import { tasksTable, usersTable } from "../db/schema.ts";
import { and, desc, eq, sql } from "drizzle-orm";
import { DAILY_TASK_LIMIT, TASK_POINT_SCORE } from "../utils/constants.ts";
import assert from "node:assert/strict";

export default {
  data: new SlashCommandBuilder()
    .setName("tasks")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Add a new task to your personal to-do list")
        .addStringOption((option) =>
          option
            .setName("title")
            .setDescription("The task description")
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(500)
        )
    ).addSubcommand((subcommand) =>
      subcommand
        .setName("view")
        .setDescription("View all your tasks with their numbers"),
    ).addSubcommand((subcommand) =>
      subcommand
        .setName("cancel")
        .setDescription("Remove a task from your to-do list")
        .addIntegerOption((option) =>
          option
            .setName("task")
            .setDescription(
              "The task to remove (use `/tasks view` to see all)"
            )
            .setRequired(true)
            .setAutocomplete(true))
    ).addSubcommand((subcommand) =>
      subcommand.setName("complete")
        .setDescription("Mark a task as complete and earn 2 points")
        .addIntegerOption((option) =>
          option
            .setName("task")
            .setDescription(
              "The task number to complete (use `/tasks view` to see numbers)"
            )
            .setRequired(true)
            .setAutocomplete(true))
    ),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    const discordId = interaction.user.id;

    switch (interaction.options.getSubcommand()) {
      case "add":
        await addTask(interaction, discordId);
        break;
      case "view":
        await viewTasks(interaction, discordId);
        break;
      case "complete":
        await completetask(interaction, discordId);
        break;
      case "remove":
        await removetask(interaction, discordId);
        break;
      default:
        await interaction.editReply({
          embeds: [createErrorTemplate(
            "❌ Invalid Subcommand",
            "Please use `/tasks add`, `/tasks view`, `/tasks complete`, or `/tasks remove`.",
          )],
        });
        break;
    }
  }, autocomplete: async (interaction: AutocompleteInteraction) => {
    const results = await fetchTasks(interaction.user.id);
    interaction.respond(results.map(task => ({
      name: task.title,
      value: task.id,
    })));
  }
}

async function addTask(interaction: ChatInputCommandInteraction, discordId: string): Promise<void> {
  const title = interaction.options.getString("title", true);

  await ensureUserExists(discordId);
  const userTimezone = await fetchUserTimezone(discordId);

  // Check daily task limit first
  const currentTaskCount = await db.$count(tasksTable, eq(tasksTable.discordId, discordId));
  if (currentTaskCount >= DAILY_TASK_LIMIT) {
    const resetTime = Math.floor(
      dayjs().tz(userTimezone).add(1, "day").startOf("day").valueOf() / 1000
    );

    await interaction.editReply({
      embeds: [createErrorTemplate(
        `⚠️ Daily Task Limit Reached`,
        `**Remaining:** ${DAILY_TASK_LIMIT - currentTaskCount} actions • **Resets:** <t:${resetTime}:R>`,
        {
          helpText: `ℹ️ Daily Progress: ${currentTaskCount}/${DAILY_TASK_LIMIT} task actions used`,
        }
      )]
    });
    return;
  }

  const tasks = await db.insert(tasksTable).values({
    discordId,
    title,
  }).returning({ title: tasksTable.title });

  await interaction.editReply({
    embeds: [createSuccessTemplate(
      `✅ Task Added Successfully!`,
      `**${tasks[0]?.title}**\n\n🚀 Your task has been added to your personal to-do list and is ready for completion.`,
      {
        celebration: true,
        points: 2,
      }
    )]
  });
}

async function viewTasks(interaction: ChatInputCommandInteraction, discordId: string): Promise<void> {
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
  await interaction.editReply({
    embeds: [(createTaskTemplate(
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
    ))]
  });
  return;
}

async function completetask(interaction: ChatInputCommandInteraction, discordId: string): Promise<void> {
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
        `Could not find task. Use \`/tasks view\` to check your tasks`,
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
}

async function removetask(interaction: ChatInputCommandInteraction, discordId: string): Promise<void> {
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
      "Task not found. Use `/tasks view` to check your tasks.",
    );
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  assert(tasksResult.length === 1, "Expected exactly one task to be removed but found: " + tasksResult.length);

  await interaction.editReply({
    embeds: [(createSuccessTemplate(
      `✅ Task Removed Successfully`,
      `**Removed task: "${tasksResult[0]!!.title}"**\n\nℹ️ The task has been permanently removed from your to-do list.`
    ))]
  });
  return;

}