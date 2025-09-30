import type { Client } from "discord.js";
import { commands } from "../commands.ts";
import * as VoiceStateScanner from "../utils/voiceStateScanner.ts";
import { alertOwner } from "../utils/alerting.ts";
import { db } from "../db/db.ts";
import { userTable } from "../db/schema.ts";
import { gt } from "drizzle-orm";
import { updateMessageStreakInNickname } from "../utils/utils.ts";

export async function execute(c: Client<true>): Promise<void> {
    console.log(`Bot User: ${c.user.tag}`);
    console.log(`Client ID: ${c.user.id}`);
    console.log(`Commands Loaded: ${commands.size}`);

    try {
        await VoiceStateScanner.scanAndStartTracking();
        await resetNicknameStreaks(c);
    } catch (error) {
        console.error("❌ Bot Initialization Failed");
        console.error("error:", error);
        process.exit(1);
    }
    await alertOwner("Bot deployed successfully.");
}

async function resetNicknameStreaks(client: Client) {
    console.log("Guilds Cache Size:", client.guilds.cache.size)
    const discordIdsToStreak = await db.select({
        discordId: userTable.discordId,
        messageStreak: userTable.messageStreak,
    }).from(userTable).where(gt(userTable.messageStreak, 0)).then(rows => rows.reduce((acc, r) => {
        acc[r.discordId] = r.messageStreak
        return acc;
    }, {} as {[x: string]: number}));
    const discordIds = new Set(Object.keys(discordIdsToStreak));

    for (const guild of client.guilds.cache.values()) {
        const membersToReset = await guild.members.fetch().then(members =>
            members.filter(member =>
                !discordIds.has(member.id) &&
                member.guild.ownerId !== member.user.id &&
                member.nickname?.match(/⚡\d+$/))
        );
        const membersToUpdate = guild.members.cache.filter(member => discordIds.has(member.id) && !member.nickname?.endsWith(`⚡${discordIdsToStreak[member.id]}`));

        console.log(`Processing guild: ${guild.name} (${guild.id}), Members Cache Size: ${guild.members.cache.size}, toReset ${membersToReset.size} toUpdate ${membersToUpdate.size}`);
        await Promise.all([
            ...membersToReset.values().map(async m => await updateMessageStreakInNickname(m, 0)),
            ...membersToUpdate.values().map(async m => await updateMessageStreakInNickname(m, discordIdsToStreak[m.id]!!))
        ]);
    }
}
