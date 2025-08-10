import cron from "node-cron";
import dayjs from "dayjs";
import { db } from "../db/db.ts";
import { userTable } from "../db/schema.ts";
import { gte, inArray, sql } from "drizzle-orm";

let isRunning = false;
const scheduledJobs = new Map<string, cron.ScheduledTask>();

export async function start() {
  if (isRunning) {
    return;
  }

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

  isRunning = true;
}

export async function processDailyResets() {
  const usersNeedingPotentialReset = await db.select({
    discordId: userTable.discordId,
    timezone: userTable.timezone,
    lastDailyReset: userTable.lastDailyReset,
  }).from(userTable).where(
    gte(userTable.lastDailyReset, dayjs().subtract(1, "day").toDate()),
  )

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

  //TODO maybe split voice time and award points directly for the old day and start new vc session

  const result = await db.update(userTable).set(
    {
      dailyPoints: 0,
      dailyVoiceTime: 0,
      lastDailyReset: dayjs().toDate(),
      streak: sql`CASE WHEN ${userTable.isStreakUpdatedToday} = false THEN 0 ELSE ${userTable.streak}`,
      isStreakUpdatedToday: false,
    }
  ).where(inArray(userTable.discordId, usersNeedingReset))

  console.log("Daily reset edited this many users:", result.rowCount);
}

async function processMonthlyResets() {
  const result = await db.update(userTable).set(
    {
      monthlyPoints: 0,
      monthlyVoiceTime: 0,
    }
  )
  console.log("Monthly reset edited this many users:", result.rowCount);
}
