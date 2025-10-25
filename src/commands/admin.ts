import { ChatInputCommandInteraction, GuildMember, SlashCommandBuilder } from "discord.js";
import { db } from "../db/db.ts";
import { awardPoints, isPrefectOrProfessor, replyError } from "../utils/utils.ts";

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
