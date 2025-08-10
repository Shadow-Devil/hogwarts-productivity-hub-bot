import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import * as voiceService from "../../services/voiceService.ts";
import {
  createHouseTemplate,
  createChampionTemplate,
  createErrorTemplate,
} from "../../utils/embedTemplates.ts";
import {
  safeDeferReply,
  safeErrorReply,
  fastMemberFetch,
} from "../../utils/interactionUtils.ts";
import { db, getUserHouse } from "../../db/db.ts";
import { isNotNull, sql } from "drizzle-orm";
import { userTable } from "../../db/schema.ts";

export default {
  data: new SlashCommandBuilder()
    .setName("housepoints")
    .setDescription("View house point leaderboards and champions")
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("Choose leaderboard type")
        .setRequired(true)
        .addChoices(
          { name: "Daily House Ranking", value: "daily" },
          { name: "Monthly House Ranking", value: "monthly" },
          { name: "All Time House Ranking", value: "alltime" },
        )
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    interaction.deferReply();

      const leaderboardType = interaction.options.getString("type", true) as "daily" | "monthly" | "alltime";

        await showHouseLeaderboard(interaction, leaderboardType);

  },
};

async function showHouseLeaderboard(interaction: ChatInputCommandInteraction, type: "daily" | "monthly" | "alltime") {

  let pointsColumn;
  let voiceTimeColumn;

  switch (type) {
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
  }
  const houseLeaderboard = await db.select({
        house: userTable.house,
        points: sql<number>`cast(count(${pointsColumn}) as int)`,
        voiceTime: sql<number>`cast(sum(${voiceTimeColumn}) as int)`,
      }).from(userTable)
      .where(isNotNull(userTable.house))
      .groupBy(userTable.house);

  if (houseLeaderboard.length === 0) {
    return interaction.editReply({ embeds: [(createErrorTemplate(
        `ℹ️ No House Data`,
        "No house data is available yet. Houses need to earn points first!",
        {
          helpText: "Join a voice channel and complete tasks to start earning house points. House points are awarded for voice time and task completion.",
        }
      ))] });
  }

  const embed = createHouseTemplate(houseLeaderboard as {
    house: "Gryffindor" | "Hufflepuff" | "Ravenclaw" | "Slytherin";
    points: number;
    voiceTime: number;
}[], type);

  await interaction.editReply({ embeds: [embed] });
}
