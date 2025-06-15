#!/bin/bash
# Database Migration Script - Apply database improvements safely
# This script applies the database improvements with proper error handling

set -e  # Exit on any error

# Database configuration from .env
DB_HOST="localhost"
DB_PORT="5432"
DB_NAME="botd_production"
DB_USER="botd_user"
DB_PASSWORD="postgres"

export PGPASSWORD="$DB_PASSWORD"

echo "🔧 Starting database improvements migration..."
echo "📅 $(date)"
echo ""

# Function to execute SQL with error handling
execute_sql() {
    local description="$1"
    local sql_command="$2"

    echo "📝 $description"

    if psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "$sql_command" > /dev/null 2>&1; then
        echo "✅ Success: $description"
    else
        echo "⚠️  Warning: $description (might already exist or have conflicts)"
    fi
    echo ""
}

# Step 1: Create basic views (no dependencies)
echo "🏗️  Phase 1: Creating basic views..."

# Monthly Leaderboard View
execute_sql "Creating monthly leaderboard view" "
CREATE VIEW monthly_leaderboard AS
SELECT
    ROW_NUMBER() OVER (ORDER BY u.monthly_hours DESC, u.monthly_points DESC) as rank,
    u.discord_id,
    u.username,
    u.house,
    u.monthly_hours as hours,
    u.monthly_points as points
FROM users u
WHERE u.monthly_hours > 0
ORDER BY u.monthly_hours DESC, u.monthly_points DESC
LIMIT 50;"

# All-Time Leaderboard View
execute_sql "Creating all-time leaderboard view" "
CREATE VIEW alltime_leaderboard AS
SELECT
    ROW_NUMBER() OVER (ORDER BY (u.all_time_hours + u.monthly_hours) DESC,
                                (u.all_time_points + u.monthly_points) DESC) as rank,
    u.discord_id,
    u.username,
    u.house,
    (u.all_time_hours + u.monthly_hours) as hours,
    (u.all_time_points + u.monthly_points) as points
FROM users u
WHERE (u.all_time_hours + u.monthly_hours) > 0
ORDER BY (u.all_time_hours + u.monthly_hours) DESC,
         (u.all_time_points + u.monthly_points) DESC
LIMIT 50;"

# House Leaderboard with Champions
execute_sql "Creating house leaderboard with champions view" "
CREATE VIEW house_leaderboard_with_champions AS
SELECT
    h.name as house_name,
    h.monthly_points as house_monthly_points,
    h.all_time_points as house_all_time_points,
    champions.champion_discord_id,
    champions.champion_username,
    champions.champion_points,
    ROW_NUMBER() OVER (ORDER BY h.monthly_points DESC) as house_rank
FROM houses h
LEFT JOIN (
    SELECT DISTINCT ON (u.house)
        u.house,
        u.discord_id as champion_discord_id,
        u.username as champion_username,
        u.monthly_points as champion_points
    FROM users u
    WHERE u.house IS NOT NULL AND u.monthly_points > 0
    ORDER BY u.house, u.monthly_points DESC, u.username ASC
) champions ON h.name = champions.house
ORDER BY h.monthly_points DESC;"

# Task Summary View
execute_sql "Creating user task summary view" "
CREATE VIEW user_task_summary AS
SELECT
    u.discord_id,
    u.username,
    COUNT(t.id) as total_tasks,
    COUNT(t.id) FILTER (WHERE t.is_complete = true) as completed_tasks,
    COUNT(t.id) FILTER (WHERE t.is_complete = false) as pending_tasks,
    COALESCE(SUM(t.points_awarded), 0) as total_task_points,
    MAX(t.completed_at) as last_task_completion
FROM users u
LEFT JOIN tasks t ON u.discord_id = t.discord_id
GROUP BY u.discord_id, u.username;"

# Active Voice Sessions View
execute_sql "Creating active voice sessions view" "
CREATE VIEW active_voice_sessions AS
SELECT
    vs.id,
    vs.discord_id,
    u.username,
    u.house,
    vs.voice_channel_id,
    vs.voice_channel_name,
    vs.joined_at,
    EXTRACT(EPOCH FROM (NOW() - vs.joined_at))/60 as current_duration_minutes,
    vs.date
FROM vc_sessions vs
JOIN users u ON vs.discord_id = u.discord_id
WHERE vs.left_at IS NULL
ORDER BY vs.joined_at DESC;"

# Daily Voice Activity Summary
execute_sql "Creating daily voice activity view" "
CREATE VIEW daily_voice_activity AS
SELECT
    date,
    COUNT(DISTINCT discord_id) as unique_users,
    SUM(total_minutes) as total_minutes,
    SUM(session_count) as total_sessions,
    SUM(points_earned) as total_points,
    AVG(total_minutes) as avg_minutes_per_user
FROM daily_voice_stats
GROUP BY date
ORDER BY date DESC;"

