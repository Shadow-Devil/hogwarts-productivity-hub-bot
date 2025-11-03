import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import dayjs from "dayjs";
import { db } from "../db/db.ts";
import { userTable } from "../db/schema.ts";
import { eq } from "drizzle-orm";
import { replyError } from "../utils/utils.ts";

export default {
  data: new SlashCommandBuilder()
    .setName("user")
    .setDescription("Manage your timezone settings for accurate daily/monthly resets")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("time")
        .setDescription("View a user's clock in their timezone")
        .addUserOption((option) =>
          option.setName("user").setDescription("The user to view the clock for").setRequired(true),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    switch (interaction.options.getSubcommand()) {
      case "time":
        await time(interaction);
        break;
      default:
        await replyError(interaction, "Invalid Subcommand", "Please use `/user time`.");
        return;
    }
  },
};

async function time(interaction: ChatInputCommandInteraction) {
  const user = interaction.options.getUser("user", true);
  const [userData] = await db.select().from(userTable).where(eq(userTable.discordId, user.id));

  if (!userData?.timezone) {
    await replyError(interaction, "Timezone Not Set", `${user.username} has not set their timezone.`);
    return;
  }
  await interaction.editReply(
    `${user.displayName}'s current time is ${dayjs().tz(userData.timezone).format("YYYY-MM-DD hh:mm:ss A")}`,
  );
}
