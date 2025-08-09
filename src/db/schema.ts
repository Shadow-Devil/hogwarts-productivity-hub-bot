import { sql } from "drizzle-orm";
import { boolean, integer, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
    // Technical fields
    discordId: varchar({length: 255}).primaryKey().notNull(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),

    // User customization fields
    house: varchar({length: 50}),
    timezone: varchar({length: 50}).default("UTC"),

    // Score fields
    total_points: integer().default(0),
    streak: integer().default(0),
});


export const voiceSessionsTable = pgTable("voice_sessions", {
    // Technical fields
    id: serial().primaryKey(),
    discordId: varchar({length: 255}).notNull().references(() => usersTable.discordId),
    createdAt: timestamp().notNull().defaultNow(),

    joinedAt: timestamp().notNull().defaultNow(),
    leftAt: timestamp(),
    duration: integer().generatedAlwaysAs(sql`EXTRACT(EPOCH FROM (left_at - joined_at))`).notNull(),
});

export const tasksTable = pgTable("tasks", {
    // Technical fields
    id: serial().primaryKey(),
    discordId: varchar({length: 255}).notNull().references(() => usersTable.discordId),
    createdAt: timestamp().notNull().defaultNow(),

    // Task fields
    title: varchar({length: 500}).notNull(),
    isCompleted: boolean().default(false),
    completedAt: timestamp(),
});

export const housePointsTable = pgTable("house_points", {
    // Technical fields
    id: serial().primaryKey(),
    name: varchar({length: 50}).notNull(),
    createdAt: timestamp().notNull().defaultNow(),

    // Points fields
    points: integer().default(0).notNull(),
});
