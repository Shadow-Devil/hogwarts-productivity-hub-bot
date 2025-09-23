import type { Message, OmitPartialGroupDMChannel } from "discord.js";
import { db, ensureUserExists } from "../db/db.ts";
import { userTable } from "../db/schema.ts";
import { eq, sql } from "drizzle-orm";
import { MIN_DAILY_MESSAGES_FOR_STREAK } from "../utils/constants.ts";

export async function execute(message: OmitPartialGroupDMChannel<Message<boolean>>): Promise<void> {
    // Ignore messages from bots
    if (message.author.bot) return;
    // Ignore messages not in a guild
    if (!message.inGuild()) return
    const discordId = message.author.id;
    if (discordId !== process.env.OWNER_ID) return;

    console.log(`Message received from ${message.author.tag} in guild ${message.guild.name}: ${message.content}`);
    ensureUserExists(message.member, discordId, message.author.username);

    const streak = parseStreakFromNickname(message.member?.nickname);

    // Receive counter from the db
    db.transaction(async (db) => {
        const user = await db.select({
            dailyMessagesSent: userTable.dailyMessagesSent,
            messageStreak: userTable.messageStreak,
            ismessageStreakUpdatedToday: userTable.isMessageStreakUpdatedToday
        }).from(userTable).where(eq(userTable.discordId, discordId)).then(rows => rows[0]!!);

        if (user.messageStreak === null) {
            await db.update(userTable)
                .set({ messageStreak: streak ?? 0})
                .where(eq(userTable.discordId, discordId));
        }

        const newDailyMessagesSent = user.dailyMessagesSent + 1;
        if (newDailyMessagesSent >= MIN_DAILY_MESSAGES_FOR_STREAK && !user.ismessageStreakUpdatedToday) {
            const newStreak = await db.update(userTable)
                .set({ dailyMessagesSent: newDailyMessagesSent, messageStreak: sql`${userTable.messageStreak} + 1`, isMessageStreakUpdatedToday: true })
                .where(eq(userTable.discordId, discordId)).returning({ messageStreak: userTable.messageStreak }).then(rows => rows[0]!!.messageStreak!!);

            message.member?.setNickname(`${message.member.nickname?.replace(/⚡\d+$/, "").trim() || message.author.username} ⚡${newStreak + 1}`)
        } else {
            await db.update(userTable)
                .set({ dailyMessagesSent: newDailyMessagesSent })
                .where(eq(userTable.discordId, discordId));
        }
    });

}

function parseStreakFromNickname(nickname: string | null | undefined): number | null {
    if (!nickname) return null;
    const match = nickname.match(/⚡(\d+)$/);
    return match ? parseInt(match[1]!!, 10) : null;
}
