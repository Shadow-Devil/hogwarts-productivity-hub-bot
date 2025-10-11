import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("submit")
    .setDescription("Submit a score")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("score")
        .setDescription("Submit a score")
        .addIntegerOption((option) =>
          option
            .setName("points")
            .setDescription("The number of points to submit")
            .setRequired(true),
        )
        .addAttachmentOption((option) =>
          option
            .setName("screenshot")
            .setDescription("A screenshot of your work")
            .setRequired(true),
        ),
    ),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.reply({
      content: "This command is not yet implemented.",
      ephemeral: true,
    });
  },
};
