import dayjs from "dayjs";
import { drizzle } from "drizzle-orm/node-postgres";

export const db = drizzle(process.env.DATABASE_URL!);

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

export {
  checkAndPerformHouseMonthlyReset,
  getUserHouse,
};
