import type { Client } from "discord.js";
import { commands } from "../commands.ts";
import * as VoiceStateScanner from "../utils/voiceStateScanner.ts";
import { alertOwner } from "../utils/alerting.ts";
import { db } from "../db/db.ts";
import { userTable } from "../db/schema.ts";
import { gt } from "drizzle-orm";

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

async function resetNicknameStreaks(client: Client<boolean>) {
    console.log("Guilds Cache Size:", client.guilds.cache.size)
    const discordIds = await db.select({
        discordId: userTable.discordId,
    }).from(userTable).where(gt(userTable.messageStreak, 0)).then(rows => rows.map(r => r.discordId))

    for (const guild of client.guilds.cache.values()) {
        const filteredMembers = await guild.members.fetch().then(members =>
            members.filter(member =>
                !discordIds.includes(member.id) &&
                member.guild.ownerId !== member.user.id &&
                member.nickname?.match(/⚡\d+$/))
        );

        console.log(`Processing guild: ${guild.name} (${guild.id}), Members Cache Size: ${guild.members.cache.size}, filtered ${filteredMembers.size}`);
        console.log("Members to reset:", filteredMembers.map(m => m.user.tag).join(", "));
        for (const member of filteredMembers.values()) {
            const newNickname = member.nickname?.replace(/⚡\d+$/, "").trim() || member.user.username;
            console.log(`Resetting nickname from ${member?.nickname} to ${newNickname}`);
            await member?.setNickname(newNickname);
        }
    }
}
