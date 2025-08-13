import { AttachmentBuilder, type Message } from "discord.js";
import assert from "node:assert/strict";
import child_process from "node:child_process";
import util from "node:util";
import { client } from "../client.ts";
import dayjs from "dayjs";
import { alertOwner } from "./alerting.ts";

const exec = util.promisify(child_process.exec);

const logMessages: Message[] = [];

setInterval(async () => {
    await updateLogMessages();
}, 1000 * 60);

export async function registerLogMessage(message: Message): Promise<void> {
    logMessages.push(message);
    await updateLogMessages()

}

export async function sendLogsToLogChannel() {
    const channel = await client.channels.fetch(process.env.LOG_CHANNEL_ID!)
    assert(channel?.isSendable(), `Log channel ${process.env.LOG_CHANNEL_ID} is not sendable or does not exist`);
    const message = await channel.send("Start logging...");
    await registerLogMessage(message);
}

let lastStdout = "";
let lastStderr = "";
let invocationId: string | null = null;

export async function updateLogMessages(shutdown = false) {
    if (!invocationId) {
        invocationId = (await exec('systemctl --user show -p InvocationID --value "discord-bot"')).stdout.trim();
    }
    // Get last x lines, where x is enough to fit within 2000 characters
    const journalLines = 100; // fetch more lines than needed, trim later
    const logs = await exec(`journalctl INVOCATION_ID=${invocationId} + _SYSTEMD_INVOCATION_ID=${invocationId} --no-hostname -o short -n ${journalLines}`, { encoding: 'utf-8' });
    if (logs.stdout === lastStdout && logs.stderr === lastStderr) {
        return;
    }
    lastStdout = logs.stdout;
    lastStderr = logs.stderr;

    const stdout = new AttachmentBuilder(Buffer.from(logs.stdout.replace(/pnpm\[.*\]: /g, ''), 'utf-8'), { name: 'logs.txt' });
    const files = [stdout];

    if (logs.stderr && logs.stderr.trim()) {
        const stderr = new AttachmentBuilder(Buffer.from(logs.stderr.replace(/pnpm\[.*\]: /g, ''), 'utf-8'), { name: 'logs_stderr.txt' });
        files.push(stderr);
    }

    await Promise.all(logMessages.map(msg => msg.edit({
        // Aug 13 09:46:31 
        content: shutdown ? "Logs closed at " + dayjs().format("MMM DD HH:mm:ss")
         : "Live logs (updated every minute):",
        files: files,
    })));
}