// Enhanced Embed Templates for Consistent Bot Responses
// Provides pre-built templates for common response types
import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { BotColors } from "./constants.ts";

export async function replyError(
  interaction: ChatInputCommandInteraction,
  title: string,
  ...messages: string[]
) {
  await interaction.editReply({
    embeds: [new EmbedBuilder({
      color: BotColors.ERROR,
      title: `❌ ${title}`,
      description: messages.join("\n"),
    })]
  });
}
