import { GuildMemberRoleManager, SlashCommandBuilder } from "discord.js";
import type { Command } from "../../types.ts";
import { registerLogMessage } from "../../utils/utils.ts";

export default {
    data: new SlashCommandBuilder()
        .setName("logs")
        .setDescription("View the bot's logs"),
    async execute(interaction) {
        const isAdmin = (interaction.member?.roles as GuildMemberRoleManager).cache.hasAny(...process.env.ADMIN_ROLE_IDS!.split(","));
        const isBotOwner = interaction.user.id === process.env.OWNER_ID;
        if (!isAdmin && !isBotOwner) {
            await interaction.reply({
                content: "You do not have permission to use this command.",
            });
            return;
        }
        const deferReply = await interaction.deferReply({ withResponse: true });

        try {
            await registerLogMessage(deferReply.resource!.message!);
        } catch (err) {
            const errorMessage = (err as Error).message || "Unknown error";
            await interaction.editReply({
                content: errorMessage,
            });
            console.error(errorMessage);
        }
    }
} as Command;
