import { GuildMemberRoleManager, SlashCommandBuilder } from "discord.js";
import type { Command } from "../../commands.ts";

export default {
    data: new SlashCommandBuilder()
        .setName("logs")
        .setDescription("View the bot's logs"),
    async execute(interaction) {
        if (!(interaction.member?.roles as GuildMemberRoleManager).cache.has(process.env.ADMIN_ROLE_ID!)) {
            await interaction.reply({
                content: "You do not have permission to use this command.",
                ephemeral: true,
            });
        }

        await interaction.reply({
            content: "TODO",
            ephemeral: true,
        })
    }
} as Command;
