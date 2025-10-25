import {
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  ComponentType,
  EmbedBuilder,
  GuildMember,
  MessageFlags,
  SlashCommandBuilder,
  time,
  userMention,
  type InteractionReplyOptions,
} from "discord.js";
import { awardPoints, getHouseFromMember, isPrefectOrProfessor } from "../utils/utils.ts";
import assert from "node:assert";
import { db } from "../db/db.ts";
import { HOUSE_COLORS } from "../utils/constants.ts";
import type { House } from "../types.ts";

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
    const member = interaction.member as GuildMember;
    const points = interaction.options.getInteger("points", true);
    const screenshot = interaction.options.getAttachment("screenshot", true);
    const house = getHouseFromMember(member);

    await interaction.reply(
      submissionMessage({
        userId: member.id,
        house: house ?? "UNKNOWN",
        points,
        submissionDate: new Date().toISOString(),
        screenshotUrl: screenshot.url,
      }),
    );
  },

  async buttonHandler(interaction: ButtonInteraction, event: string, data: string | undefined): Promise<void> {
    await interaction.deferReply();

    const member = interaction.member as GuildMember;
    if (!isPrefectOrProfessor(member)) {
      await interaction.followUp({
        content: "You do not have permission to perform this action.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    assert(data, "No data provided in button interaction");

    const parsed = JSON.parse(data) as SubmissionData;

    if (event === "approve") {
      await awardPoints(db, parsed.userId, parsed.points);

      await interaction.message.fetch().then((m) => m.edit(submissionMessage(parsed, "approve", interaction.user.id)));
    } else if (event === "reject") {
      await interaction.message.fetch().then((m) => m.edit(submissionMessage(parsed, "approve", interaction.user.id)));
    } else {
      assert(false, `Unknown event type: ${event}`);
    }
  },
};

interface SubmissionData {
  userId: string;
  submissionDate: string;
  house: House | "UNKNOWN";
  screenshotUrl: string;
  points: number;
}

function submissionMessage(submissionData: SubmissionData, event?: "approve" | "reject", buttonClickUserId?: string) {
  let components: InteractionReplyOptions["components"] = [];
  if (event === undefined) {
    const data = JSON.stringify(submissionData);
    components = [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            customId: "testing|approve|" + data,
            label: `Approve ${submissionData.points} points`,
            style: ButtonStyle.Success,
          },
          {
            type: ComponentType.Button,
            customId: "testing|reject|" + data,
            label: "Reject",
            style: ButtonStyle.Secondary,
          },
        ],
      },
    ];
  }

  const embed = new EmbedBuilder({
    title: submissionData.house.toUpperCase(),
    color: submissionData.house !== "UNKNOWN" ? HOUSE_COLORS[submissionData.house] : 0xffffff,
    fields: [
      {
        name: "Player",
        value: userMention(submissionData.userId),
        inline: true,
      },
      {
        name: "Score",
        value: submissionData.points.toFixed(),
        inline: true,
      },
      {
        name: "Submitted by",
        value: `${userMention(submissionData.userId)} at ${time(new Date(submissionData.submissionDate))}`,
        inline: false,
      },
    ],
    image: {
      url: submissionData.screenshotUrl,
    },
  });

  if (event === "approve") {
    embed.addFields({
      name: "✅ Approved by",
      value: buttonClickUserId ? userMention(buttonClickUserId) : "Unknown",
      inline: false,
    });
  } else if (event === "reject") {
    embed.addFields({
      name: "❌ Rejected by",
      value: buttonClickUserId ? userMention(buttonClickUserId) : "Unknown",
      inline: false,
    });
  }

  return {
    embeds: [embed],
    components: components,
  };
}
