import type { Client } from "discord.js";
import { commands } from "../commands.ts";
import * as VoiceStateScanner from "../utils/voiceStateScanner.ts";

export async function execute(c: Client<true>): Promise<void> {
    console.log(`Bot User: ${c.user.tag}`);
    console.log(`Client ID: ${c.user.id}`);
    console.log(`Commands Loaded: ${commands.size}`);

    try {
        await VoiceStateScanner.scanAndStartTracking();

        console.log("═".repeat(50));
    } catch (error) {
        console.log("❌ Bot Initialization Failed");
        console.log("═".repeat(50));
        console.error("error:", error);
        console.log("═".repeat(50));
        process.exit(1);
    }
}