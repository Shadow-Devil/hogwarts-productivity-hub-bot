import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import {
  createLeaderboardTemplate,
  createErrorTemplate,
} from "../../utils/embedTemplates.ts";
import { db } from "../../db/db.ts";
import { userTable } from "../../db/schema.ts";
import { desc } from "drizzle-orm";


export default {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View voice channel time leaderboards")
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("Choose leaderboard type")
        .setRequired(true)
        .addChoices(
          { name: "Daily", value: "daily" },
          { name: "Monthly", value: "monthly" },
          { name: "All Time", value: "alltime" }
        )
    ),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const leaderboardType = interaction.options.getString("type", true);

    let leaderboard: Array<{
      discordId: string;
      points: number | null;
      voiceTime: number | null;
    }>;

    switch (leaderboardType) {
      case "daily":
        leaderboard = await db.select({
          discordId: userTable.discordId,
          points: userTable.dailyPoints,
          voiceTime: userTable.dailyVoiceTime,
        })
          .from(userTable)
          .orderBy(desc(userTable.dailyPoints), desc(userTable.dailyVoiceTime))
          .limit(10);
        break;
      case "monthly":
        leaderboard = await db.select({
          discordId: userTable.discordId,
          points: userTable.monthlyPoints,
          voiceTime: userTable.monthlyVoiceTime,
        })
          .from(userTable)
          .orderBy(desc(userTable.monthlyPoints), desc(userTable.monthlyVoiceTime))
          .limit(10);
        break;
      case "alltime":
        leaderboard = await db.select({
          discordId: userTable.discordId,
          points: userTable.totalPoints,
          voiceTime: userTable.totalVoiceTime,
        })
          .from(userTable)
          .orderBy(desc(userTable.totalPoints), desc(userTable.totalVoiceTime))
        break;
      default:
        await interaction.editReply({
          embeds: [createErrorTemplate("Invalid Leaderboard Type", "Please select a valid leaderboard type: daily, monthly, or all time.")],
        });
        return;
    }

    if (leaderboard.length === 0) {
      await interaction.editReply({
        embeds: [(createErrorTemplate(
          `ℹNo Leaderboard Data`,
          "No data is available for the leaderboard yet. Be the first to start tracking your voice time!"
        ))]
      });
      return;
    }

    await interaction.editReply({
      embeds: [await createLeaderboardTemplate(
        leaderboardType,
        leaderboard,
        interaction.user,
        {
          useTableFormat: true,
        }, interaction
      )]
    });
  },
};
