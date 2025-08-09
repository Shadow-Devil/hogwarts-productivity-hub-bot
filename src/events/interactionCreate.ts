import { MessageFlags, type Interaction } from "discord.js";
import { commands } from "../commands.ts";
import assert from "node:assert";


const activeVoiceTimers = new Map(); // key: voiceChannelId, value: { workTimeout, breakTimeout, phase, endTime }

export async function execute(interaction: Interaction): Promise<void> {
    if (!interaction.isChatInputCommand() && !interaction.isAutocomplete()) return;

    const command = commands.get(interaction.commandName);
    if (!command) {
        console.warn(
            `⚠️ Unknown command attempted: /${interaction.commandName} by ${interaction.user.tag}`
        );
        return;
    }

    const channel = interaction.channel;
    let channelName;
    if (channel !== null && !channel.isDMBased()) {
        channelName = `#${channel.name}`;
    } else {
        channelName = "DM";
    }

    console.log(
        `🎯 Command executed: /${interaction.commandName} by ${interaction.user.tag} in #${channelName}`
    );

    try {
        if (interaction.isAutocomplete()) {
            assert(command.autocomplete, `Command /${interaction.commandName} does not support autocomplete`);
            command.autocomplete(interaction);
        } else {
            await command.execute(interaction, { activeVoiceTimers });
        }
    } catch (error) {
        console.error(`💥 Command execution failed: /${interaction.commandName}`, {
            user: interaction.user.tag,
            channel: channelName,
            error,
            isTimeout: error instanceof Error && error?.message === "Command execution timeout",
        });
        if (interaction.isAutocomplete()) return;

        // Improved error response handling with interaction state checks
        try {
            const errorMessage =
                error instanceof Error && error.message === "Command execution timeout"
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
            console.error(
                `💥 Failed to send error response for /${interaction.commandName}:`,
                replyError
            );
        }
    }
}