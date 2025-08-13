import cron from "node-cron";
import dayjs from "dayjs";
import { db, fetchOpenVoiceSessions } from "../db/db.ts";
import { userTable, voiceSessionTable } from "../db/schema.ts";
import { and, eq, inArray, isNull, sql, type ExtractTablesWithRelations } from "drizzle-orm";
import { endVoiceSession, startVoiceSession } from "../utils/voiceUtils.ts";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import { wrapWithAlerting } from "../utils/alerting.ts";

const scheduledJobs = new Map<string, cron.ScheduledTask>();
type Schema = typeof import("../db/schema.ts");

export async function start() {

  // Schedule daily reset checks - run every hour to catch all timezones
  const dailyResetJob = cron.schedule(
    "0 * * * *",
    async () => {
      await processDailyResets();
    },
    {
      timezone: "UTC",
    }
  );

  // Schedule monthly reset checks - run on the 1st of the month
  const monthlyResetJob = cron.schedule(
    "0 * 1 * *",
    async () => {
      await processMonthlyResets();
    },
    {
      timezone: "UTC",
    }
  );

  // Track all jobs
  scheduledJobs.set("dailyReset", dailyResetJob);
  scheduledJobs.set("monthlyReset", monthlyResetJob);

  // Start all jobs
  await dailyResetJob.start();
  await monthlyResetJob.start();
  console.log("CentralResetService started successfully");
}

async function processDailyResets() {
  console.log("+".repeat(5));
  wrapWithAlerting(async () => {
    await db.transaction(async (tx) => {
      const usersNeedingPotentialReset = await tx.select({
        discordId: userTable.discordId,
        timezone: userTable.timezone,
        lastDailyReset: userTable.lastDailyReset,
      }).from(userTable)

      // Filter to only include users who are actually past their local midnight
      const usersNeedingReset = [];
      for (const user of usersNeedingPotentialReset) {
        const userTime = dayjs().tz(user.timezone);
        const lastReset = dayjs(user.lastDailyReset).tz(user.timezone);

        if (!userTime.isSame(lastReset, "day")) {
          usersNeedingReset.push(user.discordId);
        }
      }

      if (usersNeedingReset.length === 0) {
        console.log("No users need daily reset at this time");
        return;
      }

      const usersInVoiceSessions = await fetchOpenVoiceSessions(tx, usersNeedingReset);

      await Promise.all(usersInVoiceSessions.map(user => endVoiceSession(user.discordId, user.username!)));

      const result = await tx.update(userTable).set(
        {
          dailyPoints: 0,
          dailyVoiceTime: 0,
          lastDailyReset: new Date(),
          streak: sql`CASE WHEN ${userTable.isStreakUpdatedToday} = false THEN 0 ELSE ${userTable.streak} END`,
          isStreakUpdatedToday: false,
        }
      ).where(inArray(userTable.discordId, usersNeedingReset))

      await Promise.all(usersInVoiceSessions.map(user => startVoiceSession(user.discordId, user.username!)));

      console.log("Daily reset edited this many users:", result.rowCount);
    });
  }, "Daily reset processing");
  console.log("-".repeat(5));
}

async function processMonthlyResets() {
  console.log('+'.repeat(5));
  wrapWithAlerting(async () => {
    const result = await db.update(userTable).set(
      {
        monthlyPoints: 0,
        monthlyVoiceTime: 0,
      }
    )
    console.log("Monthly reset edited this many users:", result.rowCount);
  }, "Monthly reset processing");
  console.log('-'.repeat(5));
}
