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

    console.log(`Message received from ${message.author.tag} in guild ${message.guild.name}: ${message.content}`);
    ensureUserExists(message.member, discordId, message.author.username);

    // Receive counter from the db
    db.transaction(async (db) => {
        const user = await db.select({
            dailyMessages: userTable.dailyMessages,
            messageStreak: userTable.messageStreak,
            ismessageStreakUpdatedToday: userTable.isMessageStreakUpdatedToday
        }).from(userTable).where(eq(userTable.discordId, discordId)).then(rows => rows[0]!!);

        const newDailyMessages = user.dailyMessages + 1;
        let newStreak = user.messageStreak;
        if (newDailyMessages >= MIN_DAILY_MESSAGES_FOR_STREAK && !user.ismessageStreakUpdatedToday) {
            newStreak = await db.update(userTable)
                .set({ dailyMessages: newDailyMessages, messageStreak: sql`${userTable.messageStreak} + 1`, isMessageStreakUpdatedToday: true })
                .where(eq(userTable.discordId, discordId)).returning({ messageStreak: userTable.messageStreak }).then(rows => rows[0]!!.messageStreak!!);
        } else {
            await db.update(userTable)
                .set({ dailyMessages: newDailyMessages })
                .where(eq(userTable.discordId, discordId));
        }

        if (newDailyMessages >= MIN_DAILY_MESSAGES_FOR_STREAK) {
            const newNickname = `${message.member?.nickname?.replace(/⚡\d+$/, "").trim() || message.author.displayName} ⚡${newStreak}`;

            if (newNickname !== message.member?.nickname && message.member?.guild.ownerId !== discordId) {
                await message.member?.setNickname(newNickname);
            }
        }
    });
}
