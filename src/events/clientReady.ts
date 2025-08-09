import type { Client } from "discord.js";
import { client } from "../client.ts";
import { commands } from "../commands.ts";
import * as SessionRecovery from "../utils/sessionRecovery.ts";
import * as VoiceStateScanner from "../utils/voiceStateScanner.ts";
import { activeVoiceSessions, gracePeriodSessions } from "./voiceStateUpdate.ts";


export async function execute(c: Client<true>): Promise<void> {
    console.log(`Bot User: ${c.user.tag}`);
    console.log(`Client ID: ${c.user.id}`);
    console.log(`Commands Loaded: ${commands.size}`);

    try {
        const recoveryResults = await SessionRecovery.initialize(
            activeVoiceSessions,
            gracePeriodSessions
        );
        if (recoveryResults > 0) {
            console.log(`📈 Recovered ${recoveryResults} incomplete sessions from previous runs`);
        }

        const scanResults = await VoiceStateScanner.scanAndStartTracking(
            client,
            activeVoiceSessions
        );

        if (scanResults.trackingStarted > 0) {
            console.log(
                `🎤 Auto-started tracking for ${scanResults.trackingStarted} users already in voice channels`
            );
        }
        console.log("═".repeat(50));
    } catch (error) {
        console.log("❌ Bot Initialization Failed");
        console.log("═".repeat(50));
        console.error("error:", error);
        console.log("═".repeat(50));
        process.exit(1);
    }
}