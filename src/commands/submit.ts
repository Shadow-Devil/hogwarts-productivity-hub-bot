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
import { submissionTable } from "../db/schema.ts";
import { eq } from "drizzle-orm";

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
    assert(house, "User does not have a house role assigned");
    const [submission] = await db
      .insert(submissionTable)
      .values({
        discordId: member.id,
        points,
        screenshotUrl: screenshot.url,
        house: house,
      })
      .returning();
    assert(submission, "Failed to create submission");
    await interaction.reply(submissionMessage(submission));
  },

  async buttonHandler(interaction: ButtonInteraction, event: string, submissionId: string | undefined): Promise<void> {
    await interaction.deferReply();

    const member = interaction.member as GuildMember;
    if (!isPrefectOrProfessor(member)) {
      await interaction.followUp({
        content: "You do not have permission to perform this action.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    assert(submissionId, "No data provided in button interaction");
    const [submission] = await db
      .select()
      .from(submissionTable)
      .where(eq(submissionTable.id, parseInt(submissionId)));
    assert(submission, `Submission with ID ${submissionId} not found`);

    if (event === "approve") {
      await awardPoints(db, submission.discordId, submission.points);
      await db
        .update(submissionTable)
        .set({ status: "APPROVED", reviewedAt: new Date(), reviewedBy: member.id })
        .where(eq(submissionTable.id, submission.id));

      await interaction.message
        .fetch()
        .then((m) => m.edit(submissionMessage(submission, "approve", interaction.user.id)));
    } else if (event === "reject") {
      await db
        .update(submissionTable)
        .set({ status: "REJECTED", reviewedAt: new Date(), reviewedBy: member.id })
        .where(eq(submissionTable.id, submission.id));

      await interaction.message
        .fetch()
        .then((m) => m.edit(submissionMessage(submission, "reject", interaction.user.id)));
    } else {
      assert(false, `Unknown event type: ${event}`);
    }
  },
};

function submissionMessage(
  submissionData: typeof submissionTable.$inferSelect,
  event?: "approve" | "reject",
  buttonClickUserId?: string,
) {
  let components: InteractionReplyOptions["components"] = [];
  if (event === undefined) {
    components = [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            customId: "testing|approve|" + submissionData.id.toFixed(),
            label: `Approve ${submissionData.points} points`,
            style: ButtonStyle.Success,
          },
          {
            type: ComponentType.Button,
            customId: "testing|reject|" + submissionData.id.toFixed(),
            label: "Reject",
            style: ButtonStyle.Secondary,
          },
        ],
      },
    ];
  }

  const embed = new EmbedBuilder({
    title: submissionData.house.toUpperCase(),
    color: HOUSE_COLORS[submissionData.house],
    fields: [
      {
        name: "Player",
        value: userMention(submissionData.discordId),
        inline: true,
      },
      {
        name: "Score",
        value: submissionData.points.toFixed(),
        inline: true,
      },
      {
        name: "Submitted by",
        value: `${userMention(submissionData.discordId)} at ${time(submissionData.submittedAt)}`,
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
