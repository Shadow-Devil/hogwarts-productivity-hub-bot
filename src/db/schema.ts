import { sql } from "drizzle-orm";
import { boolean, integer, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";

export const userTable = pgTable("user", {
    // Technical fields
    discordId: varchar({length: 255}).primaryKey().notNull(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),

    // User customization fields
    house: varchar({length: 50, enum: ["Gryffindor", "Hufflepuff", "Ravenclaw", "Slytherin"]}),
    timezone: varchar({length: 50}).default("UTC"),

    // Score fields
    dailyPoints: integer().default(0),
    monthlyPoints: integer().default(0),
    totalPoints: integer().default(0),

    dailyVoiceTime: integer().default(0),
    monthlyVoiceTime: integer().default(0),
    totalVoiceTime: integer().default(0),

    streak: integer().default(0),
});

export const voiceSessionTable = pgTable("voice_session", {
    // Technical fields
    id: serial().primaryKey(),
    discordId: varchar({length: 255}).notNull().references(() => userTable.discordId),
    createdAt: timestamp().notNull().defaultNow(),

    joinedAt: timestamp().notNull().defaultNow(),
    leftAt: timestamp(),
    duration: integer().generatedAlwaysAs(sql`EXTRACT(EPOCH FROM (left_at - joined_at))`).notNull(),
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

export const housePointTable = pgTable("house_point", {
    // Technical fields
    id: serial().primaryKey(),
    name: varchar({length: 50}).notNull(),
    createdAt: timestamp().notNull().defaultNow(),

    // Points fields
    points: integer().default(0).notNull(),
});
