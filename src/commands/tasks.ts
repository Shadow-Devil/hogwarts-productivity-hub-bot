import { AutocompleteInteraction, ChatInputCommandInteraction, GuildMember, SlashCommandBuilder, User, } from "discord.js";
import {
  createSuccessTemplate,
  createErrorTemplate,
} from "../utils/embedTemplates.ts";
import dayjs from "dayjs";
import { db, fetchTasks, fetchUserTimezone } from "../db/db.ts";
import { taskTable } from "../db/schema.ts";
import { and, desc, eq, gte } from "drizzle-orm";
import { BotColors, DAILY_TASK_LIMIT, TASK_MIN_TIME, TASK_POINT_SCORE } from "../utils/constants.ts";
import assert from "node:assert/strict";
import { createHeader, createProgressSection, createStyledEmbed, formatDataGrid, formatDataTable } from "../utils/visualHelpers.ts";
import { awardPoints } from "../utils/utils.ts";

export default {
  data: new SlashCommandBuilder()
    .setName("tasks")
    .setDescription("Manage your personal todo list")
    .addSubcommand(subcommand =>
      subcommand
        .setName("add")
        .setDescription("Add a new task to your personal to-do list")
        .addStringOption(option =>
          option
            .setName("title")
            .setDescription("The task description")
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(500)
        )
    ).addSubcommand(subcommand =>
      subcommand
        .setName("view")
        .setDescription("View all your tasks with their numbers")
        .addMentionableOption(option =>
          option
            .setName("user")
            .setDescription("View tasks for a specific user (default: yourself)")
            .setRequired(false)
        ),
    ).addSubcommand(subcommand =>
      subcommand
        .setName("remove")
        .setDescription("Remove a task from your to-do list")
        .addIntegerOption(option =>
          option
            .setName("task")
            .setDescription(
              "The task to remove (use `/tasks view` to see all)"
            )
            .setRequired(true)
            .setAutocomplete(true))
    ).addSubcommand(subcommand =>
      subcommand.setName("complete")
        .setDescription("Mark a task as complete and earn 2 points")
        .addIntegerOption(option =>
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

    const userTimezone = await fetchUserTimezone(discordId);
    const startOfDay = dayjs().tz(userTimezone).startOf("day").toDate();
    console.info(`User timezone: ${userTimezone}, start of day: ${startOfDay}`);

    switch (interaction.options.getSubcommand()) {
      case "add":
        await addTask(interaction, discordId, userTimezone, startOfDay);
        break;
      case "view":
        await viewTasks(interaction, discordId, startOfDay);
        break;
      case "complete":
        await completeTask(interaction, discordId, startOfDay);
        break;
      case "remove":
        await removeTask(interaction, discordId, startOfDay);
        break;
      default:
        await interaction.editReply({
          embeds: [createErrorTemplate(
            "Invalid Subcommand",
            "Please use `/tasks add`, `/tasks view`, `/tasks complete`, or `/tasks remove`.",
          )],
        });
        break;
    }
  }, autocomplete: async (interaction: AutocompleteInteraction) => {
    const results = await fetchTasks(interaction.user.id);
    await interaction.respond(results.map(task => ({
      name: task.title,
      value: task.id,
    })));
  }
}

async function addTask(interaction: ChatInputCommandInteraction, discordId: string, userTimezone: string, startOfDay: Date): Promise<void> {
  const title = interaction.options.getString("title", true);

  // Check daily task limit first
  const currentTaskCount = await db.$count(taskTable, and(eq(taskTable.discordId, discordId), gte(taskTable.createdAt, startOfDay)));
  if (currentTaskCount >= DAILY_TASK_LIMIT) {
    const resetTime = Math.floor(
      dayjs().tz(userTimezone).add(1, "day").startOf("day").valueOf() / 1000
    );

    await interaction.editReply({
      embeds: [createErrorTemplate(
        `Daily Task Limit Reached`,
        `**Remaining:** ${DAILY_TASK_LIMIT - currentTaskCount} actions • **Resets:** <t:${resetTime}:R>\nDaily Progress: ${currentTaskCount}/${DAILY_TASK_LIMIT} task actions used`,
      )]
    });
    return;
  }

  const tasks = await db.insert(taskTable).values({
    discordId,
    title,
  }).returning({ title: taskTable.title });

  await interaction.editReply({
    embeds: [createSuccessTemplate(
      `Task Added Successfully!`,
      `**${tasks[0]?.title}**\n\n🚀 Your task has been added to your personal to-do list and is ready for completion.`,
      {
        celebration: true,
      }
    )]
  });
}

async function viewTasks(interaction: ChatInputCommandInteraction, discordId: string, startOfDay: Date): Promise<void> {
  const userMention = interaction.options.getMentionable("user");

  let user;
  if (userMention === null) {
    user = interaction.user;
  } else if (userMention instanceof User) {
    user = userMention;
  } else if (userMention instanceof GuildMember) {
    user = userMention.user;
  } else {
    await interaction.editReply({
      embeds: [createErrorTemplate(
        "Invalid User Mention",
        "Please mention a valid user or leave it blank to view your own tasks."
      )]
    });
    return;
  }

  const tasks = await db.select({
    title: taskTable.title,
    isCompleted: taskTable.isCompleted,
    completedAt: taskTable.completedAt,
  }).from(taskTable).where(
    and(eq(taskTable.discordId, user.id), gte(taskTable.createdAt, startOfDay))
  ).orderBy(desc(taskTable.isCompleted), taskTable.createdAt);

  assert(tasks.length < DAILY_TASK_LIMIT, `Expected tasks length to be less than ${DAILY_TASK_LIMIT} but found ${tasks.length}`);

  if (tasks.length === 0) {
    const embed = createTaskTemplate(user, [], {
      emptyState: true,
      emptyStateMessage:
        "🌟 **Ready to get productive?**\nUse `/tasks add <title>` to create your first task!",
      helpText: `Tip: Completing tasks earns you ${TASK_POINT_SCORE} points each!`,
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
      user,
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
        useTableFormat: true,
        maxRecentCompleted: 5,
        showDailyLimit: true,
      }
    ))]
  });
  return;
}

