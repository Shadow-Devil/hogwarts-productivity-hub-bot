import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import * as timezoneService from "../services/timezoneService.ts";
import { BotColors, StatusEmojis } from "../utils/constants.ts";
import { safeDeferReply, safeErrorReply } from "../utils/interactionUtils.ts";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import relativeTime from "dayjs/plugin/relativeTime.js";
import { db } from "../models/db.ts";
import { usersTable } from "../db/schema.ts";
import { eq } from "drizzle-orm";

// Extend dayjs with timezone and relative time support
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);

// Common timezone mappings for user convenience
const COMMON_TIMEZONES = [
  { name: "Eastern Time (US & Canada)", value: "America/New_York" },
  { name: "Central Time (US & Canada)", value: "America/Chicago" },
  { name: "Mountain Time (US & Canada)", value: "America/Denver" },
  { name: "Pacific Time (US & Canada)", value: "America/Los_Angeles" },
  { name: "Alaska Time", value: "America/Anchorage" },
  { name: "Hawaii Time", value: "Pacific/Honolulu" },
  { name: "Greenwich Mean Time", value: "GMT" },
  { name: "Central European Time", value: "Europe/Berlin" },
  { name: "Eastern European Time", value: "Europe/Athens" },
  { name: "British Summer Time", value: "Europe/London" },
  { name: "Japan Standard Time", value: "Asia/Tokyo" },
  { name: "China Standard Time", value: "Asia/Shanghai" },
  { name: "India Standard Time", value: "Asia/Kolkata" },
  { name: "Australian Eastern Time", value: "Australia/Sydney" },
  { name: "Australian Central Time", value: "Australia/Adelaide" },
  { name: "Australian Western Time", value: "Australia/Perth" },
];

/**
 * Evaluate streak preservation during timezone change
 * @param {string} userId - User's Discord ID
 * @param {string} oldTimezone - Previous timezone
 * @param {string} newTimezone - New timezone
 * @param {Date} changeTime - When the change occurred
 * @returns {Promise<string>} 'preserve' or 'reset'
 */
async function evaluateStreakDuringTimezoneChange(
  userId,
  oldTimezone,
  newTimezone,
  changeTime
) {
  try {
    const changeInOldTz = dayjs(changeTime).tz(oldTimezone);
    const changeInNewTz = dayjs(changeTime).tz(newTimezone);

    // Get user's last VC date
    const result = await db.$client.query(
      "SELECT last_vc_date FROM users WHERE discord_id = $1",
      [userId]
    );

    if (!result.rows[0]?.last_vc_date) {
      return "preserve"; // No existing streak to evaluate
    }

    const lastVcDate = dayjs(result.rows[0].last_vc_date);

    // If last VC was today in either timezone, preserve streak
    const isTodayInOldTz = changeInOldTz.isSame(lastVcDate, "day");
    const isTodayInNewTz = changeInNewTz.isSame(lastVcDate, "day");

    if (isTodayInOldTz || isTodayInNewTz) {
      return "preserve";
    }

    return "reset";
  } catch (error) {
    console.warn("Error evaluating streak preservation", {
      userId,
      error: error.message,
    });
    return "preserve"; // Be generous on errors
  }
}


/**
 * Handle timezone change for a user
 * @param {string} userId - User's Discord ID
 * @param {string} oldTimezone - Previous timezone
 * @param {string} newTimezone - New timezone
 * @returns {Promise<object>} Migration result
 */
async function handleTimezoneChange(userId: string, oldTimezone: string, newTimezone: string) {
  try {
    // Validate new timezone before proceeding
    if (!timezoneService.isValidTimezone(newTimezone)) {
      throw new Error(`Invalid timezone: ${newTimezone}`);
    }

    const now = new Date();

    // Update timezone in database
    const result = await db.update(usersTable).set({
      timezone: newTimezone,
    }).where(eq(usersTable.discord_id, userId));

    if (result.rowCount === 0) {
      throw new Error("User not found");
    }

    // Clear cache
    timezoneService.timezoneCache.delete(userId);

    // Check if we need to preserve streak
    const streakAction = await evaluateStreakDuringTimezoneChange(
      userId,
      oldTimezone,
      newTimezone,
      now
    );

    return {
      success: true,
      oldTimezone,
      newTimezone,
      streakAction,
      changeTime: now,
      resetTimesChanged: null,
      streakPreserved: null,
      dstAffected: null,
    };
  } catch (error) {
    // For validation errors, throw them directly
    if (error.message.includes("Invalid timezone")) {
      throw error;
    }

    console.warn("Fallback: Could not handle timezone change", {
      userId,
      oldTimezone,
      newTimezone,
      error: error.message,
    });
    return {
      success: false,
      error: "Timezone change failed",
    };
  }
}


