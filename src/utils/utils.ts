import { type GuildMember } from "discord.js";
import assert from "node:assert/strict";
import type { House } from "../types.ts";
import { eq, sql, type ExtractTablesWithRelations } from "drizzle-orm";
import { housePointsTable, userTable } from "../db/schema.ts";
import type { Schema } from "../db/db.ts";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";

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
    const house = await db.update(userTable)
        .set({
            dailyPoints: sql`${userTable.dailyPoints} + ${points}`,
            monthlyPoints: sql`${userTable.monthlyPoints} + ${points}`,
            totalPoints: sql`${userTable.totalPoints} + ${points}`,
        })
        .where(eq(userTable.discordId, discordId)).returning({ house: userTable.house }).then(([row]) => row?.house);

    if (house) {
        await db.update(housePointsTable)
            .set({
                points: sql`${housePointsTable.points} + ${points}`,
            })
            .where(eq(housePointsTable.house, house));
    }
}
