import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import {
  createSuccessTemplate,
  createErrorTemplate,
} from "../../utils/embedTemplates.ts";
import dayjs from "dayjs";
import { db, ensureUserExists, fetchUserTimezone } from "../../db/db.ts";
import { tasksTable } from "../../db/schema.ts";
import { DAILY_TASK_LIMIT } from "../../utils/dailyTaskManager.ts";
import { eq } from "drizzle-orm";

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
    await interaction.deferReply();

    const title = interaction.options.getString("title", true);
    const discordId = interaction.user.id;

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
};
