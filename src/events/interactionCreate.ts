import { MessageFlags } from "discord.js";
import { commands } from "../commands.ts";


const activeVoiceTimers = new Map(); // key: voiceChannelId, value: { workTimeout, breakTimeout, phase, endTime }

export async function execute(interaction): Promise<void> {
    if (!interaction.isChatInputCommand()) return;

    const command = commands.get(interaction.commandName);
    if (!command) {
        console.warn(
            `⚠️ Unknown command attempted: /${interaction.commandName} by ${interaction.user.tag}`
        );
        return;
    }

    console.log(
        `🎯 Command executed: /${interaction.commandName} by ${interaction.user.tag} in #${interaction.channel?.name || "DM"}`
    );

    try {
        await command.execute(interaction, { activeVoiceTimers });
    } catch (error) {
        console.error(`💥 Command execution failed: /${interaction.commandName}`, {
            user: interaction.user.tag,
            channel: interaction.channel?.name || "DM",
            error: error.message,
            isTimeout: error.message === "Command execution timeout",
        });

        // Improved error response handling with interaction state checks
        try {
            const errorMessage =
                error.message === "Command execution timeout"
                    ? "⏱️ Command timed out. Please try again - the bot may be under heavy load."
                    : "❌ An error occurred. Please try again later.";

            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: errorMessage,
                    flags: [MessageFlags.Ephemeral],
                });
            } else if (interaction.deferred && !interaction.replied) {
                await interaction.editReply({
                    content: errorMessage,
                });
            }
            // If interaction is already replied, we can't send another response
        } catch (replyError) {
            // Check if it's an "Unknown interaction" error (expired token)
            if (replyError.code === 10062) {
                console.warn(
                    `⚠️  Interaction expired for /${interaction.commandName} - command took too long`
                );
            } else if (replyError.code === 40060) {
                console.warn(
                    `⚠️  Interaction already acknowledged for /${interaction.commandName}`
                );
            } else {
                console.error(
                    `💥 Failed to send error response for /${interaction.commandName}:`,
                    replyError
                );
            }
        }
    }
}