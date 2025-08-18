import { ChatInputCommandInteraction, SlashCommandBuilder, userMention } from "discord.js";
import {
  createErrorTemplate,
} from "../../utils/embedTemplates.ts";
import { db } from "../../db/db.ts";
import { userTable } from "../../db/schema.ts";
import { desc, gte } from "drizzle-orm";
import { createStyledEmbed, formatDataTable } from "../../utils/visualHelpers.ts";
import type { House } from "../../types.ts";


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
        await interaction.editReply({
          embeds: [createErrorTemplate("Invalid Leaderboard Type", "Please select a valid leaderboard type: daily, monthly, or all time.")],
        });
        return;
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
      await interaction.editReply({
        embeds: [(createErrorTemplate(
          `No Leaderboard Data`,
          "No data is available for the leaderboard yet. Be the first to start tracking your voice time!"
        ))]
      });
      return;
    }

    await interaction.editReply({
      embeds: [await createLeaderboardTemplate(
        leaderboardType,
        leaderboard,
      )]
    });
  },
};

async function createLeaderboardTemplate(
  type: string,
  data: Array<{
    discordId: string;
    house: House | null;
    points: number | null;
    voiceTime: number | null;
  }>,
) {
  const title = type === "daily" ? "Daily Leaderboard" :
    type === "monthly" ? "Monthly Leaderboard"
      : "All-Time Leaderboard";

  const embed = createStyledEmbed("premium").setTitle(title);


  const leaderboardData = []
  for (const [index, entry] of data.entries()) {
    const hours = entry.voiceTime ? Math.floor(entry.voiceTime / 3600) : "0";
    const minutes = entry.voiceTime ? Math.floor((entry.voiceTime % 3600) / 60) : "0";

    leaderboardData.push([`#${index + 1} ${userMention(entry.discordId)}`, `${hours}h ${minutes}min • ${entry.points}pts • ${entry.house ? entry.house : ""}`]);
  }

  embed.addFields([
    {
      name: "🏆 Top Rankings",
      value:
        formatDataTable(leaderboardData, [20, 15]) || "No rankings available",
      inline: false,
    },
  ]);

  return embed;
}