async function completeTask(interaction: ChatInputCommandInteraction, discordId: string, startOfDay: Date): Promise<void> {
  const taskId = interaction.options.getInteger("task", true);

  // Get all incomplete tasks for the user, ordered by creation date
  const tasksResult = await db.select().from(taskTable).where(and(
    eq(taskTable.discordId, discordId),
    eq(taskTable.isCompleted, false),
    eq(taskTable.id, taskId),
    gte(taskTable.createdAt, startOfDay))
  ).orderBy(taskTable.createdAt);

  if (tasksResult.length === 0) {
    await interaction.editReply({
      embeds: [createErrorTemplate(
        `Task Completion Failed`,
        `Could not find task. Use \`/tasks view\` to check your tasks`,
      )]
    });
    return;
  }

  const taskToComplete = tasksResult[0]!!;
  const diffInMinutes = dayjs().diff(dayjs(taskToComplete.createdAt), 'minute')
  if (diffInMinutes < TASK_MIN_TIME) {
    await interaction.editReply({
      embeds: [createErrorTemplate(
        `Task Completion Failed`,
        `You can only complete tasks that are at least ${TASK_MIN_TIME} minutes old.\nPlease try again in ${TASK_MIN_TIME - diffInMinutes} min.`,
      )]
    });
    return;
  }


  // Mark task as complete
  await db.transaction(async (db) => {
    await db.update(taskTable)
      .set({
        isCompleted: true,
        completedAt: new Date(),
      })
      .where(eq(taskTable.id, taskToComplete.id));
    await awardPoints(db, discordId, TASK_POINT_SCORE);

  });

  await interaction.editReply({
    embeds: [(createSuccessTemplate(
      `Task Completed Successfully!`,
      `**Completed: "${taskToComplete.title}" (+${TASK_POINT_SCORE} points)**\n\n🚀 Great job on completing your task! Keep up the momentum and continue building your productivity streak.`,
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

async function removeTask(interaction: ChatInputCommandInteraction, discordId: string, startOfDay: Date): Promise<void> {
  const taskId = interaction.options.getInteger("task", true);

  const tasksResult = await db.delete(taskTable).where(
    and(
      eq(taskTable.discordId, discordId),
      eq(taskTable.isCompleted, false),
      eq(taskTable.id, taskId),
      gte(taskTable.createdAt, startOfDay)
    )
  ).returning({ id: taskTable.id, title: taskTable.title });

  if (tasksResult.length === 0) {
    const embed = createErrorTemplate(
      `Task Removal Failed`,
      "Task not found. Use `/tasks view` to check your tasks.",
    );
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  assert(tasksResult.length === 1, "Expected exactly one task to be removed but found: " + tasksResult.length);

  await interaction.editReply({
    embeds: [(createSuccessTemplate(
      `Task Removed Successfully`,
      `**Removed task: "${tasksResult[0]!!.title}"**\n\nℹ️ The task has been permanently removed from your to-do list.`
    ))]
  });
  return;

}

function createTaskTemplate(
  user: User,
  tasks: any,
  {
    emptyState = false,
    emptyStateMessage = "",
    showProgress = false,
    includeRecentCompleted = false,
    maxRecentCompleted = 5,
    helpText = "",
    useTableFormat = true,
    showDailyLimit = false,
  } = {}
) {
  const embed = createStyledEmbed("primary")
    .setTitle("📋 Personal Task Dashboard")
    .setThumbnail(user.displayAvatarURL());


  if (emptyState || (Array.isArray(tasks) && tasks.length === 0)) {
    embed.setDescription(
      "Ready to get productive?" +
      (emptyStateMessage
        ? `\n\n${emptyStateMessage}`
        : "\n\n### 💡 Getting Started\nUse `/addtask <description>` to create your first task!")
    );
    embed.setColor(BotColors.INFO);

    if (helpText) {
      embed.setFooter({ text: helpText });
    }

    return embed;
  }

  // Handle enhanced task data structure
  const incompleteTasks =
    tasks.incompleteTasks || tasks.filter?.((t: { is_complete: boolean }) => !t.is_complete) || [];
  const completedTasks =
    tasks.completedTasks || tasks.filter?.((t: { is_complete: boolean }) => t.is_complete) || [];
  const stats = tasks.stats || {};

  embed.setDescription(
    createHeader(
      "Task Overview",
      `Progress tracking for **${user.username}**`,
      "📋",
      "emphasis"
    )
  );

  // Add completion progress bar with enhanced layout
  if (showProgress && stats.completionRate !== undefined) {
    const progressSection = createProgressSection(
      "Overall Progress",
      stats.totalCompleted,
      stats.totalTasks,
      {
        emoji: "📊",
        style: "detailed",
        showPercentage: true,
        showNumbers: true,
      }
    );

    const extraInfo = `\n**Completion Rate:** ${stats.completionRate.toFixed(1)}% • **Points Earned:** ${stats.totalTaskPoints}`;

    embed.addFields([
      {
        name: "📊 Progress Tracking",
        value: progressSection + extraInfo,
        inline: false,
      },
    ]);
  }

  // Add daily limit information if requested
  if (showDailyLimit && tasks.dailyStats) {
    const dailyStats = tasks.dailyStats;
    const limitProgress = createProgressSection(
      "Daily Task Limit",
      dailyStats.total_task_actions,
      dailyStats.limit,
      {
        emoji: dailyStats.limitReached ? "🚫" : "📅",
        style: "detailed",
        showPercentage: true,
        showNumbers: true,
      }
    );

    const resetTime = Math.floor(
      dayjs().add(1, "day").startOf("day").valueOf() / 1000
    );
    const limitInfo = `\n**Actions Used:** ${dailyStats.total_task_actions}/${dailyStats.limit} • **Remaining:** ${dailyStats.remaining} • **Resets:** <t:${resetTime}:R>`;

    embed.addFields([
      {
        name: "📅 Daily Task Limit",
        value: limitProgress + limitInfo,
        inline: false,
      },
    ]);
  }

  // Add pending tasks with enhanced formatting
  if (incompleteTasks.length > 0) {
    const taskList = incompleteTasks.slice(0, 10).map((task: { created_at: number, title: string }, index: number) => {
      const taskNumber = index + 1;
      const createdDate = dayjs(task.created_at).format("MMM DD");

      if (useTableFormat) {
        const numberPadded = taskNumber.toString().padStart(2, "0");
        return [`${numberPadded}. ${task.title}`, `📅 ${createdDate}`];
      } else {
        return `\`${taskNumber.toString().padStart(2, "0")}.\` ${task.title}\n     ┕ 📅 ${createdDate}`;
      }
    });

    let fieldValue;
    if (useTableFormat) {
      fieldValue = formatDataTable(taskList, [25, 15]);
    } else {
      const taskListString = taskList.join("\n\n");
      fieldValue =
        taskListString.length > 950
          ? `\`\`\`md\n${taskListString.substring(0, 947)}...\n\`\`\``
          : `\`\`\`md\n${taskListString}\n\`\`\``;
    }

    const fieldName = `📌 Pending Tasks • ${incompleteTasks.length} remaining`;

    embed.addFields([
      {
        name: fieldName,
        value: fieldValue,
        inline: false,
      },
    ]);
  }

  // Add recently completed tasks with enhanced formatting
  if (includeRecentCompleted && completedTasks.length > 0) {
    const recentCompleted = completedTasks
      .sort(
        (a: any, b: any) =>
          new Date(b.completed_at).getTime() -
          new Date(a.completed_at).getTime()
      )
      .slice(0, maxRecentCompleted);

    if (useTableFormat) {
      const completedList = recentCompleted.map((task: { completed_at: number, points_awarded: number, title: string }) => {
        const completedDate = dayjs(task.completed_at).format("MMM DD");
        const points = task.points_awarded || 0;
        return [`✅ ${task.title}`, `${completedDate} (+${points} pts)`];
      });

      embed.addFields([
        {
          name: `✅ Recently Completed (${completedTasks.length} total)`,
          value: formatDataTable(completedList, [20, 15]),
          inline: false,
        },
      ]);
    } else {
      const completedList = recentCompleted
        .map((task: { completed_at: number, points_awarded: number, title: string }) => {
          const completedDate = dayjs(task.completed_at).format("MMM DD");
          const points = task.points_awarded || 0;
          return `✅ ${task.title}\n*Completed: ${completedDate}* (+${points} pts)`;
        })
        .join("\n\n");

      embed.addFields([
        {
          name: `✅ Recently Completed (${completedTasks.length} total)`,
          value:
            completedList.length > 1024
              ? completedList.substring(0, 1021) + "..."
              : completedList,
          inline: false,
        },
      ]);
    }
  }

  // Add task statistics with enhanced table format
  if (stats.totalTasks !== undefined) {
    const statsData = [
      ["Total Tasks", stats.totalTasks],
      ["Completed", stats.totalCompleted],
      ["Pending", stats.totalPending],
      ["Points Earned", stats.totalTaskPoints],
    ];

    const statsDisplay = useTableFormat
      ? formatDataTable(statsData, [15, 10])
      : formatDataGrid(statsData, { useTable: true });

    embed.addFields([
      {
        name: "📊 Task Statistics",
        value: statsDisplay,
        inline: false,
      },
    ]);
  }

  // Add helpful footer
  embed.setFooter({
    text:
      helpText ||
      "Use /task complete <number> to complete tasks • /task remove <number> to remove tasks",
  });

  return embed;
}