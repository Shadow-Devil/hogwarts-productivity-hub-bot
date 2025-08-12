import type { Client } from "discord.js";
import { commands } from "../commands.ts";
import * as VoiceStateScanner from "../utils/voiceStateScanner.ts";

export async function execute(c: Client<true>): Promise<void> {
    console.log(`Bot User: ${c.user.tag}`);
    console.log(`Client ID: ${c.user.id}`);
    console.log(`Commands Loaded: ${commands.size}`);

    try {
        await VoiceStateScanner.scanAndStartTracking();
    } catch (error) {
        console.log("❌ Bot Initialization Failed");
        console.error("error:", error);
        process.exit(1);
    }
    if (process.env.OWNER_ID) {
        await c.users.fetch(process.env.OWNER_ID!).then(u => u.send("Deployed successfully"));
    }
}
