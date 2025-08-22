import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder, userMention } from "discord.js";
import {
  replyError,
} from "../../utils/utils.ts";
import { db } from "../../db/db.ts";
import { userTable } from "../../db/schema.ts";
import { desc, gte } from "drizzle-orm";
import { formatDataTable } from "../../utils/visualHelpers.ts";
import type { House } from "../../types.ts";
import { BotColors, houseEmojis } from "../../utils/constants.ts";


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

    let pointsColumn;
    let voiceTimeColumn;
    switch (leaderboardType) {
      case "daily":
        pointsColumn = userTable.dailyPoints;
        voiceTimeColumn = userTable.dailyVoiceTime;
        break;
      case "monthly":
        pointsColumn = userTable.monthlyPoints;
        voiceTimeColumn = userTable.monthlyVoiceTime;
        break;
      case "alltime":
        pointsColumn = userTable.totalPoints;
        voiceTimeColumn = userTable.totalVoiceTime;
        break;
      default:
        return await replyError(interaction, "Invalid Leaderboard Type", "Please select a valid leaderboard type: daily, monthly, or all time.");
    }
    const leaderboard = await db.select({
      discordId: userTable.discordId,
      house: userTable.house,
      points: pointsColumn,
      voiceTime: voiceTimeColumn,
    })
      .from(userTable)
      .where(gte(voiceTimeColumn, 60))
      .orderBy(desc(pointsColumn), desc(voiceTimeColumn))
      .limit(10);

    if (leaderboard.length === 0) {
      return await replyError(
        interaction,
        `No Leaderboard Data`,
        "No data is available for the leaderboard yet. Be the first to start tracking your voice time!"
      )
    }
    await replyLeaderboard(interaction, leaderboardType, leaderboard);
  },
};

async function replyLeaderboard(
  interaction: ChatInputCommandInteraction,
  type: string,
  data: {
    discordId: string;
    house: House | null;
    points: number;
    voiceTime: number | null;
  }[],
) {
  const title = type === "daily" ? "Daily Leaderboard" :
    type === "monthly" ? "Monthly Leaderboard"
      : "All-Time Leaderboard";

  const leaderboardData: [string, string][] = []
  for (const [index, entry] of data.entries()) {
    const hours = entry.voiceTime ? Math.floor(entry.voiceTime / 3600) : "0";
    const minutes = entry.voiceTime ? Math.floor((entry.voiceTime % 3600) / 60) : "0";

    leaderboardData.push([`#${index + 1} ${userMention(entry.discordId)}`, `${hours}h ${minutes}min • ${entry.points}pts • ${entry.house ? houseEmojis[entry.house] : ""}`]);
  }

  await interaction.editReply({
    embeds: [new EmbedBuilder({
      color: BotColors.PREMIUM,
      title,
      fields: [
        {
          name: "🏆 Top Rankings",
          value: leaderboardData.length !== 0 ? formatDataTable(leaderboardData) : "No rankings available",
          inline: false,
        },
      ]
    })]
  });
}
