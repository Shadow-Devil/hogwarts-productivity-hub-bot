import { ChatInputCommandInteraction, SlashCommandBuilder, time, userMention } from "discord.js";
import { replyError } from "../../utils/utils.ts";
import { db } from "../../db/db.ts";
import { and, desc, eq, gt } from "drizzle-orm";
import { userTable } from "../../db/schema.ts";
import type { Command, House } from "../../types.ts";
import { formatDataTable } from "../../utils/visualHelpers.ts";
import { BotColors, houseEmojis } from "../../utils/constants.ts";
import assert from "node:assert";

export default {
  data: new SlashCommandBuilder()
    .setName("housepoints")
    .setDescription("View house point leaderboards and champions")
    .addStringOption((option) =>
      option
        .setName("house")
        .setDescription("Choose a house to view its points")
        .setRequired(true)
        .addChoices(
          { name: "Slytherin", value: "Slytherin" },
          { name: "Gryffindor", value: "Gryffindor" },
          { name: "Hufflepuff", value: "Hufflepuff" },
          { name: "Ravenclaw", value: "Ravenclaw" },
        ),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const house = interaction.options.getString("house", true) as House;

    const houseLeaderboard = await db
      .select()
      .from(userTable)
      .where(and(eq(userTable.house, house), gt(userTable.monthlyPoints, 0)))
      .orderBy(desc(userTable.monthlyPoints));

    if (houseLeaderboard.length === 0) {
      await replyError(
        interaction,
        "No House Data",
        "No house data is available yet. Houses need to earn points first!",
        "Join a voice channel and complete tasks to start earning house points. House points are awarded for voice time and task completion.",
      );
      return;
    }

    await replyHousepoints(interaction, houseLeaderboard, house);
  },
} as Command;

async function replyHousepoints(
  interaction: ChatInputCommandInteraction,
  leaderboard: (typeof userTable.$inferSelect)[],
  house: string,
) {
  // Add house rankings
  const houseData: [string, string][] = leaderboard.map((user, index) => {
    assert(user.house !== null);
    const position = index + 1;
    const medals = ["🥇", "🥈", "🥉"];
    const medal = medals[position - 1] ?? `#${position}`;

    return [`${medal} ${userMention(user.discordId)}`, `${user.monthlyPoints} points`];
  });

  await interaction.editReply({
    embeds: [
      {
        color: BotColors.PRIMARY,
        title: house.toUpperCase(),
        description: formatDataTable(houseData),
        footer: {
          text: "Last updated: " + time(new Date(), "R"),
        },
      },
    ],
    allowedMentions: { users: [] },
  });
}
