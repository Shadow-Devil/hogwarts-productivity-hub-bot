import { ChatInputCommandInteraction, GuildMember, MessageFlags, SlashCommandBuilder } from "discord.js";
import { db } from "../db/db.ts";
import { awardPoints, isPrefectOrProfessor, replyError } from "../utils/utils.ts";
import { userTable } from "../db/schema.ts";
import { eq } from "drizzle-orm";
import dayjs from "dayjs";

export default {
  data: new SlashCommandBuilder()
    .setName("admin")
    .setDescription("Admin commands")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("adjust-points")
        .setDescription("Adds or removes points from a user")
        .addIntegerOption((option) =>
          option.setName("amount").setDescription("The amount of points to adjust").setRequired(true),
        )
        .addUserOption((option) =>
          option.setName("user").setDescription("The user to adjust points for").setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("view-clock")
        .setDescription("View a user's clock in their timezone")
        .addUserOption((option) =>
          option.setName("user").setDescription("The user to view the clock for").setRequired(true),
        ),
    ),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    const member = interaction.member as GuildMember;

    if (!isPrefectOrProfessor(member)) {
      await replyError(interaction, "Insufficient Permissions", "You do not have permission to use this command.");
      return;
    }

    switch (interaction.options.getSubcommand()) {
      case "adjust-points":
        await adjustPoints(interaction);
        break;
      case "view-clock":
        await viewClock(interaction);
        break;
      default:
        await replyError(interaction, "Invalid Subcommand", "Please use `/admin adjust-points`.");
        return;
    }
  },
};

async function adjustPoints(interaction: ChatInputCommandInteraction) {
  const amount = interaction.options.getInteger("amount", true);
  const user = interaction.options.getUser("user", true);

  await awardPoints(db, user.id, amount);
}

async function viewClock(interaction: ChatInputCommandInteraction) {
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
