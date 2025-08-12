import { Attachment, AttachmentBuilder, GuildMemberRoleManager, SlashCommandBuilder } from "discord.js";
import type { Command } from "../../types.ts";
import util from "node:util";
import child_process from "node:child_process";

const exec = util.promisify(child_process.exec);

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
        await interaction.deferReply();

        try {
            const invocationId = (await exec('systemctl --user show -p InvocationID --value "discord-bot"')).stdout.trim();
            // Get last x lines, where x is enough to fit within 2000 characters
            const journalLines = 100; // fetch more lines than needed, trim later
            const logs = await exec(`journalctl INVOCATION_ID=${invocationId} + _SYSTEMD_INVOCATION_ID=${invocationId} --no-hostname -o short -n ${journalLines}`, { encoding: 'utf-8' });

            const stdout = new AttachmentBuilder(Buffer.from(logs.stdout.replace(/pnpm\[.*\]: /g, ''), 'utf-8'), { name: 'logs.txt' });
            if (logs.stderr && logs.stderr.trim()) {
                const stderr = new AttachmentBuilder(Buffer.from(logs.stderr.replace(/pnpm\[.*\]: /g, ''), 'utf-8'), { name: 'logs_stderr.txt' });
                await interaction.editReply({
                    content: "Logs fetched successfully. See attachments.",
                    files: [stdout, stderr],
                });
                return;
            }

            await interaction.editReply({
                content: "Logs fetched successfully. See attachment.",
                files: [stdout],
            });
            return;
 
        } catch (err) {
            const errorMessage = (err as Error).message || "Unknown error";
            await interaction.editReply({
                content: errorMessage,
            });
            console.error(errorMessage);
        }
    }
} as Command;
