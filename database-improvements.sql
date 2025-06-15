-- Database Improvements: Views and Optimized Queries
-- Recommended enhancements for better performance and maintainability

-- =============================================================================
-- 1. MATERIALIZED VIEWS FOR COMPLEX AGGREGATIONS
-- =============================================================================

-- User Statistics Summary View (Replaces multiple queries in getUserStats)
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
) dvs_month ON u.discord_id = dvs_month.discord_id;

-- Create unique index for fast lookups
CREATE UNIQUE INDEX idx_user_stats_summary_discord_id ON user_stats_summary(discord_id);

-- Refresh function (call periodically - every 5 minutes)
-- REFRESH MATERIALIZED VIEW CONCURRENTLY user_stats_summary;

-- =============================================================================
-- 2. LEADERBOARD VIEWS (Replaces complex leaderboard queries)
-- =============================================================================

-- Monthly Leaderboard View
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
LIMIT 50;

-- All-Time Leaderboard View
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
LIMIT 50;

-- =============================================================================
-- 3. HOUSE ANALYTICS VIEWS
-- =============================================================================

-- House Leaderboard with Champions
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
ORDER BY h.monthly_points DESC;

-- =============================================================================
-- 4. TASK ANALYTICS VIEWS
-- =============================================================================

-- User Task Summary View
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
GROUP BY u.discord_id, u.username;

-- =============================================================================
-- 5. SESSION ANALYTICS VIEWS
-- =============================================================================

-- Active Voice Sessions View (Replaces complex active session queries)
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
ORDER BY vs.joined_at DESC;

-- Daily Voice Activity Summary
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
ORDER BY date DESC;

-- =============================================================================
-- 6. PERFORMANCE-OPTIMIZED QUERIES (Replace existing complex queries)
-- =============================================================================

-- Fast User Lookup with All Stats (Single Query Replacement)
-- Use this instead of multiple queries in getUserStats()
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
) active_sessions ON u.discord_id = active_sessions.discord_id;

-- =============================================================================
-- 7. INDEXES FOR VIEW OPTIMIZATION
-- =============================================================================

-- Composite indexes for better join performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_voice_stats_composite
ON daily_voice_stats(discord_id, date DESC) INCLUDE (total_minutes, session_count, points_earned);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_leaderboard
ON users(monthly_hours DESC, monthly_points DESC) WHERE monthly_hours > 0;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_alltime_leaderboard
ON users((all_time_hours + monthly_hours) DESC, (all_time_points + monthly_points) DESC)
WHERE (all_time_hours + monthly_hours) > 0;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_user_completion
ON tasks(discord_id, is_complete, completed_at DESC);

-- =============================================================================
-- 8. VIEW REFRESH STRATEGY (For Materialized Views)
-- =============================================================================

-- Function to refresh materialized views safely
CREATE OR REPLACE FUNCTION refresh_materialized_views()
RETURNS void AS $$
BEGIN
    -- Refresh user stats summary (most important)
    REFRESH MATERIALIZED VIEW CONCURRENTLY user_stats_summary;

    -- Add other materialized views here as needed
    RAISE NOTICE 'Materialized views refreshed successfully';
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Error refreshing materialized views: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 9. QUERY USAGE EXAMPLES
-- =============================================================================

/*
-- Replace complex getUserStats with single query:
SELECT * FROM user_complete_profile WHERE discord_id = $1;

-- Replace leaderboard queries:
SELECT * FROM monthly_leaderboard;
SELECT * FROM alltime_leaderboard;

-- Replace house analytics:
SELECT * FROM house_leaderboard_with_champions;

-- Replace task statistics:
SELECT * FROM user_task_summary WHERE discord_id = $1;

-- Replace active session checks:
SELECT * FROM active_voice_sessions WHERE discord_id = $1;

*/
