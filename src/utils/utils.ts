import { ChatInputCommandInteraction, type GuildMember } from "discord.js";
import assert from "node:assert/strict";
import type { House } from "../types.ts";
import { eq, sql, type ExtractTablesWithRelations } from "drizzle-orm";
import { housePointsTable, userTable } from "../db/schema.ts";
import type { Schema } from "../db/db.ts";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import { BotColors } from "./constants.ts";

export function getHouseFromMember(member: GuildMember | null): House | undefined {
  let house: House | undefined = undefined;
  if (member === null) return house;

  if (member.roles.cache.has(process.env.GRYFFINDOR_ROLE_ID)) {
    house = "Gryffindor";
  }
  if (member.roles.cache.has(process.env.SLYTHERIN_ROLE_ID)) {
    assert(house === undefined, `member ${member.user.tag} has multiple house roles: ${member.roles.cache.map(r => r.name).join(", ")}`);
    house = "Slytherin";
  }
  if (member.roles.cache.has(process.env.HUFFLEPUFF_ROLE_ID)) {
    assert(house === undefined, `member ${member.user.tag} has multiple house roles: ${member.roles.cache.map(r => r.name).join(", ")}`);
    house = "Hufflepuff";
  }
  if (member.roles.cache.has(process.env.RAVENCLAW_ROLE_ID)) {
    assert(house === undefined, `member ${member.user.tag} has multiple house roles: ${member.roles.cache.map(r => r.name).join(", ")}`);
    house = "Ravenclaw";
  }
  return house;
}

export async function awardPoints(db: PgTransaction<NodePgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>, discordId: string, points: number) {
  // Update user's total points
  const house = await db.update(userTable).set({
    dailyPoints: sql`${userTable.dailyPoints} + ${points}`,
    monthlyPoints: sql`${userTable.monthlyPoints} + ${points}`,
    totalPoints: sql`${userTable.totalPoints} + ${points}`,
  }).where(eq(userTable.discordId, discordId))
    .returning({ house: userTable.house })
    .then(([row]) => row?.house);

  if (house) {
    await db.update(housePointsTable).set({
      points: sql`${housePointsTable.points} + ${points}`,
    }).where(eq(housePointsTable.house, house));
  }
}

export async function replyError(
  interaction: ChatInputCommandInteraction,
  title: string,
  ...messages: string[]
) {
  await interaction.editReply({
    embeds: [{
      color: BotColors.ERROR,
      title: `❌ ${title}`,
      description: messages.join("\n"),
    }]
  });
}

export function timeToHours(seconds: number | null): string {
  if (seconds === null) return "0h 0m";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}
