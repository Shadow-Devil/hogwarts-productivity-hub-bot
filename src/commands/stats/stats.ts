import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from "discord.js";
import dayjs from "dayjs";
import { BotColors, MAX_HOURS_PER_DAY } from "../../utils/constants.ts";
import { db } from "../../db/db.ts";
import { taskTable, userTable } from "../../db/schema.ts";
import { and, eq, gt } from "drizzle-orm";
import assert from "node:assert";


/**
 * Format hours for display (consistent formatting across the bot)
 * @param {number} seconds
 * @returns {string} Formatted hours (e.g., "2.5h")
 */
function formatHours(seconds: number): string {
    const hours = seconds / 3600;
    return `${Math.floor(hours)}h ${(Math.floor(hours % 60))}min`;
}


/**
 * Generate daily limit status text for display
 * @param {Object} limitInfo - Daily limit info from calculateDailyLimitInfo
 * @returns {string} Formatted status text
 */
function formatDailyLimitStatus(dailyVoiceTime: number, timezone: string): string {
    const hours = dailyVoiceTime / 3600;
    if (hours >= MAX_HOURS_PER_DAY) {
        return "🚫 **Limit Reached**";
    }

    const remainingHours = dayjs().tz(timezone).endOf('day').diff(dayjs().tz(timezone), 'hour');

    return `⏰ **${remainingHours}h** until reset (resets at midnight)`;
}


export default {
    data: new SlashCommandBuilder()
        .setName("stats")
        .setDescription("View your productivity statistics"),
    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply();

        const discordId = interaction.user.id;
        const userStats = await db.select().from(userTable).where(eq(userTable.discordId, discordId)).then((rows) => rows[0]);
        assert(userStats !== undefined, "User stats not found in database");

        // Fetch user tasks with error handling
        const startOfDay = dayjs().tz(userStats.timezone).startOf('day').toDate();
        const userTasks = await db.select().from(taskTable).where(and(eq(taskTable.discordId, discordId), gt(taskTable.createdAt, startOfDay)))

        const embed = new EmbedBuilder()
            .setTitle("📊 Your Stats")
            .setColor(BotColors.PRIMARY)
            .setThumbnail(interaction.user.displayAvatarURL());

        // Personalized greeting based on streak
        let greeting = "";
        if (userStats.streak >= 7) {
            greeting = `🔥 Hey ${userStats.username}! You're on a ${userStats.streak}-day streak!`;
        } else if (userStats.streak > 0) {
            greeting = `💪 Great work ${userStats.username}! ${userStats.streak} days and counting!`;
        } else {
            greeting = `👋 Hi ${userStats.username}! Ready to start your productivity journey?`;
        }

        embed.setDescription(greeting);

        // 1. Streak Information
        embed.addFields([
            {
                name: "🔥 Current Streak",
                value: `**${userStats.streak}** days`,
                inline: true,
            },
        ]);

        // 2. Voice Channel Hours (today, this month, all-time)
        const voiceHoursText = [
            `**Today:** ${formatHours(userStats.dailyVoiceTime)}`,
            `**This Month:** ${formatHours(userStats.monthlyVoiceTime)}`,
            `**All-Time:** ${formatHours(userStats.totalVoiceTime)}`,
        ].join("\n");

        embed.addFields([
            {
                name: "🎧 Voice Hours",
                value: voiceHoursText,
                inline: true,
            },
        ]);

        const limitStatus = formatDailyLimitStatus(userStats.dailyVoiceTime, userStats.timezone);

        embed.addFields([
            {
                name: "⏳ Daily Limit (15h)",
                value: limitStatus,
                inline: true,
            },
        ]);

        // 4. Points Breakdown (today, this month, all-time)
        const pointsText = [
            `**Today:** ${userStats.dailyPoints} pts`,
            `**This Month:** ${userStats.monthlyPoints} pts`,
            `**All-Time:** ${userStats.totalPoints} pts`,
        ].join("\n");

        embed.addFields([
            {
                name: "💰 Points Earned",
                value: pointsText,
                inline: true,
            },
        ]);

        // 5. Pending Tasks (show actual tasks, not just count)
        const pendingTasks = userTasks.filter((task) => !task.isCompleted);
        let pendingTasksValue;

        if (userTasks.length === 0) {
            pendingTasksValue = "🎯 **No tasks yet**";
        } else if (pendingTasks.length === 0) {
            pendingTasksValue = "🎉 **All caught up!**";
        } else {
            // Show all tasks if 3 or fewer
            const taskList = pendingTasks
                .slice(0, 3)
                .map(
                    (task, index) =>
                        `${index + 1}. ${task.title.length > 35 ? task.title.substring(0, 32) + "..." : task.title}`
                )
                .join("\n");
            pendingTasksValue = `**${pendingTasks.length}** tasks:\n${taskList}`;
            if (pendingTasks.length > 3) {
                pendingTasksValue += `\n*...and ${pendingTasks.length - 3} more*`;
            }
        }

        embed.addFields([
            {
                name: "📋 Pending Tasks",
                value: pendingTasksValue,
                inline: true,
            },
        ]);

        // Add a simple spacer field to balance the layout
        embed.addFields([
            {
                name: "\u200b",
                value: "\u200b",
                inline: true,
            },
        ]);

        // Add timezone context to footer for user awareness
        try {
            const userLocalTime = dayjs().tz(userStats.timezone);
            const nextMidnight = dayjs()
                .tz(userStats.timezone)
                .add(1, "day")
                .startOf("day");
            const hoursUntilReset = nextMidnight.diff(userLocalTime, "hour");

            embed.setFooter({
                text: `🌍 Your timezone: ${userStats.timezone} | Local time: ${userLocalTime.format("h:mm A")} | Daily reset in ${hoursUntilReset}h`,
            });
        } catch (error) {
            console.warn("Could not add timezone info to stats:", error);
            embed.setFooter({
                text: "⏰ Daily limit resets at midnight your local time",
            });
        }

        await interaction.editReply({ embeds: [embed] });
    },
};
