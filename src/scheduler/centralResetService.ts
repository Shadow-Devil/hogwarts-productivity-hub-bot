import cron from "node-cron";
import dayjs from "dayjs";
import { db, fetchOpenVoiceSessions } from "../db/db.ts";
import { userTable } from "../db/schema.ts";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { endVoiceSession, startVoiceSession } from "../utils/voiceUtils.ts";
import { wrapWithAlerting } from "../utils/alerting.ts";
import { resetExecutionTimer } from "../monitoring.ts";
import { client } from "../client.ts";

const scheduledJobs = new Map<string, cron.ScheduledTask>();

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
  const end = resetExecutionTimer.startTimer();
  console.debug("+".repeat(5) + " Processing daily resets at " + dayjs().format("MMM DD HH:mm:ss"));

  await wrapWithAlerting(async () => {
    await db.transaction(async (db) => {
      const usersNeedingPotentialReset = await db.select({
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

      const usersInVoiceSessions = await fetchOpenVoiceSessions(db, usersNeedingReset);

      await Promise.all(usersInVoiceSessions.map(session => endVoiceSession(session, db)));

      await db.select().from(userTable).where(and(inArray(userTable.discordId, usersNeedingReset), eq(userTable.isMessageStreakUpdatedToday, false))).then(async rows => {
        for (const row of rows) {
          console.log(`Resetting message streak for user ${row.discordId} due to inactivity`);
          const members = client.guilds.cache.map(guild => guild.members.fetch(row.discordId).catch(() => null)).filter(member => member !== null);
          for await (const member of members) {
            if (member?.guild.ownerId !== member?.user.id) {
              await member?.setNickname(member?.nickname?.replace(/⚡\d+$/, "").trim() || member?.user.username);
            }
          }
        };
      });

      const result = await db.update(userTable).set(
        {
          dailyPoints: 0,
          dailyVoiceTime: 0,
          lastDailyReset: new Date(),
          voiceStreak: sql`CASE WHEN ${userTable.isVoiceStreakUpdatedToday} = false THEN 0 ELSE ${userTable.voiceStreak} END`,
          isVoiceStreakUpdatedToday: false,
          messageStreak: sql`CASE WHEN ${userTable.isMessageStreakUpdatedToday} = false THEN 0 ELSE ${userTable.messageStreak} END`,
          isMessageStreakUpdatedToday: false,
          dailyMessages: 0,
        }
      ).where(inArray(userTable.discordId, usersNeedingReset))

      await Promise.all(usersInVoiceSessions.map(session => startVoiceSession(session, db)));

      console.log("Daily reset edited this many users:", result.rowCount);
    });
  }, "Daily reset processing");
  console.debug("-".repeat(5));
  end({ action: "daily" });
}

async function processMonthlyResets() {
  const end = resetExecutionTimer.startTimer();
  console.debug('+'.repeat(5) + " Processing monthly resets at " + dayjs().format("MMM DD HH:mm:ss"));
  await wrapWithAlerting(async () => {
    const result = await db.update(userTable).set(
      {
        monthlyPoints: 0,
        monthlyVoiceTime: 0,
      }
    )
    console.log("Monthly reset edited this many users:", result.rowCount);
  }, "Monthly reset processing");
  console.debug('-'.repeat(5));
  end({ action: "monthly" });
}
