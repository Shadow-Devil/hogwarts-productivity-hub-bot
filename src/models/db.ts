import { Client, Pool } from "pg";
import dayjs from "dayjs";
import { config } from "dotenv";
config()

import { performanceMonitor } from "../utils/performanceMonitor.ts";
import databaseOptimizer from "../utils/databaseOptimizer.ts";
import DatabaseResilience from "../utils/databaseResilience.ts";

// Simple user cache for performance (replaced legacy functions)
const userCache = new Map();

// User cache functions
function getCachedUser(discordId) {
  const cached = userCache.get(discordId);
  if (!cached) return null;

  // Check if cache entry is expired (5 minutes)
  const now = Date.now();
  if (now - cached.timestamp > 5 * 60 * 1000) {
    userCache.delete(discordId);
    return null;
  }

  return cached.data;
}

function setCachedUser(discordId, userData) {
  userCache.set(discordId, {
    data: userData,
    timestamp: Date.now(),
  });
}

function clearUserCache(discordId) {
  if (discordId) {
    userCache.delete(discordId);
  } else {
    userCache.clear();
  }
}

const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "discord_bot",
  password: process.env.DB_PASSWORD || "postgres",
  port: Number(process.env.DB_PORT) || 5432,
  ssl: false,
  connectionTimeoutMillis: 10000, // Increased for high load
  idleTimeoutMillis: 30000,
  max: parseInt(process.env.DB_MAX_CONNECTIONS) || 50, // Scaled for 4000 members
  min: parseInt(process.env.DB_MIN_CONNECTIONS) || 5, // Higher minimum for better performance
  //acquireTimeoutMillis: 60000, // Timeout for acquiring connections
  //createTimeoutMillis: 30000,  // Timeout for creating connections
  //destroyTimeoutMillis: 5000,  // Timeout for destroying connections
  //reapIntervalMillis: 1000,    // Cleanup interval
  //createRetryIntervalMillis: 200 // Retry interval for connection creation
});

// Monitor connection pool
let connectionCount = 0;
pool.on("connect", (_client) => {
  connectionCount++;
  // Only log the first few connections to avoid spam
  if (connectionCount <= 3) {
    console.log(
      `✅ Connected to PostgreSQL database (${connectionCount}/${pool.options.max})`,
    );
  } else if (connectionCount === 4) {
    console.log(
      `✅ PostgreSQL connection pool active (${pool.options.min}-${pool.options.max} connections)`,
    );
  }
  performanceMonitor.updateActiveConnections(pool.totalCount);
});

pool.on("acquire", (_client) => {
  performanceMonitor.updateActiveConnections(pool.totalCount);
});

pool.on("release", (_client) => {
  performanceMonitor.updateActiveConnections(pool.totalCount);
});

pool.on("error", (err) => {
  console.error("❌ Database connection error:", err);
});

// Initialize database optimizer with pool (avoid circular dependency)
databaseOptimizer.setPool(pool);

// Initialize database resilience system
const dbResilience = new DatabaseResilience(pool);

