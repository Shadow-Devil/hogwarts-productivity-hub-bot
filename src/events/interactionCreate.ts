import { AutocompleteInteraction, ChatInputCommandInteraction, GuildMember, MessageFlags, type CacheType, type Interaction } from "discord.js";
import { commands } from "../commands.ts";
import assert from "node:assert/strict";
import { ensureUserExists } from "../db/db.ts";
import { alertOwner } from "../utils/alerting.ts";
import { interactionExecutionTimer } from "../monitoring.ts";

const activeVoiceTimers = new Map(); // key: voiceChannelId, value: { workTimeout, breakTimeout, phase, endTime }

export async function execute(interaction: Interaction): Promise<void> {
    if (!interaction.isChatInputCommand() && !interaction.isAutocomplete()) return;
    const end = interactionExecutionTimer.startTimer()

    const command = commands.get(interaction.commandName);
    if (!command) {
        console.warn(`⚠️ Unknown command attempted: /${interaction.commandName} by ${interaction.user.tag}`);
        return;
    }

    logCommandExecution(interaction);

    try {
        await ensureUserExists(interaction.member as GuildMember);
        if (interaction.isAutocomplete()) {
            assert(command.autocomplete, `Command /${interaction.commandName} does not support autocomplete`);
            await command.autocomplete(interaction);
        } else {
            await command.execute(interaction, { activeVoiceTimers });
        }
    } catch (error) {
        await alertOwner(`💥 Command execution failed: /${interaction.commandName}\n${error}`);
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
    console.log("-".repeat(5))
    end({ command: interaction.commandName, subcommand: interaction.options.getSubcommand(false) || '', is_autocomplete: interaction.isAutocomplete().toString() });
}
function logCommandExecution(interaction: ChatInputCommandInteraction<CacheType> | AutocompleteInteraction<CacheType>) {
    const channel = interaction.channel;
    let channelName;
    if (channel !== null && !channel.isDMBased()) {
        channelName = `#${channel.name}`;
    } else {
        channelName = "DM";
    }

    let commandString = interaction.commandName + (interaction.options.getSubcommand(false) ? ` ${interaction.options.getSubcommand()}` : "");
    if (interaction.isAutocomplete()) {
        commandString += ` ${interaction.options.getFocused()}`;
    }
    console.log("+".repeat(5) + ` /${commandString} by ${interaction.user.tag} in ${channelName}`);
}

