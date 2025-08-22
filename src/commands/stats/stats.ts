import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction, time, TimestampStyles } from "discord.js";
import dayjs from "dayjs";
import { BotColors, MAX_HOURS_PER_DAY } from "../../utils/constants.ts";
import { db } from "../../db/db.ts";
import { taskTable, userTable } from "../../db/schema.ts";
import { and, eq, gt } from "drizzle-orm";
import assert from "node:assert";



/**
 * Generate daily limit status text for display
 * @param {Object} limitInfo - Daily limit info from calculateDailyLimitInfo
 * @returns {string} Formatted status text
 */
function formatDailyLimitStatus(dailyVoiceTime: number, timezone: string): string {
    if (dailyVoiceTime / 3600 >= MAX_HOURS_PER_DAY) {
        return "🚫 **Limit Reached**";
    }

    return `⏰ **${dayjs().tz(timezone).endOf('day').diff(dayjs().tz(timezone), 'hour')}h** until reset (resets at midnight)`;
}


export default {
    data: new SlashCommandBuilder()
        .setName("stats")
        .setDescription("View your productivity statistics"),
    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply();

        const discordId = interaction.user.id;
        const [userStats] = await db.select().from(userTable).where(eq(userTable.discordId, discordId));
        assert(userStats !== undefined, "User stats not found in database");

        // Fetch user tasks with error handling
        const startOfDay = dayjs().tz(userStats.timezone).startOf('day').toDate();
        const userTasks = await db.select()
            .from(taskTable)
            .where(and(eq(taskTable.discordId, discordId), gt(taskTable.createdAt, startOfDay)));

        // 5. Pending Tasks (show actual tasks, not just count)
        const pendingTasks = userTasks.filter((task) => !task.isCompleted);
        let pendingTasksValue;

        if (userTasks.length === 0) {
            pendingTasksValue = "🎯 **No tasks yet**";
        } else if (pendingTasks.length === 0) {
            pendingTasksValue = "🎉 **All caught up!**";
        } else {
            // Show all tasks if 3 or fewer
            const taskList = pendingTasks.slice(0, 3)
                .map((task, index) =>
                    `${index + 1}. ${task.title.length > 35 ? task.title.substring(0, 32) + "..." : task.title}`
                )
                .join("\n");
            pendingTasksValue = `**${pendingTasks.length}** tasks:\n${taskList}`;
            if (pendingTasks.length > 3) {
                pendingTasksValue += `\n*...and ${pendingTasks.length - 3} more*`;
            }
        }

        // Personalized greeting based on streak
        let greeting = "";
        if (userStats.streak >= 7) {
            greeting = `🔥 Hey ${userStats.username}! You're on a ${userStats.streak}-day streak!`;
        } else if (userStats.streak > 0) {
            greeting = `💪 Great work ${userStats.username}! ${userStats.streak} days and counting!`;
        } else {
            greeting = `👋 Hi ${userStats.username}! Ready to start your productivity journey?`;
        }


        const userLocalTime = dayjs().tz(userStats.timezone);
        const nextMidnight = dayjs().tz(userStats.timezone).add(1, "day").startOf("day");
        const hoursUntilReset = nextMidnight.diff(userLocalTime, "hour");

        await interaction.editReply({
            embeds: [(new EmbedBuilder({
                title: "📊 Your Stats",
                color: BotColors.PRIMARY,
                description: greeting,
                fields: [
                    // 1. Streak Information
                    {
                        name: "🔥 Current Streak",
                        value: `**${userStats.streak}** days`,
                        inline: true,
                    },
                    // 2. Voice Channel Hours (today, this month, all-time)
                    {
                        name: "🎧 Voice Hours",
                        value: [
                            `**Today:** ${time(userStats.dailyVoiceTime, TimestampStyles.ShortTime)}`,
                            `**This Month:** ${time(userStats.monthlyVoiceTime, TimestampStyles.ShortTime)}`,
                            `**All-Time:** ${time(userStats.totalVoiceTime, TimestampStyles.ShortTime)}`,
                        ].join("\n"),
                        inline: true,
                    },
                    {
                        name: "⏳ Daily Limit (15h)",
                        value: formatDailyLimitStatus(userStats.dailyVoiceTime, userStats.timezone),
                        inline: true,
                    },
                    // 4. Points Breakdown (today, this month, all-time)
                    {
                        name: "💰 Points Earned",
                        value: [
                            `**Today:** ${userStats.dailyPoints} pts`,
                            `**This Month:** ${userStats.monthlyPoints} pts`,
                            `**All-Time:** ${userStats.totalPoints} pts`,
                        ].join("\n"),
                        inline: true,
                    },
                    {
                        name: "📋 Pending Tasks",
                        value: pendingTasksValue,
                        inline: true,
                    },
                    // Add a simple spacer field to balance the layout
                    {
                        name: "\u200b",
                        value: "\u200b",
                        inline: true,
                    },
                ],
                // Add timezone context to footer for user awareness
                footer: {
                text: `🌍 Your timezone: ${userStats.timezone} | Local time: ${userLocalTime.format("h:mm A")} | Daily reset in ${hoursUntilReset}h`,
                }
            }).setThumbnail(interaction.user.displayAvatarURL()))]
        });
    },
};
