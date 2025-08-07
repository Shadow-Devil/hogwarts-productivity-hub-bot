import dayjs from "dayjs";
import { drizzle } from "drizzle-orm/node-postgres";

export const db = drizzle(process.env.DATABASE_URL!);

// Check and perform monthly reset for a user if needed
async function checkAndPerformMonthlyReset(discordId) {
  try {
    const firstOfMonth = dayjs().startOf("month").format("YYYY-MM-DD");

    // Get user data
    const userResult = await db.$client.query(
      "SELECT * FROM users WHERE discord_id = $1",
      [discordId]
    );

    if (userResult.rows.length === 0) return;

    const user = userResult.rows[0];
    const lastReset = user.last_monthly_reset
      ? dayjs(user.last_monthly_reset)
      : null;
    const currentMonth = dayjs().startOf("month");

    // Check if we need to perform monthly reset
    if (!lastReset || lastReset.isBefore(currentMonth)) {
      console.log(
        `🔄 Performing monthly reset for user ${discordId} (all-time stats now continuously updated)`
      );

      // Store the monthly summary before reset (for historical tracking)
      if (user.monthly_hours > 0 || user.monthly_points > 0) {
        const lastMonth = lastReset
          ? lastReset.format("YYYY-MM")
          : dayjs().subtract(1, "month").format("YYYY-MM");
        await db.$client.query(
          `
                    INSERT INTO monthly_voice_summary (user_id, discord_id, year_month, total_hours, total_points)
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (discord_id, year_month)
                    DO UPDATE SET
                        total_hours = $4,
                        total_points = $5,
                        updated_at = CURRENT_TIMESTAMP
                `,
          [
            user.id,
            discordId,
            lastMonth,
            user.monthly_hours,
            user.monthly_points,
          ]
        );
      }

      // Reset monthly stats only (all-time stats are continuously updated now)
      await db.$client.query(
        `
                UPDATE users SET
                    monthly_points = 0,
                    monthly_hours = 0,
                    last_monthly_reset = $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE discord_id = $2
            `,
        [firstOfMonth, discordId]
      );
      console.log(`✅ Monthly reset completed for ${discordId}`);
    }
  } catch (error) {
    console.error("Error performing monthly reset:", error);
    throw error;
  }
}

// Check and perform monthly reset for houses if needed
async function checkAndPerformHouseMonthlyReset() {
  try {
    const firstOfMonth = dayjs().startOf("month").format("YYYY-MM-DD");

    // Get houses data
    const housesResult = await db.$client.query("SELECT * FROM houses");

    for (const house of housesResult.rows) {
      const lastReset = house.last_monthly_reset
        ? dayjs(house.last_monthly_reset)
        : null;
      const currentMonth = dayjs().startOf("month");

      // Check if we need to perform monthly reset for this house
      if (!lastReset || lastReset.isBefore(currentMonth)) {
        console.log(
          `🏠 Performing monthly reset for house ${house.name} (all-time stats now continuously updated)`
        );

        // Store the monthly summary before reset (for historical tracking)
        if (house.monthly_points > 0) {
          const lastMonth = lastReset
            ? lastReset.format("YYYY-MM")
            : dayjs().subtract(1, "month").format("YYYY-MM");
          await db.$client.query(
            `
                        INSERT INTO house_monthly_summary (house_id, house_name, year_month, total_points)
                        VALUES ($1, $2, $3, $4)
                        ON CONFLICT (house_name, year_month)
                        DO UPDATE SET
                            total_points = $4,
                            updated_at = CURRENT_TIMESTAMP
                    `,
            [house.id, house.name, lastMonth, house.monthly_points]
          );
        }

        // Reset monthly stats only (all-time stats are continuously updated now)
        await db.$client.query(
          `
                    UPDATE houses SET
                        monthly_points = 0,
                        last_monthly_reset = $1,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $2
                `,
          [firstOfMonth, house.id]
        );

        console.log(`✅ Monthly reset completed for house ${house.name}`);
      }
    }
  } catch (error) {
    console.error("Error performing house monthly reset:", error);
    throw error;
  }
}

// Get user's house from their Discord roles using role IDs
async function getUserHouse(member) {
  if (!member || !member.roles) return null;

  // House role IDs mapping - more secure than role names
  const houseRoleIds = {
    [process.env.GRYFFINDOR_ROLE_ID]: "Gryffindor",
    [process.env.SLYTHERIN_ROLE_ID]: "Slytherin",
    [process.env.HUFFLEPUFF_ROLE_ID]: "Hufflepuff",
    [process.env.RAVENCLAW_ROLE_ID]: "Ravenclaw",
  };

  // Check if user has any house role by ID
  for (const [roleId, houseName] of Object.entries(houseRoleIds)) {
    if (roleId && member.roles.cache.has(roleId)) {
      return houseName;
    }
  }

  return null;
}

// Update house points when user earns points (with advisory locking)
async function updateHousePoints(houseName: string, pointsEarned: number) {
  if (!houseName || pointsEarned <= 0) return;
  // Check and perform monthly reset for houses if needed
  await checkAndPerformHouseMonthlyReset();

  // Update house points atomically (continuous all-time update system)
  const result = await db.$client.query(
    `
          UPDATE houses SET
              monthly_points = monthly_points + $1,
              all_time_points = all_time_points + $1,
              total_points = total_points + $1,
              updated_at = CURRENT_TIMESTAMP
          WHERE name = $2
          RETURNING monthly_points, all_time_points, total_points
      `,
    [pointsEarned, houseName]
  );

  if (result.rows.length === 0) {
    throw new Error(`House ${houseName} not found`);
  }

  console.log(
    `🏠 Added ${pointsEarned} points to ${houseName} (Monthly: ${result.rows[0].monthly_points}, All-time: ${result.rows[0].all_time_points}, Total: ${result.rows[0].total_points})`
  );
  return result.rows[0];
}

// Get house leaderboard
async function getHouseLeaderboard1(type = "monthly") {
  try {
    // Check and perform monthly reset for houses if needed
    await checkAndPerformHouseMonthlyReset();

    let query;

    if (type === "monthly") {
      query = `
                SELECT name, monthly_points as points
                FROM houses
                ORDER BY monthly_points DESC, name ASC
            `;
    } else {
      query = `
                SELECT name, all_time_points as points
                FROM houses
                ORDER BY all_time_points DESC, name ASC
            `;
    }

    const result = await db.$client.query(query);
    return result.rows;
  } catch (error) {
    console.error("Error getting house leaderboard:", error);
    throw error;
  }
}

// Get house champions (top contributing user per house)
async function getHouseChampions1(type = "monthly") {
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

export {
  checkAndPerformMonthlyReset,
  checkAndPerformHouseMonthlyReset,
  getUserHouse,
  updateHousePoints,
  getHouseLeaderboard1,
  getHouseChampions1,
};
