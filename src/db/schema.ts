import { sql } from "drizzle-orm";
import { boolean, integer, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";

export const userTable = pgTable("user", {
    // Technical fields
    discordId: varchar({length: 255}).primaryKey().notNull(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
    username: varchar({ length: 255 }).notNull(),

    // User customization fields
    house: varchar({length: 50, enum: ["Gryffindor", "Hufflepuff", "Ravenclaw", "Slytherin"]}),
    timezone: varchar({length: 50}).default("UTC").notNull(),
    lastDailyReset: timestamp().defaultNow().notNull(),

    // Score fields
    dailyPoints: integer().default(0).notNull(),
    monthlyPoints: integer().default(0).notNull(),
    totalPoints: integer().default(0).notNull(),

    dailyVoiceTime: integer().default(0).notNull(),
    monthlyVoiceTime: integer().default(0).notNull(),
    totalVoiceTime: integer().default(0).notNull(),

    streak: integer().default(0).notNull(),
    isStreakUpdatedToday: boolean().default(false).notNull(),
});

export const voiceSessionTable = pgTable("voice_session", {
    // Technical fields
    id: serial().primaryKey(),
    discordId: varchar({ length: 255 }).notNull().references(() => userTable.discordId),

    joinedAt: timestamp().notNull().defaultNow(),
    leftAt: timestamp(),

    // if points and voiceTime were awarded for this session
    isTracked: boolean().default(false).notNull(),

    // in seconds
    duration: integer().generatedAlwaysAs(sql`EXTRACT(EPOCH FROM (left_at - joined_at))`),
});

export const taskTable = pgTable("task", {
    // Technical fields
    id: serial().primaryKey(),
    discordId: varchar({length: 255}).notNull().references(() => userTable.discordId),
    createdAt: timestamp().notNull().defaultNow(),

    // Task fields
    title: varchar({length: 500}).notNull(),
    isCompleted: boolean().default(false),
    completedAt: timestamp(),
});
