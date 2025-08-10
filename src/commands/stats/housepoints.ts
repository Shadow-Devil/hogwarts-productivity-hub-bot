import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import * as voiceService from "../../services/voiceService.ts";
import {
  createHouseTemplate,
  createChampionTemplate,
  createErrorTemplate,
} from "../../utils/embedTemplates.ts";
import {
  safeDeferReply,
  safeErrorReply,
  fastMemberFetch,
} from "../../utils/interactionUtils.ts";
import { db, getUserHouse } from "../../db/db.ts";

export default {
  data: new SlashCommandBuilder()
    .setName("housepoints")
    .setDescription("View house point leaderboards and champions")
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("Choose leaderboard type")
        .setRequired(true)
        .addChoices(
          { name: "🏆 Monthly House Rankings", value: "monthly" },
          { name: "⭐ All Time House Rankings", value: "alltime" },
          { name: "👑 House Champions", value: "housechampion" }
        )
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      // Immediately defer to prevent timeout
      const deferred = await safeDeferReply(interaction);
      if (!deferred) {
        console.warn("Failed to defer housepoints interaction");
        return;
      }

      const leaderboardType = interaction.options.getString("type", true) as "monthly" | "alltime" | "housechampion";

      if (leaderboardType === "housechampion") {
        await showHouseChampions(interaction);
      } else {
        await showHouseLeaderboard(interaction, leaderboardType);
      }
    } catch (error) {
      console.error("Error in housepoints command:", error);

      const embed = createErrorTemplate(
        `❌ House Points Load Failed`,
        "An error occurred while fetching house leaderboard data. Please try again in a moment.",
        {
          helpText: `ℹ️ If this problem persists, contact support`,
        }
      );

      await safeErrorReply(interaction, embed);
    }
  },
};

async function showHouseLeaderboard(interaction: ChatInputCommandInteraction, type: "monthly" | "alltime") {
  const houseLeaderboard =
    await voiceService.getHouseLeaderboardOptimized(type);

  if (!houseLeaderboard || houseLeaderboard.length === 0) {
    const embed = createErrorTemplate(
      `ℹ️ No House Data`,
      "No house data is available yet. Houses need to earn points first!",
      {
        helpText:
          "Join a voice channel and complete tasks to start earning house points. House points are awarded for voice time and task completion.",
      }
    );
    return interaction.editReply({ embeds: [embed] });
  }

  // Get current user's house for personalization (optimized)
  const currentUserId = interaction.user.id;
  const userMember = await fastMemberFetch(
    interaction.guild,
    currentUserId,
    true
  );
  let userHouse = null;

  if (userMember) {
    userHouse = await getUserHouse(userMember);
  }

  const embed = createHouseTemplate(houseLeaderboard, type, {
    includeStats: true,
    useEnhancedLayout: true,
    useTableFormat: true,
    currentUser: userHouse ? { house: userHouse } : null,
  });

  await interaction.editReply({ embeds: [embed] });
}

async function showHouseChampions(interaction: ChatInputCommandInteraction) {
  // Check cache first, then fetch missing data
  const monthlyChampions = await getHouseChampions("monthly");
  const allTimeChampions = await getHouseChampions("alltime");

  // Always show the champion template, even if empty (to match house leaderboard behavior)

  // Get current user's house for personalization (optimized)
  const currentUserId = interaction.user.id;
  const userMember = await fastMemberFetch(
    interaction.guild,
    currentUserId,
    true
  );
  let userHouse = null;

  if (userMember) {
    userHouse = await getUserHouse(userMember);
  }

  const embed = createChampionTemplate(
    monthlyChampions,
    allTimeChampions,
    {
      house: userHouse,
    },
    {
      useEnhancedLayout: true,
      useTableFormat: true,
      showUserInfo: true,
    }
  );

  await interaction.editReply({ embeds: [embed] });
}

// Get house champions (top contributing user per house)
async function getHouseChampions(type = "monthly") {
  try {
    let query;

    if (type === "monthly") {
      query = `
                WITH ranked_users AS (
                    SELECT
                        u.username,
                        u.discord_id,
                        u.house,
                        u.monthly_points as points,
                        ROW_NUMBER() OVER (PARTITION BY u.house ORDER BY u.monthly_points DESC, u.username ASC) as rank
                    FROM users u
                    WHERE u.house IS NOT NULL AND u.monthly_points > 0
                )
                SELECT username, discord_id, house, points
                FROM ranked_users
                WHERE rank = 1
                ORDER BY points DESC, username ASC
            `;
    } else {
      query = `
        WITH ranked_users AS (
            SELECT
                u.username,
                u.discord_id,
                u.house,
                u.all_time_points as points,
                ROW_NUMBER() OVER (PARTITION BY u.house ORDER BY u.all_time_points DESC, u.username ASC) as rank
            FROM users u
            WHERE u.house IS NOT NULL AND u.all_time_points > 0
        )
        SELECT username, discord_id, house, points
        FROM ranked_users
        WHERE rank = 1
        ORDER BY points DESC, username ASC
    `;
    }

    const result = await db.$client.query(query);
    return result.rows;
  } catch (error) {
    console.error("Error getting house champions:", error);
    throw error;
  }
}
