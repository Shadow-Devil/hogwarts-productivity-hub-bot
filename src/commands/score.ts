import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";

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
    const username = interaction.user.username;
    const points = interaction.options.getInteger("points", true);
    const screenshot = interaction.options.getAttachment("screenshot", true);

    const confirm = new ButtonBuilder()
      .setCustomId("approve")
      .setLabel(`Approve ${points} points`)
      .setStyle(ButtonStyle.Primary);

    const cancel = new ButtonBuilder()
      .setCustomId("reject")
      .setLabel("Reject")
      .setStyle(ButtonStyle.Secondary);
    const row = new ActionRowBuilder<ButtonBuilder>({
      components: [cancel, confirm],
    });
    const response = await interaction.reply({
      content: "Please confirm your submission",
      ephemeral: true,
      files: [screenshot],
      components: [row],
      withResponse: true,
    });

    try {
      const confirmation =
        await response.resource?.message?.awaitMessageComponent({
          filter: (i) => i.user.id === interaction.user.id,
        });

      if (confirmation?.customId === "confirm") {
        await confirmation.update({
          content: `${username} has been awarded ${points} points!`,
          components: [],
        });
      } else if (confirmation?.customId === "cancel") {
        await confirmation.update({
          content: "Action cancelled",
          components: [],
        });
      }
    } catch (error) {
      await interaction.editReply({
        content: String(error),
        components: [],
      });
    }
  },
};
