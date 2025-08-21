import { AutocompleteInteraction, ChatInputCommandInteraction, EmbedBuilder, GuildMember, SlashCommandBuilder, User, } from "discord.js";
import { replyError } from "../utils/embedTemplates.ts";
import dayjs from "dayjs";
import { db, fetchTasks, fetchUserTimezone } from "../db/db.ts";
import { taskTable } from "../db/schema.ts";
import { and, desc, eq, gte } from "drizzle-orm";
import { BotColors, DAILY_TASK_LIMIT, TASK_MIN_TIME, TASK_POINT_SCORE } from "../utils/constants.ts";
import assert from "node:assert/strict";
import { createHeader, createProgressSection, formatDataTable } from "../utils/visualHelpers.ts";
import { awardPoints } from "../utils/utils.ts";
import type { Task } from "../types.ts";

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
    console.info(`User timezone: ${userTimezone}, start of day: ${startOfDay.toString()}`);

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
        return await replyError(
          interaction,
          "Invalid Subcommand",
          "Please use `/tasks add`, `/tasks view`, `/tasks complete`, or `/tasks remove`.",
        );
    }
  }, autocomplete: async (interaction: AutocompleteInteraction) => {
    const tasks = await fetchTasks(interaction.user.id);
    await interaction.respond(tasks.map(task => ({
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

    return await replyError(
      interaction,
      `Daily Task Limit Reached`,
      `**Remaining:** ${DAILY_TASK_LIMIT - currentTaskCount} actions • **Resets:** <t:${resetTime}:R>\nDaily Progress: ${currentTaskCount}/${DAILY_TASK_LIMIT} task actions used`,
    );
  }

  const [task] = await db.insert(taskTable).values({
    discordId,
    title,
  }).returning({ title: taskTable.title });
  assert(task !== undefined, "Task should be created successfully");

  await interaction.editReply({
    embeds: [new EmbedBuilder({
      color: BotColors.SUCCESS,
      title: `Task Added Successfully!`,
      description: `**${task.title}**\n\n🚀 Your task has been added to your personal to-do list and is ready for completion.`,
    })]
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
    return await replyError(
      interaction,
      "Invalid User Mention",
      "Please mention a valid user or leave it blank to view your own tasks."
    );
  }

  const tasks: Task[] = await db.select({
    title: taskTable.title,
    isCompleted: taskTable.isCompleted,
    completedAt: taskTable.completedAt,
    createdAt: taskTable.createdAt,
  }).from(taskTable).where(
    and(eq(taskTable.discordId, user.id), gte(taskTable.createdAt, startOfDay))
  ).orderBy(desc(taskTable.isCompleted), taskTable.createdAt);

  assert(tasks.length < DAILY_TASK_LIMIT, `Expected tasks length to be less than ${DAILY_TASK_LIMIT} but found ${tasks.length}`);

  if (tasks.length === 0) {
    await interaction.editReply({
      embeds: [new EmbedBuilder({
        color: BotColors.INFO,
        title: "📋 Personal Task Dashboard",
        description: "Ready to get productive?\nUse `/tasks add <title>` to create your first task!",
        footer: { text: "Tip: Completing tasks earns you ${TASK_POINT_SCORE} points each!" }
      }).setThumbnail(user.displayAvatarURL())]
    });
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
    embeds: [createTaskTemplate(
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
      }
    )]
  });
  return;
}

async function completeTask(interaction: ChatInputCommandInteraction, discordId: string, startOfDay: Date): Promise<void> {
  const taskId = interaction.options.getInteger("task", true);

  // Get all incomplete tasks for the user, ordered by creation date
  const [tasksResult] = await db.select().from(taskTable).where(and(
    eq(taskTable.discordId, discordId),
    eq(taskTable.isCompleted, false),
    eq(taskTable.id, taskId),
    gte(taskTable.createdAt, startOfDay))
  ).orderBy(taskTable.createdAt);

  if (tasksResult === undefined) {
    return await replyError(
      interaction,
      `Task Completion Failed`,
      `Could not find task. Use \`/tasks view\` to check your tasks`,
    );
  }

  const taskToComplete = tasksResult;
  const diffInMinutes = dayjs().diff(dayjs(taskToComplete.createdAt), 'minute')
  if (diffInMinutes < TASK_MIN_TIME) {
    return await replyError(
      interaction,
      `Task Completion Failed`,
      `You can only complete tasks that are at least ${TASK_MIN_TIME} minutes old.\nPlease try again in ${TASK_MIN_TIME - diffInMinutes} min.`,
    );
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
    embeds: [new EmbedBuilder({
      color: BotColors.SUCCESS,
      title: `🎉 Task Completed Successfully!`,
      description: `**Completed: "${taskToComplete.title}" (+${TASK_POINT_SCORE} points)**\n\n🚀 Great job on completing your task! Keep up the momentum and continue building your productivity streak.`,
      fields: [{
        name: "🎁 Rewards Earned",
        value: formatDataTable([["Points Earned", `+${TASK_POINT_SCORE}`]]),
        inline: false,
      }]
    })]
  });
}

async function removeTask(interaction: ChatInputCommandInteraction, discordId: string, startOfDay: Date): Promise<void> {
  const taskId = interaction.options.getInteger("task", true);

  const [task] = await db.delete(taskTable).where(
    and(
      eq(taskTable.discordId, discordId),
      eq(taskTable.isCompleted, false),
      eq(taskTable.id, taskId),
      gte(taskTable.createdAt, startOfDay)
    )
  ).returning({ id: taskTable.id, title: taskTable.title });

  if (task === undefined) {
    return await replyError(
      interaction,
      `Task Removal Failed`,
      "Task not found. Use `/tasks view` to check your tasks."
    );
  }

  await interaction.editReply({
    embeds: [new EmbedBuilder({
      color: BotColors.SUCCESS,
      title: `Task Removed Successfully`,
      description: `**Removed task: "${task.title}"**\n\nℹ️ The task has been permanently removed from your to-do list.`,
    })]
  });
  return;

}

function createTaskTemplate(
  user: User,
  tasks: {
    incompleteTasks: Task[];
    completedTasks: Task[];
    stats: {
      totalTasks: number;
      totalCompleted: number;
      totalPending: number;
      totalTaskPoints: number;
      completionRate: number;
    },
  },
  {
    showProgress = false,
    includeRecentCompleted = false,
    maxRecentCompleted = 5,
    helpText = "",
    useTableFormat = true,
  } = {}
) {
  const embed = new EmbedBuilder({
    color: BotColors.PRIMARY,
    title: "📋 Personal Task Dashboard",
  }).setThumbnail(user.displayAvatarURL());

  // Handle enhanced task data structure
  const incompleteTasks = tasks.incompleteTasks;
  const completedTasks = tasks.completedTasks;
  const stats = tasks.stats;

  embed.setDescription(
    createHeader(
      "Task Overview",
      `Progress tracking for **${user.username}**`,
      "📋",
      "emphasis"
    )
  );

  // Add completion progress bar with enhanced layout
  if (showProgress) {
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

  // Add pending tasks with enhanced formatting
  if (incompleteTasks.length > 0) {
    const taskList = incompleteTasks.slice(0, 10).map((task, index) => {
      const taskNumber = index + 1;
      const createdDate = dayjs(task.createdAt).format("MMM DD");

      if (useTableFormat) {
        const numberPadded = taskNumber.toString().padStart(2, "0");
        return [`${numberPadded}. ${task.title}`, `📅 ${createdDate}`] as [string, string];
      } else {
        return `\`${taskNumber.toString().padStart(2, "0")}.\` ${task.title}\n     ┕ 📅 ${createdDate}`;
      }
    });

    let fieldValue;
    if (useTableFormat) {
      fieldValue = formatDataTable(taskList);
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
        (a, b) =>
          (b.completedAt?.getTime() ?? 0) -
          (a.completedAt?.getTime() ?? 0)
      )
      .slice(0, maxRecentCompleted);

    if (useTableFormat) {
      const completedList: [string, string][] = recentCompleted.map((task) => {
        const completedDate = dayjs(task.completedAt).format("MMM DD");
        return [`✅ ${task.title}`, `${completedDate} (+${TASK_POINT_SCORE} pts)`];
      });

      embed.addFields([
        {
          name: `✅ Recently Completed (${completedTasks.length} total)`,
          value: formatDataTable(completedList),
          inline: false,
        },
      ]);
    } else {
      const completedList = recentCompleted
        .map((task) => {
          const completedDate = dayjs(task.completedAt).format("MMM DD");
          return `✅ ${task.title}\n*Completed: ${completedDate}* (+${TASK_POINT_SCORE} pts)`;
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
  const statsData: [string, number][] = [
    ["Total Tasks", stats.totalTasks],
    ["Completed", stats.totalCompleted],
    ["Pending", stats.totalPending],
    ["Points Earned", stats.totalTaskPoints],
  ];

  const statsDisplay = useTableFormat
    ? formatDataTable(statsData)
    : formatDataGrid(statsData, { useTable: true });

  embed.addFields([
    {
      name: "📊 Task Statistics",
      value: statsDisplay,
      inline: false,
    },
  ]);

  // Add helpful footer
  embed.setFooter({
    text:
      helpText ||
      "Use /task complete <number> to complete tasks • /task remove <number> to remove tasks",
  });

  return embed;
}

// 📊 Enhanced Data Grid with Table-Like Structure
function formatDataGrid(
  data: Record<string, string | number> | (string | [string, string | number])[],
  {
    columns = 2,
    separator = " • ",
    prefix = "├─",
    spacing = true,
    style = "compact",
    useTable = false,
  } = {},
) {
  const items = Array.isArray(data)
    ? data
    : Object.entries(data).map(([k, v]) => `${k}: ${v}`);

  if (useTable && columns === 2) {
    return formatDataTable(items);
  }

  const result = [];

  for (let i = 0; i < items.length; i += columns) {
    const row = items.slice(i, i + columns);

    if (style === "spacious") {
      result.push(""); // Add spacing between rows
    }

    if (spacing && prefix) {
      result.push(`${prefix} ${row.join(separator)}`);
    } else {
      result.push(row.join(separator));
    }
  }

  return result.join("\n");
}
