import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { replyError } from "../../utils/utils.ts";
import { db } from "../../db/db.ts";
import { desc, isNotNull, sql } from "drizzle-orm";
import { housePointsTable, userTable } from "../../db/schema.ts";
import type { Command, House } from "../../types.ts";
import { formatDataTable } from "../../utils/visualHelpers.ts";
import { BotColors, houseEmojis } from "../../utils/constants.ts";

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
        ),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const type = interaction.options.getString("type", true) as "daily" | "monthly" | "alltime";

    const houseLeaderboard = await fetchHouseLeaderboard(type);

    if (houseLeaderboard.length === 0) {
      await replyError(
        interaction,
        "No House Data",
        "No house data is available yet. Houses need to earn points first!",
        "Join a voice channel and complete tasks to start earning house points. House points are awarded for voice time and task completion.",
      );
      return;
    }

    await replyHousepoints(interaction, houseLeaderboard, type);
  },
} as Command;

async function fetchHouseLeaderboard(type: "daily" | "monthly" | "alltime") {
  let pointsColumn;
  switch (type) {
    case "daily":
      pointsColumn = userTable.dailyPoints;
      break;
    case "monthly":
      pointsColumn = userTable.monthlyPoints;
      break;
    case "alltime":
      return await db.select().from(housePointsTable).orderBy(desc(housePointsTable.points));
  }
  const houseLeaderboard = await db
    .select({
      house: sql<House>`${userTable.house}`,
      points: sql<number>`cast(sum(${pointsColumn}) as int) as points`,
    })
    .from(userTable)
    .where(isNotNull(userTable.house))
    .groupBy(userTable.house)
    .orderBy(desc(sql<number>`points`));
  return houseLeaderboard;
}

async function replyHousepoints(
  interaction: ChatInputCommandInteraction,
  houses: { house: House; points: number }[],
  type: string,
) {
  const title =
    type === "daily" ? "Daily House Points" : type === "monthly" ? "Monthly House Points" : "All-Time House Points";

  // Add house rankings
  const houseData: [string, string][] = houses.map((house, index) => {
    const position = index + 1;
    const emoji = houseEmojis[house.house];
    const medals = ["🥇", "🥈", "🥉"];
    const medal = medals[position - 1] ?? `#${position}`;

    return [`${medal} ${emoji} ${house.house}`, `${house.points} points`];
  });

  await interaction.editReply({
    embeds: [
      {
        color: BotColors.PRIMARY,
        title,
        description: formatDataTable(houseData),
      },
    ],
  });
}