// Database migrations for schema updates
async function runMigrations(client) {
  console.log("🔧 Running database migrations...");

  try {
    // Migration 1: Add new columns to users table for points system
    const columnsToAdd = [
      { name: "all_time_points", type: "INTEGER DEFAULT 0" },
      { name: "monthly_hours", type: "DECIMAL(10,2) DEFAULT 0" },
      { name: "all_time_hours", type: "DECIMAL(10,2) DEFAULT 0" },
      { name: "last_monthly_reset", type: "DATE DEFAULT CURRENT_DATE" },
    ];

    for (const column of columnsToAdd) {
      try {
        await client.query(`
                    ALTER TABLE users
                    ADD COLUMN IF NOT EXISTS ${column.name} ${column.type}
                `);
        console.log(`✅ Added column ${column.name} to users table`);
      } catch (error) {
        // Column might already exist, that's okay
        if (error.code !== "42701") {
          // duplicate_column error
          console.log(
            `ℹ️  Column ${column.name} already exists or other issue:`,
            error.message,
          );
        }
      }
    }

    // Migration 2: Add points_earned column to daily_voice_stats
    try {
      await client.query(`
                ALTER TABLE daily_voice_stats
                ADD COLUMN IF NOT EXISTS points_earned INTEGER DEFAULT 0
            `);
      console.log("✅ Added points_earned column to daily_voice_stats table");
    } catch (error) {
      if (error.code !== "42701") {
        console.log(
          "ℹ️  points_earned column already exists or other issue:",
          error.message,
        );
      }
    }

    // Migration 3: Add new columns to houses table for house points system
    const houseColumnsToAdd = [
      { name: "monthly_points", type: "INTEGER DEFAULT 0" },
      { name: "all_time_points", type: "INTEGER DEFAULT 0" },
      { name: "last_monthly_reset", type: "DATE DEFAULT CURRENT_DATE" },
      { name: "updated_at", type: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP" },
    ];

    for (const column of houseColumnsToAdd) {
      try {
        await client.query(`
                    ALTER TABLE houses
                    ADD COLUMN IF NOT EXISTS ${column.name} ${column.type}
                `);
        console.log(`✅ Added column ${column.name} to houses table`);
      } catch (error) {
        // Column might already exist, that's okay
        if (error.code !== "42701") {
          // duplicate_column error
          console.log(
            `ℹ️  Column ${column.name} already exists or other issue:`,
            error.message,
          );
        }
      }
    }

    // Migration 4: Add session recovery columns to vc_sessions table
    const sessionRecoveryColumns = [
      { name: "last_heartbeat", type: "TIMESTAMP" },
      { name: "current_duration_minutes", type: "INTEGER DEFAULT 0" },
      { name: "recovery_note", type: "TEXT" },
    ];

    for (const column of sessionRecoveryColumns) {
      try {
        await client.query(`
                    ALTER TABLE vc_sessions
                    ADD COLUMN IF NOT EXISTS ${column.name} ${column.type}
                `);
        console.log(
          `✅ Added column ${column.name} to vc_sessions table for session recovery`,
        );
      } catch (error) {
        // Column might already exist, that's okay
        if (error.code !== "42701") {
          // duplicate_column error
          console.log(
            `ℹ️  Column ${column.name} already exists or other issue:`,
            error.message,
          );
        }
      }
    }

    // Migration 4: Add points_awarded and completed_at columns to tasks table
    const taskColumnsToAdd = [
      { name: "points_awarded", type: "INTEGER DEFAULT 0" },
      { name: "completed_at", type: "TIMESTAMP" },
    ];

    for (const column of taskColumnsToAdd) {
      try {
        await client.query(`
                    ALTER TABLE tasks
                    ADD COLUMN IF NOT EXISTS ${column.name} ${column.type}
                `);
        console.log(`✅ Added column ${column.name} to tasks table`);
      } catch (error) {
        // Column might already exist, that's okay
        if (error.code !== "42701") {
          // duplicate_column error
          console.log(
            `ℹ️  Column ${column.name} already exists or other issue:`,
            error.message,
          );
        }
      }
    }

    // Migration 5: Create daily_task_stats table for task limits
    try {
      await client.query(`
                CREATE TABLE IF NOT EXISTS daily_task_stats (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    discord_id VARCHAR(255) NOT NULL,
                    date DATE NOT NULL,
                    tasks_added INTEGER DEFAULT 0,
                    tasks_completed INTEGER DEFAULT 0,
                    total_task_actions INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(discord_id, date)
                )
            `);
      console.log("✅ Created daily_task_stats table for daily task limits");

      // Create indexes
      await client.query(`
                CREATE INDEX IF NOT EXISTS idx_daily_task_stats_discord_id_date ON daily_task_stats(discord_id, date);
                CREATE INDEX IF NOT EXISTS idx_daily_task_stats_date ON daily_task_stats(date);
            `);
      console.log("✅ Created indexes for daily_task_stats table");
    } catch (error) {
      console.log(
        "ℹ️  daily_task_stats table already exists or other issue:",
        error.message,
      );
    }

    // Migration 6: Add timezone support columns to users table
    const timezoneColumnsToAdd = [
      { name: "timezone", type: "VARCHAR(50) DEFAULT 'UTC'" },
      { name: "timezone_set_at", type: "TIMESTAMP" },
      { name: "last_daily_reset_tz", type: "TIMESTAMP" },
      { name: "last_monthly_reset_tz", type: "TIMESTAMP" },
    ];

    for (const column of timezoneColumnsToAdd) {
      try {
        await client.query(`
                    ALTER TABLE users
                    ADD COLUMN IF NOT EXISTS ${column.name} ${column.type}
                `);
        console.log(`✅ Added timezone column ${column.name} to users table`);
      } catch (error) {
        // Column might already exist, that's okay
        if (error.code !== "42701") {
          // duplicate_column error
          console.log(
            `ℹ️  Timezone column ${column.name} already exists or other issue:`,
            error.message,
          );
        }
      }
    }

    // Migration 7: Create timezone-specific indexes for performance
    try {
      await client.query(`
                CREATE INDEX IF NOT EXISTS idx_users_timezone ON users(timezone);
                CREATE INDEX IF NOT EXISTS idx_users_daily_reset_tz ON users(last_daily_reset_tz);
                CREATE INDEX IF NOT EXISTS idx_users_timezone_daily ON users(timezone, last_daily_reset_tz);
                CREATE INDEX IF NOT EXISTS idx_users_timezone_monthly ON users(timezone, last_monthly_reset_tz);
            `);
      console.log("✅ Created timezone-specific indexes for users table");
    } catch (error) {
      console.log(
        "ℹ️  Timezone indexes already exist or other issue:",
        error.message,
      );
    }

    console.log("✅ Database migrations completed");
  } catch (error) {
    console.error("❌ Error running migrations:", error);
    // Don't throw, let the initialization continue
  }
}

// Initialize database tables
export async function initializeDatabase() {
  const client = await pool.connect();
  try {
    // First, run any necessary migrations
    await runMigrations(client);

    // Users table for basic user info and streaks
    await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                discord_id VARCHAR(255) UNIQUE NOT NULL,
                username VARCHAR(255) NOT NULL,
                house VARCHAR(50),
                total_points INTEGER DEFAULT 0,
                weekly_points INTEGER DEFAULT 0,
                monthly_points INTEGER DEFAULT 0,
                all_time_points INTEGER DEFAULT 0,
                monthly_hours DECIMAL(10,2) DEFAULT 0,
                all_time_hours DECIMAL(10,2) DEFAULT 0,
                current_streak INTEGER DEFAULT 0,
                longest_streak INTEGER DEFAULT 0,
                last_vc_date DATE,
                last_monthly_reset DATE DEFAULT CURRENT_DATE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

    // Create performance indexes
    await client.query(`
            CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id);
            CREATE INDEX IF NOT EXISTS idx_users_last_vc_date ON users(last_vc_date);
        `);

    // Voice channel sessions table for detailed tracking
    await client.query(`
            CREATE TABLE IF NOT EXISTS vc_sessions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                discord_id VARCHAR(255) NOT NULL,
                voice_channel_id VARCHAR(255) NOT NULL,
                voice_channel_name VARCHAR(255) NOT NULL,
                joined_at TIMESTAMP NOT NULL,
                left_at TIMESTAMP,
                duration_minutes INTEGER DEFAULT 0,
                date DATE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

    // Create performance indexes for vc_sessions
    await client.query(`
            CREATE INDEX IF NOT EXISTS idx_vc_sessions_discord_id ON vc_sessions(discord_id);
            CREATE INDEX IF NOT EXISTS idx_vc_sessions_date ON vc_sessions(date);
            CREATE INDEX IF NOT EXISTS idx_vc_sessions_user_id ON vc_sessions(user_id);
            CREATE INDEX IF NOT EXISTS idx_vc_sessions_active ON vc_sessions(discord_id, left_at) WHERE left_at IS NULL;
        `);

    // Daily voice stats for quick aggregation
    await client.query(`
            CREATE TABLE IF NOT EXISTS daily_voice_stats (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                discord_id VARCHAR(255) NOT NULL,
                date DATE NOT NULL,
                total_minutes INTEGER DEFAULT 0,
                session_count INTEGER DEFAULT 0,
                points_earned INTEGER DEFAULT 0,
                archived BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(discord_id, date)
            )
        `);

    // Add archived column if it doesn't exist (for existing databases)
    await client.query(`
            ALTER TABLE daily_voice_stats
            ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false
        `);

    // Monthly voice summary for tracking monthly totals
    await client.query(`
            CREATE TABLE IF NOT EXISTS monthly_voice_summary (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                discord_id VARCHAR(255) NOT NULL,
                year_month VARCHAR(7) NOT NULL, -- Format: YYYY-MM
                total_hours DECIMAL(10,2) DEFAULT 0,
                total_points INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(discord_id, year_month)
            )
        `);

    // Create performance indexes for daily_voice_stats
    await client.query(`
            CREATE INDEX IF NOT EXISTS idx_daily_voice_stats_discord_id_date ON daily_voice_stats(discord_id, date);
            CREATE INDEX IF NOT EXISTS idx_daily_voice_stats_date ON daily_voice_stats(date);
        `);

    // Create performance indexes for monthly_voice_summary
    await client.query(`
            CREATE INDEX IF NOT EXISTS idx_monthly_voice_summary_discord_id_year_month ON monthly_voice_summary(discord_id, year_month);
            CREATE INDEX IF NOT EXISTS idx_monthly_voice_summary_year_month ON monthly_voice_summary(year_month);
        `);

    // Tasks table for task management features
    await client.query(`
            CREATE TABLE IF NOT EXISTS tasks (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                discord_id VARCHAR(255) NOT NULL,
                title VARCHAR(500) NOT NULL,
                is_complete BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP,
                points_awarded INTEGER DEFAULT 0
            )
        `);

    // Create performance indexes for tasks
    await client.query(`
            CREATE INDEX IF NOT EXISTS idx_tasks_discord_id ON tasks(discord_id);
            CREATE INDEX IF NOT EXISTS idx_tasks_discord_id_complete ON tasks(discord_id, is_complete);
            CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
        `);

    // Houses table for leaderboards
    await client.query(`
            CREATE TABLE IF NOT EXISTS houses (
                id SERIAL PRIMARY KEY,
                name VARCHAR(50) UNIQUE NOT NULL,
                total_points INTEGER DEFAULT 0,
                monthly_points INTEGER DEFAULT 0,
                all_time_points INTEGER DEFAULT 0,
                last_monthly_reset DATE DEFAULT CURRENT_DATE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

    // House monthly summary for tracking monthly house totals
    await client.query(`
            CREATE TABLE IF NOT EXISTS house_monthly_summary (
                id SERIAL PRIMARY KEY,
                house_id INTEGER REFERENCES houses(id) ON DELETE CASCADE,
                house_name VARCHAR(50) NOT NULL,
                year_month VARCHAR(7) NOT NULL, -- Format: YYYY-MM
                total_points INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(house_name, year_month)
            )
        `);

    // Insert default houses if they don't exist
    await client.query(`
            INSERT INTO houses (name, total_points, monthly_points, all_time_points)
            VALUES
                ('Gryffindor', 0, 0, 0),
                ('Hufflepuff', 0, 0, 0),
                ('Ravenclaw', 0, 0, 0),
                ('Slytherin', 0, 0, 0)
            ON CONFLICT (name) DO NOTHING
        `);

    // Create performance indexes for house tables
    await client.query(`
            CREATE INDEX IF NOT EXISTS idx_house_monthly_summary_house_year_month ON house_monthly_summary(house_name, year_month);
            CREATE INDEX IF NOT EXISTS idx_house_monthly_summary_year_month ON house_monthly_summary(year_month);
        `);

    // Daily task stats table for tracking daily task limits (10 per day)
    await client.query(`
            CREATE TABLE IF NOT EXISTS daily_task_stats (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                discord_id VARCHAR(255) NOT NULL,
                date DATE NOT NULL,
                tasks_added INTEGER DEFAULT 0,
                tasks_completed INTEGER DEFAULT 0,
                total_task_actions INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(discord_id, date)
            )
        `);

    // Create performance indexes for daily_task_stats
    await client.query(`
            CREATE INDEX IF NOT EXISTS idx_daily_task_stats_discord_id_date ON daily_task_stats(discord_id, date);
            CREATE INDEX IF NOT EXISTS idx_daily_task_stats_date ON daily_task_stats(date);
        `);

    console.log("✅ Database tables initialized successfully");
  } catch (error) {
    console.error("❌ Error initializing database:", error);
    throw error;
  } finally {
    client.release();
  }
}

// Batch operation helpers for better performance
const batchOperationQueue = [];
const BATCH_SIZE = 10;
const BATCH_TIMEOUT = 1000; // 1 second

// Batch insert/update operations to reduce database load
function addToBatch(operation) {
  return new Promise((resolve, reject) => {
    batchOperationQueue.push({ operation, resolve, reject });

    if (batchOperationQueue.length >= BATCH_SIZE) {
      processBatch();
    }
  });
}

async function processBatch() {
  if (batchOperationQueue.length === 0) return;

  const currentBatch = batchOperationQueue.splice(0, BATCH_SIZE);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const { operation, resolve, reject } of currentBatch) {
      try {
        const result = await operation(client);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    currentBatch.forEach(({ reject }) => reject(error));
  } finally {
    client.release();
  }
}

// Process batch operations periodically
setInterval(processBatch, BATCH_TIMEOUT);

// Calculate points based on hours spent
// First hour daily: 5 points, subsequent hours: 2 points each (daily cumulative system)
// NOTE: Rounding is handled in the voice service, this function receives already-rounded hours
function calculatePointsForHours(startingHours, hoursToCalculate) {
  let points = 0;
  let remainingHours = hoursToCalculate;
  let currentTotal = startingHours;

  while (remainingHours > 0) {
    if (currentTotal < 1) {
      // First hour territory (5 points per hour)
      const firstHourPortion = Math.min(
        remainingHours,
        1 - Math.floor(currentTotal),
      );
      points += firstHourPortion * 5;
      remainingHours -= firstHourPortion;
      currentTotal += firstHourPortion;
    } else {
      // Subsequent hours territory (2 points per hour)
      points += remainingHours * 2;
      break;
    }
  }

  return points;
}

// Check and perform monthly reset for a user if needed
async function checkAndPerformMonthlyReset(discordId) {
  const client = await pool.connect();
  try {
    const firstOfMonth = dayjs().startOf("month").format("YYYY-MM-DD");

    // Get user data
    const userResult = await client.query(
      "SELECT * FROM users WHERE discord_id = $1",
      [discordId],
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
        `🔄 Performing monthly reset for user ${discordId} (all-time stats now continuously updated)`,
      );

      // Store the monthly summary before reset (for historical tracking)
      if (user.monthly_hours > 0 || user.monthly_points > 0) {
        const lastMonth = lastReset
          ? lastReset.format("YYYY-MM")
          : dayjs().subtract(1, "month").format("YYYY-MM");
        await client.query(
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
          ],
        );
      }

      // Reset monthly stats only (all-time stats are continuously updated now)
      await client.query(
        `
                UPDATE users SET
                    monthly_points = 0,
                    monthly_hours = 0,
                    last_monthly_reset = $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE discord_id = $2
            `,
        [firstOfMonth, discordId],
      );

      // Use smart cache invalidation for user data
      const queryCache = require("../utils/queryCache");
      queryCache.invalidateUserRelatedCache(discordId);

      console.log(`✅ Monthly reset completed for ${discordId}`);
    }
  } catch (error) {
    console.error("Error performing monthly reset:", error);
    throw error;
  } finally {
    client.release();
  }
}

// Check and perform monthly reset for houses if needed
async function checkAndPerformHouseMonthlyReset() {
  const client = await pool.connect();
  try {
    const firstOfMonth = dayjs().startOf("month").format("YYYY-MM-DD");

    // Get houses data
    const housesResult = await client.query("SELECT * FROM houses");

    for (const house of housesResult.rows) {
      const lastReset = house.last_monthly_reset
        ? dayjs(house.last_monthly_reset)
        : null;
      const currentMonth = dayjs().startOf("month");

      // Check if we need to perform monthly reset for this house
      if (!lastReset || lastReset.isBefore(currentMonth)) {
        console.log(
          `🏠 Performing monthly reset for house ${house.name} (all-time stats now continuously updated)`,
        );

        // Store the monthly summary before reset (for historical tracking)
        if (house.monthly_points > 0) {
          const lastMonth = lastReset
            ? lastReset.format("YYYY-MM")
            : dayjs().subtract(1, "month").format("YYYY-MM");
          await client.query(
            `
                        INSERT INTO house_monthly_summary (house_id, house_name, year_month, total_points)
                        VALUES ($1, $2, $3, $4)
                        ON CONFLICT (house_name, year_month)
                        DO UPDATE SET
                            total_points = $4,
                            updated_at = CURRENT_TIMESTAMP
                    `,
            [house.id, house.name, lastMonth, house.monthly_points],
          );
        }

        // Reset monthly stats only (all-time stats are continuously updated now)
        await client.query(
          `
                    UPDATE houses SET
                        monthly_points = 0,
                        last_monthly_reset = $1,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $2
                `,
          [firstOfMonth, house.id],
        );

        console.log(`✅ Monthly reset completed for house ${house.name}`);
      }
    }
  } catch (error) {
    console.error("Error performing house monthly reset:", error);
    throw error;
  } finally {
    client.release();
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
async function updateHousePoints(houseName, pointsEarned) {
  if (!houseName || pointsEarned <= 0) return;

  const lockId = generateLockId(`house_${houseName}`);

  return await withAdvisoryLock(lockId, async (client) => {
    // Check and perform monthly reset for houses if needed
    await checkAndPerformHouseMonthlyReset();

    // Update house points atomically (continuous all-time update system)
    const result = await client.query(
      `
            UPDATE houses SET
                monthly_points = monthly_points + $1,
                all_time_points = all_time_points + $1,
                total_points = total_points + $1,
                updated_at = CURRENT_TIMESTAMP
            WHERE name = $2
            RETURNING monthly_points, all_time_points, total_points
        `,
      [pointsEarned, houseName],
    );

    if (result.rows.length === 0) {
      throw new Error(`House ${houseName} not found`);
    }

    console.log(
      `🏠 Added ${pointsEarned} points to ${houseName} (Monthly: ${result.rows[0].monthly_points}, All-time: ${result.rows[0].all_time_points}, Total: ${result.rows[0].total_points})`,
    );
    return result.rows[0];
  });
}

// Get house leaderboard
async function getHouseLeaderboard(type = "monthly") {
  const client = await pool.connect();
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

    const result = await client.query(query);
    return result.rows;
  } catch (error) {
    console.error("Error getting house leaderboard:", error);
    throw error;
  } finally {
    client.release();
  }
}

// Get house champions (top contributing user per house)
async function getHouseChampions(type = "monthly") {
  const client = await pool.connect();
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

    const result = await client.query(query);
    return result.rows;
  } catch (error) {
    console.error("Error getting house champions:", error);
    throw error;
  } finally {
    client.release();
  }
}

// High-concurrency transaction helper for critical operations
async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// Advisory lock helper for preventing race conditions
async function withAdvisoryLock(lockId, callback) {
  const client = await pool.connect();
  try {
    // Acquire advisory lock (non-blocking)
    const lockResult = await client.query("SELECT pg_try_advisory_lock($1)", [
      lockId,
    ]);
    if (!lockResult.rows[0].pg_try_advisory_lock) {
      throw new Error(
        `Could not acquire lock ${lockId} - operation already in progress`,
      );
    }

    const result = await callback(client);

    // Release advisory lock
    await client.query("SELECT pg_advisory_unlock($1)", [lockId]);
    return result;
  } catch (error) {
    // Ensure lock is released even on error
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [lockId]);
    } catch (unlockError) {
      console.warn("Failed to release advisory lock:", unlockError);
    }
    throw error;
  } finally {
    client.release();
  }
}

