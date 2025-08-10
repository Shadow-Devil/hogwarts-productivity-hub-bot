/**
 * Utilities for safe Discord interaction handling
 * Prevents timeout and acknowledgment errors
 */

import {
    type CommandInteraction,
    type InteractionDeferReplyOptions, MessageFlags,
} from "discord.js";

/**
 * Safely defer an interaction reply with timeout protection
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Object} options - Defer options
 * @returns {Promise<boolean>} - Success status
 */
async function safeDeferReply(
  interaction: CommandInteraction,
  options: InteractionDeferReplyOptions = {}
): Promise<boolean> {
  try {
    // Check if interaction is still valid and not expired
    if (!interaction || interaction.replied || interaction.deferred) {
      return false;
    }

    // Set a timeout to ensure we respond within Discord's 3-second limit
    const deferPromise = interaction.deferReply(options);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Defer timeout")), 2500)
    );

    await Promise.race([deferPromise, timeoutPromise]);
    return true;
  } catch (error) {
    console.warn(
      `Failed to defer interaction for /${interaction?.commandName}:`,
      error
    );
    return false;
  }
}

/**
 * Safely send an interaction reply with proper state checking
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Object} payload - Reply payload
 * @returns {Promise<boolean>} - Success status
 */
async function safeReply(
  interaction: CommandInteraction,
  payload: object
): Promise<boolean> {
  try {
    if (!interaction) {
      console.warn("Attempted to reply to null interaction");
      return false;
    }

    if (interaction.replied) {
      console.warn(
        `Interaction for /${interaction.commandName} already replied`
      );
      return false;
    }

    if (interaction.deferred) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply(payload);
    }
    return true;
  } catch (error) {
    console.error(
      `Failed to send reply for /${interaction?.commandName}:`,
      error
    );

    return false;
  }
}

/**
 * Enhanced error reply with automatic fallback handling
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Object} errorEmbed - Error embed to send
 * @returns {Promise<boolean>} - Success status
 */
async function safeErrorReply(
  interaction: CommandInteraction,
  errorEmbed: object | string
): Promise<boolean> {
  try {
    return await safeReply(interaction, { embeds: [errorEmbed] });
  } catch (error) {
    console.error(
      `Failed to send error reply for /${interaction?.commandName}:`,
      error
    );

    // Last resort: try a simple text reply
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ An error occurred while processing your command.",
            flags: MessageFlags.Ephemeral
        });
        return true;
      }
    } catch (fallbackError) {
      console.error("Even fallback error reply failed:", fallbackError);
    }

    return false;
  }
}

export {
  safeDeferReply,
  safeReply,
  safeErrorReply,
};
