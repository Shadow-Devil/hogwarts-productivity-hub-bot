import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.ts";
import type { GuildMember } from "discord.js";
import { eq, and } from "drizzle-orm";
import { getHouseFromMember } from "../utils/houseUtils.ts";

export const db = drizzle({
  connection: {
    database: process.env.DB_NAME!,
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    host: process.env.DB_HOST!,
    ssl: false
  }, schema, casing: 'snake_case'
});

export async function ensureUserExists(user: GuildMember) {
  const house = getHouseFromMember(user);
  const username = user.user.username;

  await db.insert(schema.userTable).values({ discordId: user.id, username, house }).onConflictDoUpdate({
    target: schema.userTable.discordId,
    set: {
      username,
      house
    }
  });
}

export async function fetchUserTimezone(discordId: string) {
  return await db.select({ timezone: schema.userTable.timezone })
    .from(schema.userTable)
    .where(eq(schema.userTable.discordId, discordId))
    .then(rows => rows[0]?.timezone || "UTC");
}

export async function fetchTasks(discordId: string) {
  return await db.select({ title: schema.taskTable.title, id: schema.taskTable.id }).from(schema.taskTable).where(
    and(
      eq(schema.taskTable.discordId, discordId),
      eq(schema.taskTable.isCompleted, false)
    )
  );
}
