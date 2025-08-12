import { GuildMemberRoleManager, SlashCommandBuilder } from "discord.js";
import type { Command } from "../../commands.ts";
import util from "node:util";
import child_process from "node:child_process";

const exec = util.promisify(child_process.exec);

export default {
    data: new SlashCommandBuilder()
        .setName("logs")
        .setDescription("View the bot's logs"),
    async execute(interaction) {
        const isAdmin = !(interaction.member?.roles as GuildMemberRoleManager).cache.has(process.env.ADMIN_ROLE_ID!);
        const isBotOwner = interaction.user.id === process.env.OWNER_ID;
        if (!isAdmin || !isBotOwner) {
            await interaction.reply({
                content: "You do not have permission to use this command.",
                ephemeral: true,
            });
            return;
        }
        await interaction.deferReply({ ephemeral: true });


        try {
            const logs = await exec('journalctl --user -u discord-bot --since "yesterday"', { encoding: 'utf-8' });
            console.log(logs);
            await interaction.editReply({
                content: "Stdout:\n" + logs.stdout + "\nStderr:\n" + logs.stderr,
            })
        } catch (err) {
            await interaction.editReply({
                content: "Error fetching logs: " + (err as Error).message,
            });
            console.error("Error fetching logs:", err);
        }
    }
} as Command;