async function handleViewTimezone(interaction, discordId) {
  try {
    const userTimezone = await timezoneService.getUserTimezone(discordId);
    const userLocalTime = dayjs()
      .tz(userTimezone)
      .format("dddd, MMMM D, YYYY [at] h:mm A");

    // Get next reset times
    const nextResets = {
      daily: await getNextResetDisplay(discordId, "daily"),
      monthly: await getNextResetDisplay(
        discordId,
        "monthly"
      ),
    };

    const embed = createTimezoneEmbed(
      userTimezone,
      userLocalTime,
      nextResets
    );
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("Error viewing timezone:", error);
    await safeErrorReply(
      interaction,
      "Failed to retrieve your timezone settings. Please try again."
    );
  }
}

async function handleSetTimezone(interaction, discordId, newTimezone) {
  try {
    // Validate timezone
    try {
      dayjs().tz(newTimezone);
    } catch (_error) {
      const embed = new EmbedBuilder()
        .setColor(BotColors.ERROR)
        .setTitle(`${StatusEmojis.ERROR} Invalid Timezone`)
        .setDescription(`The timezone \`${newTimezone}\` is not valid.`)
        .addFields({
          name: "💡 Tips",
          value: [
            "• Use `/timezone list` to see common options",
            "• Check [IANA timezone list](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)",
            "• Format: `Continent/City` (e.g., `America/New_York`)",
          ].join("\n"),
        });

      return interaction.editReply({ embeds: [embed] });
    }

    // Get current timezone for comparison
    const oldTimezone = await timezoneService.getUserTimezone(discordId);

    // Handle timezone change with impact analysis
    const changeResult = await handleTimezoneChange(
      discordId,
      oldTimezone,
      newTimezone
    );

    const userLocalTime = dayjs()
      .tz(newTimezone)
      .format("dddd, MMMM D, YYYY [at] h:mm A");

    // Create impact messages
    const impacts = [];
    if (changeResult.resetTimesChanged) {
      impacts.push("🔄 Your daily/monthly reset times have been adjusted");
    }
    if (changeResult.streakPreserved) {
      impacts.push("✅ Your streak has been preserved");
    }
    if (changeResult.dstAffected) {
      impacts.push(
        "🌅 DST transition detected - times adjusted automatically"
      );
    }

    const embed = createTimezoneChangeEmbed(
      oldTimezone,
      newTimezone,
      userLocalTime,
      impacts
    );
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("Error setting timezone:", error);
    await safeErrorReply(
      interaction,
      "Failed to update your timezone. Please try again."
    );
  }
}

async function handleListTimezones(interaction) {
  try {
    const embed = createTimezoneListEmbed();
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("Error listing timezones:", error);
    await safeErrorReply(
      interaction,
      "Failed to load timezone list. Please try again."
    );
  }
}

/**
 * Check if a date is a DST transition day
 * @param {string} timezone - IANA timezone identifier
 * @param {Date|string} date - Date to check
 * @returns {Promise<boolean>} True if DST transition day
 */
async function isDSTTransitionDay(timezone, date) {
  try {
    const checkDate = dayjs(date).tz(timezone);
    const dayBefore = checkDate.subtract(1, "day");
    const dayAfter = checkDate.add(1, "day");

    // Check if UTC offset changes, indicating DST transition
    const offsetBefore = dayBefore.utcOffset();
    const offsetCurrent = checkDate.utcOffset();
    const offsetAfter = dayAfter.utcOffset();

    return offsetBefore !== offsetCurrent || offsetCurrent !== offsetAfter;
  } catch (error) {
    console.warn("Error checking DST transition", {
      timezone,
      date,
      error: error.message,
    });
    return false;
  }
}

/**
 * Get next reset time for a user (daily or monthly)
 * @param {string} userId - User's Discord ID
 * @param {string} resetType - 'daily' or 'monthly'
 * @returns {Promise<dayjs.Dayjs>} Next reset time in UTC
 */
async function getNextResetTimeForUser(userId, resetType = "daily") {
  const userTimezone = await timezoneService.getUserTimezone(userId);
  const userTime = dayjs().tz(userTimezone);

  let nextReset;
  if (resetType === "daily") {
    nextReset = userTime.add(1, "day").startOf("day");

    // Handle DST transitions by checking if we need to adjust
    if (await isDSTTransitionDay(userTimezone, nextReset)) {
      // Schedule at 3 AM to avoid 2 AM DST issues
      nextReset = nextReset.hour(3);
    }
  } else if (resetType === "monthly") {
    nextReset = userTime.add(1, "month").startOf("month");

    // Handle month-end edge cases (Feb 29, etc.)
    if (userTime.month() === 1 && userTime.date() === 29) {
      nextReset = nextReset.date(1); // Always use 1st of month
    }
  }

  return nextReset.utc(); // Return in UTC for scheduling
}

async function getNextResetDisplay(discordId: string, resetType: string) {
  try {
    const nextResetTime = await getNextResetTimeForUser(
      discordId,
      resetType
    );
    const userTimezone = await timezoneService.getUserTimezone(discordId);

    const localTime = dayjs(nextResetTime).tz(userTimezone);

    const relativeTime = localTime.fromNow();
    const exactTime = localTime.format("MMM D [at] h:mm A");

    return `${exactTime} (${relativeTime})`;
  } catch (error) {
    console.error(`Error getting next ${resetType} reset:`, error);
    return "Unable to calculate";
  }
}

