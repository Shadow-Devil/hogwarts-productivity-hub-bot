import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import {
  createErrorTemplate,
} from "../../utils/embedTemplates.ts";
import { db } from "../../db/db.ts";
import { isNotNull, sql } from "drizzle-orm";
import { userTable } from "../../db/schema.ts";
import type { House } from "../../types.ts";
import { createStyledEmbed, formatDataTable } from "../../utils/visualHelpers.ts";
import { BotColors } from "../../utils/constants.ts";

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
    await interaction.deferReply();

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
    return interaction.editReply({
      embeds: [(createErrorTemplate(
        `No House Data`,
        "No house data is available yet. Houses need to earn points first!\nJoin a voice channel and complete tasks to start earning house points. House points are awarded for voice time and task completion.",
      ))]
    });
  }

  const embed = createHouseTemplate(houseLeaderboard as {
    house: House;
    points: number;
    voiceTime: number;
  }[], type);

  await interaction.editReply({ embeds: [embed] });
}


function createHouseTemplate(
  houses: Array<{ house: House; points: number, voiceTime: number }>,
  type: string,
) {
  const houseEmojis = {
    Gryffindor: "🦁",
    Hufflepuff: "🦡",
    Ravenclaw: "🦅",
    Slytherin: "🐍",
  };

  const title = type === "daily" ? "Daily House Points" :
    type === "monthly" ? "Monthly House Points"
    : "All-Time House Points";


  const embed = createStyledEmbed().setColor(BotColors.PRIMARY).setTitle(title);

  // Add house rankings with enhanced table format
  if (houses && houses.length > 0) {
      const houseData = houses.map((house, index) => {
        const position = index + 1;
        const emoji = houseEmojis[house.house];
        const medal =
          position === 1
            ? "🥇"
            : position === 2
              ? "🥈"
              : position === 3
                ? "🥉"
                : `#${position}`;

        return [`${medal} ${emoji} ${house.house}`, `${house.points} points`];
      });

      embed.addFields([
        {
          name: "House Rankings",
          value: formatDataTable(houseData, [18, 12]),
          inline: false,
        },
      ]);
  }

  return embed;
}
