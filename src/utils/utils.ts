import { AttachmentBuilder, Message, type GuildMember } from "discord.js";
import assert from "node:assert/strict";
import type { House } from "../types.ts";
import { client } from "../client.ts";
import child_process from "node:child_process";
import util from "node:util";

const exec = util.promisify(child_process.exec);

export function getHouseFromMember(member: GuildMember): House | null {
    let house: House | null = null;
    if (member.roles.cache.has(process.env.GRYFFINDOR_ROLE_ID!)) {
        assert(house === null, `member ${member.user.tag} has multiple house roles: ${member.roles.cache.map(r => r.name).join(", ")}`);
        house = "Gryffindor";
    }
    if (member.roles.cache.has(process.env.SLYTHERIN_ROLE_ID!)) {
        assert(house === null, `member ${member.user.tag} has multiple house roles: ${member.roles.cache.map(r => r.name).join(", ")}`);
        house = "Slytherin";
    }
    if (member.roles.cache.has(process.env.HUFFLEPUFF_ROLE_ID!)) {
        assert(house === null, `member ${member.user.tag} has multiple house roles: ${member.roles.cache.map(r => r.name).join(", ")}`);
        house = "Hufflepuff";
    }
    if (member.roles.cache.has(process.env.RAVENCLAW_ROLE_ID!)) {
        assert(house === null, `member ${member.user.tag} has multiple house roles: ${member.roles.cache.map(r => r.name).join(", ")}`);
        house = "Ravenclaw";
    }
    return house;
}

export async function sendLogsToLogChannel() {
    const channel = await client.channels.fetch(process.env.LOG_CHANNEL_ID!)
    assert(channel?.isSendable(), `Log channel ${process.env.LOG_CHANNEL_ID} is not sendable or does not exist`);
    const message = await channel.send("Start logging...");
    await updateLogMessage(message);
}

export async function updateLogMessage(message: Message) {
    const invocationId = (await exec('systemctl --user show -p InvocationID --value "discord-bot"')).stdout.trim();
    // Get last x lines, where x is enough to fit within 2000 characters
    const journalLines = 100; // fetch more lines than needed, trim later
    const logs = await exec(`journalctl INVOCATION_ID=${invocationId} + _SYSTEMD_INVOCATION_ID=${invocationId} --no-hostname -o short -n ${journalLines}`, { encoding: 'utf-8' });

    const stdout = new AttachmentBuilder(Buffer.from(logs.stdout.replace(/pnpm\[.*\]: /g, ''), 'utf-8'), { name: 'logs.txt' });
    if (logs.stderr && logs.stderr.trim()) {
        const stderr = new AttachmentBuilder(Buffer.from(logs.stderr.replace(/pnpm\[.*\]: /g, ''), 'utf-8'), { name: 'logs_stderr.txt' });
        await message.edit({
            content: "Live logs (updated every minute):",
            files: [stdout, stderr],
        });
        return;
    }

    await message.edit({
        content: "Live logs (updated every minute):",
        files: [stdout],
    });
}