function createTimezoneEmbed(userTimezone, userLocalTime, nextResets) {
  const embed = new EmbedBuilder()
    .setColor(BotColors.SUCCESS)
    .setTitle(`${StatusEmojis.CLOCK} Your Timezone Settings`)
    .addFields(
      {
        name: "🌍 Current Timezone",
        value: `\`${userTimezone}\``,
        inline: true,
      },
      {
        name: "🕐 Your Local Time",
        value: `${userLocalTime}`,
        inline: true,
      },
      {
        name: "\u200B",
        value: "\u200B",
        inline: true,
      }
    );

  if (nextResets) {
    embed.addFields(
      {
        name: "📅 Next Daily Reset",
        value: nextResets.daily,
        inline: true,
      },
      {
        name: "🗓️ Next Monthly Reset",
        value: nextResets.monthly,
        inline: true,
      }
    );
  }

  embed.setFooter({
    text: "Use /timezone set <timezone> to change your timezone • /timezone list to see common timezones",
  });

  return embed;
}

function createTimezoneListEmbed() {
  const embed = new EmbedBuilder()
    .setColor(BotColors.INFO)
    .setTitle(`${StatusEmojis.INFO} Common Timezones`)
    .setDescription(
      "Here are some commonly used timezones. You can use any valid IANA timezone identifier."
    );

  // Group timezones for better readability
  const groups = {
    "🇺🇸 United States": COMMON_TIMEZONES.slice(0, 6),
    "🌍 Europe & GMT": COMMON_TIMEZONES.slice(6, 10),
    "🌏 Asia & Pacific": COMMON_TIMEZONES.slice(10),
  };

  Object.entries(groups).forEach(([groupName, timezones]) => {
    const timezoneList = timezones
      .map((tz) => `• **${tz.name}**: \`${tz.value}\``)
      .join("\n");
    embed.addFields({
      name: groupName,
      value: timezoneList,
      inline: false,
    });
  });

  embed.addFields({
    name: "💡 Need a different timezone?",
    value:
      "You can use any [IANA timezone identifier](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones). For example: `Europe/Paris`, `Asia/Tokyo`, `America/Sao_Paulo`",
    inline: false,
  });

  embed.setFooter({
    text: "Use /timezone set <timezone> to set your timezone",
  });

  return embed;
}

function createTimezoneChangeEmbed(
  oldTimezone,
  newTimezone,
  userLocalTime,
  impacts
) {
  const embed = new EmbedBuilder()
    .setColor(BotColors.SUCCESS)
    .setTitle(`${StatusEmojis.SUCCESS} Timezone Updated Successfully`)
    .addFields(
      {
        name: "🔄 Change Summary",
        value: `**From:** \`${oldTimezone}\`\n**To:** \`${newTimezone}\``,
        inline: false,
      },
      {
        name: "🕐 Your New Local Time",
        value: userLocalTime,
        inline: true,
      }
    );

  if (impacts && impacts.length > 0) {
    embed.addFields({
      name: "⚠️ Important Changes",
      value: impacts.join("\n"),
      inline: false,
    });
  }

  embed.addFields({
    name: "✅ What This Affects",
    value: [
      "• Daily reset times (streaks, voice limits)",
      "• Monthly leaderboard resets",
      "• Task deadline calculations",
      "• All time-based statistics",
    ].join("\n"),
    inline: false,
  });

  embed.setFooter({
    text: "Your stats and streaks have been preserved during this timezone change",
  });

  return embed;
}

const timezoneCommand = {
  data: new SlashCommandBuilder()
    .setName("timezone")
    .setDescription(
      "Manage your timezone settings for accurate daily/monthly resets"
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("view")
        .setDescription("View your current timezone settings")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set")
        .setDescription("Set your timezone")
        .addStringOption((option) =>
          option
            .setName("timezone")
            .setDescription(
              "Your timezone (e.g., America/New_York, Europe/London)"
            )
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("View common timezone options")
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    try {
      // Immediately defer to prevent timeout
      const deferred = await safeDeferReply(interaction);
      if (!deferred) {
        console.warn("Failed to defer timezone interaction");
        return;
      }

      const subcommand = interaction.options.getSubcommand();
      const discordId = interaction.user.id;

      switch (subcommand) {
        case "view":
          await handleViewTimezone(interaction, discordId);
          break;
        case "set": {
          await handleSetTimezone(
            interaction,
            discordId,
            interaction.options.getString("timezone")
          );
          break;
        }
        case "list":
          await handleListTimezones(interaction);
          break;
        default:
          await safeErrorReply(interaction, "Unknown subcommand");
      }
    } catch (error) {
      console.error("Error in timezone command:", error);
      await safeErrorReply(
        interaction,
        "An error occurred while processing your timezone request. Please try again."
      );
    }
  },
};

export default timezoneCommand;
