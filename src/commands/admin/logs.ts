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
            const invocationId = (await exec('systemctl --user show -p InvocationID --value "discord-bot"')).stdout.trim();
            // Get last x lines, where x is enough to fit within 2000 characters
            const maxChars = 2000;
            const journalLines = 100; // fetch more lines than needed, trim later
            const logs = await exec(`journalctl INVOCATION_ID=${invocationId} + _SYSTEMD_INVOCATION_ID=${invocationId} --no-hostname -o short -n ${journalLines} -r`, { encoding: 'utf-8' });

            function truncateToMaxChars(text: string, max: number, wrapStart: string, wrapEnd: string): string {
                max = max - wrapStart.length - wrapEnd.length;
                const lines = text.split('\n');
                let finalOutput = '';
                for (const line of lines) {
                    if ((finalOutput + line + '\n').length > max) {
                        break;
                    }
                    finalOutput = line + '\n' + finalOutput;
                }
                return wrapStart + finalOutput.trim() + wrapEnd;
            }

            let output = logs.stdout.replace(/pnpm\[.*\]: /g, '');
            let replyContent = truncateToMaxChars(output, maxChars, "```\n", "\n```");
            await interaction.editReply({
                content: replyContent,
            });

            // If there is stderr, show it after stdout, truncated to fit
            if (logs.stderr && logs.stderr.trim()) {
                let stderrOutput = logs.stderr.replace(/pnpm\[.*\]: /g, '');
                replyContent = truncateToMaxChars(stderrOutput, maxChars,"Stderr:\n```", "\n```");
                    await interaction.followUp({
                        content: replyContent,
                    })
            }

 
        } catch (err) {
            const errorMessage = (err as Error).message || "Unknown error";
            await interaction.editReply({
                content: errorMessage,
            });
            console.error(errorMessage);
        }
    }
} as Command;
