import { sql } from "drizzle-orm";
import { boolean, integer, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
    // Technical fields
    discord_id: varchar({length: 255}).primaryKey().notNull(),
    created_at: timestamp().notNull().defaultNow(),
    updated_at: timestamp().notNull().defaultNow(),

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
    discord_id: varchar({length: 255}).notNull().references(() => usersTable.discord_id),
    created_at: timestamp().notNull().defaultNow(),

    joined_at: timestamp().notNull().defaultNow(),
    left_at: timestamp(),
    duration: integer().generatedAlwaysAs(sql`EXTRACT(EPOCH FROM (left_at - joined_at))`).notNull(),
});

export const tasksTable = pgTable("tasks", {
    // Technical fields
    id: serial().primaryKey(),
    discord_id: varchar({length: 255}).notNull().references(() => usersTable.discord_id),
    created_at: timestamp().notNull().defaultNow(),

    // Task fields
    title: varchar({length: 500}).notNull(),
    is_completed: boolean().default(false),
    completed_at: timestamp(),
});

export const housePointsTable = pgTable("house_points", {
    // Technical fields
    id: serial().primaryKey(),
    name: varchar({length: 50}).notNull(),
    created_at: timestamp().notNull().defaultNow(),

    // Points fields
    points: integer().default(0).notNull(),
});