// Hash function for generating consistent lock IDs
function generateLockId(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

// Export database resilience instance for health monitoring
export function getDbResilience() {
  return dbResilience;
}

export {
  pool,
  addToBatch,
  calculatePointsForHours,
  checkAndPerformMonthlyReset,
  checkAndPerformHouseMonthlyReset,
  getUserHouse,
  updateHousePoints,
  getHouseLeaderboard,
  getHouseChampions,
  withTransaction,
  withAdvisoryLock,
  generateLockId,
  getCachedUser,
  setCachedUser,
  clearUserCache,
};

export async function executeWithResilience<T>(
  callback: (client: Client) => Promise<T>,
  options = {},
): Promise<T> {
  return await dbResilience.executeWithResilience(callback, options);
}

// Enhanced query execution with optimization tracking
export async function executeCachedQuery(
  operation,
  query,
  params = [],
  cacheType = "default",
) {
  return await databaseOptimizer.executeTrackedQuery(
    operation,
    query,
    params,
    true,
    cacheType,
  );
}

// Batch operations using optimizer
export async function executeBatchQueries(operation, queries, batchSize = 50) {
  return await databaseOptimizer.executeBatchOperation(
    operation,
    queries,
    batchSize,
  );
}

// Get performance insights
export function getOptimizationReport() {
  return databaseOptimizer.getPerformanceReport();
}
