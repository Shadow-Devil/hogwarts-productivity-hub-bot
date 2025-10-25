import {
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  ComponentType,
  GuildMember,
  SlashCommandBuilder,
  userMention,
} from "discord.js";
import { awardPoints, isPrefectOrProfessor } from "../utils/utils.ts";
import assert from "node:assert";
import { db } from "../db/db.ts";

export default {
  data: new SlashCommandBuilder()
    .setName("testing")
    .setDescription("Testing command")
    .addSubcommandGroup((subcommand) =>
      subcommand
        .setName("submit")
        .setDescription("Submit a score")
        .addSubcommand((subcommand) =>
          subcommand
            .setName("score")
            .setDescription("Submit a score")
            .addIntegerOption((option) =>
              option.setName("points").setDescription("The number of points to submit").setRequired(true),
            )
            .addAttachmentOption((option) =>
              option.setName("screenshot").setDescription("A screenshot of your work").setRequired(true),
            ),
        ),
    ),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const points = interaction.options.getInteger("points", true);
    const screenshot = interaction.options.getAttachment("screenshot", true);

    await interaction.reply({
      content: "Please confirm your submission",
      files: [screenshot],
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              customId: "submit|approve|" + interaction.user.id + "|" + points.toFixed(),
              label: `Approve ${points} points`,
              style: ButtonStyle.Success,
            },
            {
              type: ComponentType.Button,
              customId: "submit|reject|" + interaction.user.id,
              label: "Reject",
              style: ButtonStyle.Secondary,
            },
          ],
        },
      ],
    });
  },

  async buttonHandler(interaction: ButtonInteraction, event: string, data: string[]): Promise<void> {
    const member = interaction.member as GuildMember;
    if (!isPrefectOrProfessor(member)) {
      await interaction.followUp({
        content: "You do not have permission to perform this action.",
        ephemeral: true,
      });
      return;
    }

    if (event === "approve") {
      const discordId = data[0];
      assert(discordId, "Discord ID missing in button data");
      assert(data[1], "Points missing in button data");
      const points = parseInt(data[1], 10);
      await awardPoints(db, discordId, points);

      await interaction.editReply({
        content: `${userMention(discordId)} has been awarded ${points} points!`,
        components: [],
      });
    } else if (event === "reject") {
      await interaction.editReply({
        content: "Action cancelled",
        components: [],
      });
    }
  },
};