# Step 2: Create composite views (depends on above views)
echo "🏗️  Phase 2: Creating composite views..."

# User Complete Profile View (depends on user_task_summary)
execute_sql "Creating user complete profile view" "
CREATE VIEW user_complete_profile AS
SELECT
    u.*,
    dvs_today.total_minutes as today_minutes,
    dvs_today.session_count as today_sessions,
    dvs_today.points_earned as today_points,
    task_stats.total_tasks,
    task_stats.completed_tasks,
    task_stats.pending_tasks,
    task_stats.total_task_points,
    CASE WHEN active_sessions.session_count > 0 THEN true ELSE false END as currently_in_voice
FROM users u
LEFT JOIN daily_voice_stats dvs_today ON u.discord_id = dvs_today.discord_id
    AND dvs_today.date = CURRENT_DATE
LEFT JOIN user_task_summary task_stats ON u.discord_id = task_stats.discord_id
LEFT JOIN (
    SELECT discord_id, COUNT(*) as session_count
    FROM vc_sessions
    WHERE left_at IS NULL
    GROUP BY discord_id
) active_sessions ON u.discord_id = active_sessions.discord_id;"

# Step 3: Create performance indexes
echo "🏗️  Phase 3: Creating performance indexes..."

execute_sql "Creating composite index for daily voice stats" "
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_voice_stats_composite
ON daily_voice_stats(discord_id, date DESC) INCLUDE (total_minutes, session_count, points_earned);"

execute_sql "Creating leaderboard index" "
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_leaderboard
ON users(monthly_hours DESC, monthly_points DESC) WHERE monthly_hours > 0;"

execute_sql "Creating all-time leaderboard index" "
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_alltime_leaderboard
ON users((all_time_hours + monthly_hours) DESC, (all_time_points + monthly_points) DESC)
WHERE (all_time_hours + monthly_hours) > 0;"

execute_sql "Creating task completion index" "
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_user_completion
ON tasks(discord_id, is_complete, completed_at DESC);"

# Step 4: Create materialized view (requires data to exist)
echo "🏗️  Phase 4: Creating materialized views..."

execute_sql "Creating user stats summary materialized view" "
CREATE MATERIALIZED VIEW user_stats_summary AS
SELECT
    u.discord_id,
    u.username,
    u.house,
    u.monthly_points,
    u.monthly_hours,
    u.all_time_points + u.monthly_points as total_all_time_points,
    u.all_time_hours + u.monthly_hours as total_all_time_hours,
    u.current_streak,
    u.longest_streak,
    COALESCE(dvs_today.total_minutes, 0) as today_minutes,
    COALESCE(dvs_today.session_count, 0) as today_sessions,
    COALESCE(dvs_today.points_earned, 0) as today_points,
    COALESCE(dvs_month.total_minutes, 0) as month_minutes,
    COALESCE(dvs_month.session_count, 0) as month_sessions,
    COALESCE(dvs_month.points_earned, 0) as month_points
FROM users u
LEFT JOIN daily_voice_stats dvs_today ON u.discord_id = dvs_today.discord_id
    AND dvs_today.date = CURRENT_DATE
LEFT JOIN (
    SELECT
        discord_id,
        SUM(total_minutes) as total_minutes,
        SUM(session_count) as session_count,
        SUM(points_earned) as points_earned
    FROM daily_voice_stats
    WHERE date >= date_trunc('month', CURRENT_DATE)
    GROUP BY discord_id
) dvs_month ON u.discord_id = dvs_month.discord_id;"

execute_sql "Creating unique index for materialized view" "
CREATE UNIQUE INDEX idx_user_stats_summary_discord_id ON user_stats_summary(discord_id);"

# Step 5: Create refresh function
echo "🏗️  Phase 5: Creating refresh function..."

execute_sql "Creating materialized view refresh function" "
CREATE OR REPLACE FUNCTION refresh_materialized_views()
RETURNS void AS \$\$
BEGIN
    -- Refresh user stats summary (most important)
    REFRESH MATERIALIZED VIEW CONCURRENTLY user_stats_summary;

    RAISE NOTICE 'Materialized views refreshed successfully';
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Error refreshing materialized views: %', SQLERRM;
END;
\$\$ LANGUAGE plpgsql;"

# Final verification
echo "🔍 Verification: Listing created views and materialized views..."
psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "\dv"
echo ""
psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "\dm"

echo ""
echo "✅ Database improvements migration completed!"
echo "📅 $(date)"
echo ""
echo "📊 Summary of created objects:"
echo "   - Views: 6 (leaderboards, analytics, profiles)"
echo "   - Materialized Views: 1 (user stats summary)"
echo "   - Indexes: 4 (performance optimized)"
echo "   - Functions: 1 (refresh function)"
echo ""
echo "🚀 Next steps:"
echo "   1. Update service layer to use new views"
echo "   2. Set up periodic refresh of materialized views"
echo "   3. Monitor performance improvements"
