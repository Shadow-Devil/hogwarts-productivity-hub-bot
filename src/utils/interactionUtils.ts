/**
 * Utilities for safe Discord interaction handling
 * Prevents timeout and acknowledgment errors
 */

import type {
  CommandInteraction,
  Guild,
  GuildMember,
  InteractionDeferReplyOptions,
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
      error.message
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
      error.message
    );

    // If the error is about unknown interaction or already acknowledged, don't retry
    if (error.code === 10062 || error.code === 40060) {
      console.warn("Interaction expired or already handled - skipping retry");
      return false;
    }

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
      error.message
    );

    // Last resort: try a simple text reply
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ An error occurred while processing your command.",
          ephemeral: true,
        });
        return true;
      }
    } catch (fallbackError) {
      console.error("Even fallback error reply failed:", fallbackError.message);
    }

    return false;
  }
}

/**
 * Optimized member fetch that avoids slow API calls when possible
 * @param {Guild} guild - Discord guild
 * @param {string} userId - User ID to fetch
 * @param {boolean} useCache - Whether to prefer cache over API
 * @returns {Promise<GuildMember|null>} - Guild member or null
 */
async function fastMemberFetch(
  guild: Guild,
  userId: string,
  useCache: boolean = true
): Promise<GuildMember | null> {
  try {
    if (!guild || !userId) return null;

    // Try cache first if requested
    if (useCache) {
      const cachedMember = guild.members.cache.get(userId);
      if (cachedMember) return cachedMember;
    }

    // Fallback to API fetch with timeout
    const fetchPromise = guild.members.fetch(userId);

    return await fetchPromise;
  } catch (error) {
    console.warn(`Failed to fetch member ${userId}:`, error.message);
    return null;
  }
}

export {
  safeDeferReply,
  safeReply,
  safeErrorReply,
  fastMemberFetch,
};
