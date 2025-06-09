#!/bin/bash

echo "🗑️  Removing Database Optimizations"
echo "===================================="

echo ""
echo "🔍 Phase 1: Removing Advanced Performance Indexes"

# Remove covering index
echo "  🗑️  Removing idx_users_discord_id_covering..."
sudo -u postgres psql -d discord_bot -c "DROP INDEX IF EXISTS idx_users_discord_id_covering;" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "  ✓ Removed idx_users_discord_id_covering"
else
    echo "  ❌ Failed to remove idx_users_discord_id_covering"
fi

# Remove BRIN index
echo "  🗑️  Removing idx_vc_sessions_joined_brin..."
sudo -u postgres psql -d discord_bot -c "DROP INDEX IF EXISTS idx_vc_sessions_joined_brin;" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "  ✓ Removed idx_vc_sessions_joined_brin"
else
    echo "  ❌ Failed to remove idx_vc_sessions_joined_brin"
fi

# Remove any other optimization indexes that might have been created
echo "  🗑️  Removing other optimization indexes..."
for index in idx_users_house_points idx_users_monthly_points idx_vc_sessions_date_user idx_tasks_user_status idx_users_streak_composite; do
    sudo -u postgres psql -d discord_bot -c "DROP INDEX IF EXISTS $index;" > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo "  ✓ Removed $index (if existed)"
    fi
done

echo ""
echo "📊 Phase 2: Removing Performance Views"

# Remove connection stats view
echo "  🗑️  Removing v_connection_stats..."
sudo -u postgres psql -d discord_bot -c "DROP VIEW IF EXISTS v_connection_stats;" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "  ✓ Removed v_connection_stats"
else
    echo "  ❌ Failed to remove v_connection_stats"
fi

# Remove other performance views that might have been created
echo "  🗑️  Removing other performance views..."
for view in v_table_sizes v_query_performance v_index_usage v_slow_queries; do
    sudo -u postgres psql -d discord_bot -c "DROP VIEW IF EXISTS $view;" > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo "  ✓ Removed $view (if existed)"
    fi
done

echo ""
echo "🔄 Phase 3: Removing Materialized Views and Functions"

# Remove materialized views
echo "  🗑️  Removing materialized views..."
for matview in house_leaderboard_current daily_activity_summary user_performance_summary daily_user_stats house_leaderboard_snapshot task_completion_trends; do
    sudo -u postgres psql -d discord_bot -c "DROP MATERIALIZED VIEW IF EXISTS $matview;" > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo "  ✓ Removed $matview (if existed)"
    fi
done

# Remove refresh function
echo "  🗑️  Removing refresh_materialized_views function..."
sudo -u postgres psql -d discord_bot -c "DROP FUNCTION IF EXISTS refresh_materialized_views();" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "  ✓ Removed refresh_materialized_views function"
else
    echo "  ❌ Failed to remove refresh_materialized_views function"
fi

# Remove any auto-partition functions
echo "  🗑️  Removing auto-partition functions..."
for func in create_monthly_partition auto_create_partitions; do
    sudo -u postgres psql -d discord_bot -c "DROP FUNCTION IF EXISTS $func();" > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo "  ✓ Removed $func (if existed)"
    fi
done

echo ""
echo "🧹 Phase 4: Removing Custom Types and Tables"

# Remove any optimization-specific tables
echo "  🗑️  Removing optimization tables..."
for table in materialized_view_refresh_log system_config performance_metrics; do
    sudo -u postgres psql -d discord_bot -c "DROP TABLE IF EXISTS $table;" > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo "  ✓ Removed $table (if existed)"
    fi
done

# Remove custom enum types that were added for optimization
echo "  🗑️  Removing custom optimization types..."
for type in house_enum user_status_enum task_category_enum task_priority_enum session_type_enum; do
    sudo -u postgres psql -d discord_bot -c "DROP TYPE IF EXISTS $type;" > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo "  ✓ Removed $type (if existed)"
    fi
done

echo ""
echo "📋 CLEANUP REPORT"
echo "=================="

# Get current table list
echo ""
echo "📊 Remaining Tables:"
sudo -u postgres psql -d discord_bot -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;" -t | while read line; do
    if [ ! -z "$line" ]; then
        echo "  • $(echo $line | xargs)"
    fi
done

# Get remaining index count
echo ""
echo "🔍 Remaining Indexes:"
INDEX_COUNT=$(sudo -u postgres psql -d discord_bot -c "SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public';" -t | tr -d ' ')
echo "  Total Indexes: $INDEX_COUNT"

# List remaining custom indexes (non-standard ones)
echo ""
echo "📝 Custom Indexes Still Present:"
sudo -u postgres psql -d discord_bot -c "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE 'idx_%' ORDER BY indexname;" -t | while read line; do
    if [ ! -z "$line" ]; then
        echo "  • $(echo $line | xargs)"
    fi
done

echo ""
echo "✅ Database optimization cleanup completed!"
echo ""
echo "📝 Summary:"
echo "• Removed industry-standard performance indexes"
echo "• Removed advanced materialized views and refresh functions"
echo "• Removed performance monitoring views"
echo "• Removed optimization-specific tables and types"
echo "• Database restored to basic operational state"
echo ""
echo "💡 The database now contains only the essential indexes needed for basic bot functionality."
