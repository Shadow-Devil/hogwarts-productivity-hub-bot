import type {
  ChatInputCommandInteraction,
  GuildMember,
  VoiceBasedChannel,
} from "discord.js";
import { db, } from "../db/db.ts";
import { userTable, voiceSessionTable } from "../db/schema.ts";
import { and, eq, isNull, sql } from "drizzle-orm";
import { FIRST_HOUR_POINTS as POINTS_FIRST_HOUR, MIN_DAILY_MINUTES_FOR_STREAK, REST_HOURS_POINTS as POINTS_REST_HOURS, MAX_HOURS_PER_DAY } from "../utils/constants.ts";

/**
 * get the voice channel for a user from an interaction
 * This function handles the case where Discord's cached member data might be stale
 * @param {ChatInputCommandInteraction} interaction - The Discord interaction
 * @param options - Options for voice channel detection
 */
export async function getUserVoiceChannel(
  interaction: ChatInputCommandInteraction
): Promise<VoiceBasedChannel | null> {
  if (!interaction.guild) {
    console.warn("No guild found in interaction");
    return null;
  }
  const member = interaction.member as GuildMember;

  if (member.voice?.channel) {
    console.log(
      `Voice channel found via cached member: ${member.voice.channel.name} (${member.voice.channel.id})`
    );
    return member.voice.channel;
  }

  console.log(`User ${interaction.user.tag} is not in any voice channel`);
  return null;
}

// Start a voice session when user joins VC (timezone-aware)
export async function startVoiceSession(
  discordId: string,
  username: string,
) {
  await db.transaction(async (db) => {
    const existingVoiceSession = await db.$count(voiceSessionTable, and(
      eq(voiceSessionTable.discordId, discordId),
      isNull(voiceSessionTable.leftAt)
    ));

    if (existingVoiceSession > 0) {
      console.error(`Voice session already active for ${username}, closing and starting a new one`);
      await endVoiceSession(discordId, username, false); // End existing session without tracking
    }

    await db.insert(voiceSessionTable).values({ discordId });

    console.log(`Voice session started for ${username}`);
  })
}

/** End a voice session when user leaves VC
 *  @param {string} discordId - User's Discord ID
 *  @param {boolean} isTracked - If false, do not update user stats (for deleting old sessions)
 */
export async function endVoiceSession(discordId: string, username: string, isTracked: boolean = true) {
  await db.transaction(async (db) => {
    const existingVoiceSession = await db.select({ id: voiceSessionTable.id }).from(voiceSessionTable).where(and(
      eq(voiceSessionTable.discordId, discordId),
      isNull(voiceSessionTable.leftAt)
    ))
    if (existingVoiceSession.length !== 1) {
      console.error(`Could not end voice session, found ${existingVoiceSession.length} active voice session found for ${username}`);
      return;
    }

    const [voiceSessionWithDuration] = await db.update(voiceSessionTable).set({
      leftAt: new Date(),
      isTracked, // Only track if not deleting old session
    }).where(eq(voiceSessionTable.id, existingVoiceSession[0]!!.id)).returning({
      duration: voiceSessionTable.duration,
    });
    if (!isTracked) {
      return;
    }

    const duration = voiceSessionWithDuration!.duration || 0;

    // Update user's voice time stats
    const [user] = await db.update(userTable).set({
      dailyVoiceTime: sql`${userTable.dailyVoiceTime} + ${duration}`,
      monthlyVoiceTime: sql`${userTable.monthlyVoiceTime} + ${duration}`,
      totalVoiceTime: sql`${userTable.totalVoiceTime} + ${duration}`,
    }).where(eq(userTable.discordId, discordId)).returning({
      dailyVoiceTime: userTable.dailyVoiceTime,
      isStreakUpdatedToday: userTable.isStreakUpdatedToday,
    });

    // update streak
    if (user!.dailyVoiceTime >= MIN_DAILY_MINUTES_FOR_STREAK && !user!.isStreakUpdatedToday) {
      const streakResult = await db.update(userTable).set({
        streak: sql`${userTable.streak} + 1`,
        isStreakUpdatedToday: true,
      }).where(eq(userTable.discordId, discordId)).returning({
        streak: userTable.streak,
      });

      if (streakResult.length === 0) {
        console.error(`Failed to update streak for ${username}, no user found`);
        return;
      }
    }

    // Calculate and award points for this session
    const oldDailyVoiceTime = user!.dailyVoiceTime - duration;
    const newDailyVoiceTime = user!.dailyVoiceTime;
    const ONE_HOUR = 60 * 60;
    const FIVE_MINUTES = 5 * 60;

    let pointsEarned = 0;
    if (oldDailyVoiceTime + FIVE_MINUTES < ONE_HOUR && newDailyVoiceTime + FIVE_MINUTES >= ONE_HOUR) {
      // Crossed the 1-hour threshold
      pointsEarned += POINTS_FIRST_HOUR;
    }

    if (oldDailyVoiceTime + FIVE_MINUTES < ONE_HOUR * 2 && newDailyVoiceTime + FIVE_MINUTES >= ONE_HOUR * 2) {
      // Crossed the 2-hour threshold
      const hoursCapped = Math.min(Math.floor((newDailyVoiceTime + FIVE_MINUTES) / ONE_HOUR), MAX_HOURS_PER_DAY);

      // -1 because we already awarded points for the first hour
      pointsEarned += POINTS_REST_HOURS * (hoursCapped - 1);
    }

    console.log(
      `Voice session ended for ${username}: ${duration} seconds, awarded ${pointsEarned} points (oldDailyVoiceTime: ${oldDailyVoiceTime}, newDailyVoiceTime: ${newDailyVoiceTime})`
    );

    if (pointsEarned > 0) {
      // Award points to user
      await db.update(userTable).set({
        dailyPoints: sql`${userTable.dailyPoints} + ${pointsEarned}`,
        monthlyPoints: sql`${userTable.monthlyPoints} + ${pointsEarned}`,
        totalPoints: sql`${userTable.totalPoints} + ${pointsEarned}`,
      }).where(eq(userTable.discordId, discordId));
    }
  })
}

