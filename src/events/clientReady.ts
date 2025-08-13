import type { Client } from "discord.js";
import { commands } from "../commands.ts";
import * as VoiceStateScanner from "../utils/voiceStateScanner.ts";
import { alertOwner } from "../utils/alerting.ts";
import { sendLogsToLogChannel } from "../utils/utils.ts";

export async function execute(c: Client<true>): Promise<void> {
    console.log(`Bot User: ${c.user.tag}`);
    console.log(`Client ID: ${c.user.id}`);
    console.log(`Commands Loaded: ${commands.size}`);

    try {
        await VoiceStateScanner.scanAndStartTracking();
        await sendLogsToLogChannel();
    } catch (error) {
        console.log("❌ Bot Initialization Failed");
        console.error("error:", error);
        process.exit(1);
    }
    await alertOwner("Bot deployed successfully.");
}
