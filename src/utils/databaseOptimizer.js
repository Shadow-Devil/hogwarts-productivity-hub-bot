/**
 * Database query optimizer and analyzer for identifying slow queries and bottlenecks
 */

const { pool } = require('../models/db');

class DatabaseOptimizer {
    constructor() {
        this.queryStats = new Map(); // Track query performance
        this.slowQueries = [];
        this.indexSuggestions = [];
    }

    // Analyze database performance and suggest optimizations
    async analyzePerformance() {
        const client = await pool.connect();
        const analysis = {
            connectionPool: await this.analyzeConnectionPool(),
            tableStats: await this.analyzeTableStats(client),
            indexUsage: await this.analyzeIndexUsage(client),
            slowQueries: await this.identifySlowQueries(client),
            suggestions: []
        };

        // Generate optimization suggestions
        analysis.suggestions = this.generateOptimizationSuggestions(analysis);
        
        client.release();
        return analysis;
    }

    // Analyze connection pool performance
    async analyzeConnectionPool() {
        return {
            totalConnections: pool.totalCount,
            idleConnections: pool.idleCount,
            waitingClients: pool.waitingCount,
            maxConnections: pool.options.max,
            connectionPoolUtilization: ((pool.totalCount - pool.idleCount) / pool.options.max * 100).toFixed(1)
        };
    }

    // Analyze table statistics
    async analyzeTableStats(client) {
        try {
            const tableStatsQuery = `
                SELECT 
                    schemaname,
                    tablename,
                    n_tup_ins as inserts,
                    n_tup_upd as updates,
                    n_tup_del as deletes,
                    n_live_tup as live_tuples,
                    n_dead_tup as dead_tuples,
                    CASE 
                        WHEN n_live_tup > 0 
                        THEN ROUND((n_dead_tup::numeric / n_live_tup::numeric) * 100, 2)
                        ELSE 0 
                    END as dead_tuple_ratio
                FROM pg_stat_user_tables 
                WHERE schemaname = 'public'
                ORDER BY n_live_tup DESC;
            `;

            const result = await client.query(tableStatsQuery);
            return result.rows;
        } catch (error) {
            console.error('Error analyzing table stats:', error);
            return [];
        }
    }

    // Analyze index usage
    async analyzeIndexUsage(client) {
        try {
            const indexUsageQuery = `
                SELECT 
                    schemaname,
                    tablename,
                    indexname,
                    idx_tup_read,
                    idx_tup_fetch,
                    CASE 
                        WHEN idx_tup_read > 0 
                        THEN ROUND((idx_tup_fetch::numeric / idx_tup_read::numeric) * 100, 2)
                        ELSE 0 
                    END as index_hit_ratio
                FROM pg_stat_user_indexes 
                WHERE schemaname = 'public'
                ORDER BY idx_tup_read DESC;
            `;

            const result = await client.query(indexUsageQuery);
            return result.rows;
        } catch (error) {
            console.error('Error analyzing index usage:', error);
            return [];
        }
    }

    // Identify potentially slow queries based on table scans
    async identifySlowQueries(client) {
        try {
            // Check for tables that might benefit from indexes
            const potentialSlowQueriesQuery = `
                SELECT 
                    schemaname,
                    tablename,
                    seq_scan,
                    seq_tup_read,
                    idx_scan,
                    idx_tup_fetch,
                    CASE 
                        WHEN seq_scan > 0 AND idx_scan > 0 
                        THEN ROUND((seq_scan::numeric / (seq_scan + idx_scan)::numeric) * 100, 2)
                        WHEN seq_scan > 0 AND idx_scan = 0 
                        THEN 100
                        ELSE 0 
                    END as sequential_scan_ratio,
                    CASE 
                        WHEN seq_scan > 0 
                        THEN ROUND(seq_tup_read::numeric / seq_scan::numeric, 2)
                        ELSE 0 
                    END as avg_tuples_per_seq_scan
                FROM pg_stat_user_tables 
                WHERE schemaname = 'public'
                AND seq_scan > 0
                ORDER BY seq_scan DESC;
            `;

            const result = await client.query(potentialSlowQueriesQuery);
            return result.rows;
        } catch (error) {
            console.error('Error identifying slow queries:', error);
            return [];
        }
    }

    // Generate optimization suggestions based on analysis
    generateOptimizationSuggestions(analysis) {
        const suggestions = [];

        // Connection pool suggestions
        const poolStats = analysis.connectionPool;
        if (parseFloat(poolStats.connectionPoolUtilization) > 80) {
            suggestions.push({
                type: 'connection_pool',
                priority: 'high',
                issue: 'High connection pool utilization',
                suggestion: `Consider increasing max connections from ${poolStats.maxConnections} to ${poolStats.maxConnections + 5}`,
                impact: 'Prevents connection exhaustion under high load'
            });
        }

        if (poolStats.waitingClients > 0) {
            suggestions.push({
                type: 'connection_pool',
                priority: 'critical',
                issue: 'Clients waiting for connections',
                suggestion: 'Immediately increase connection pool size or optimize query performance',
                impact: 'Eliminates connection bottlenecks'
            });
        }

        // Table optimization suggestions
        analysis.tableStats.forEach(table => {
            if (table.dead_tuple_ratio > 20) {
                suggestions.push({
                    type: 'maintenance',
                    priority: 'medium',
                    issue: `High dead tuple ratio in ${table.tablename}`,
                    suggestion: `Run VACUUM ANALYZE on ${table.tablename} table`,
                    impact: 'Improves query performance and reduces storage bloat'
                });
            }

            if (table.live_tuples > 10000 && table.tablename !== 'vc_sessions') {
                suggestions.push({
                    type: 'archiving',
                    priority: 'low',
                    issue: `Large table ${table.tablename} with ${table.live_tuples} rows`,
                    suggestion: 'Consider implementing data archiving strategy',
                    impact: 'Reduces table size and improves query performance'
                });
            }
        });

        // Index suggestions
        analysis.slowQueries.forEach(query => {
            if (query.sequential_scan_ratio > 50 && query.avg_tuples_per_seq_scan > 100) {
                suggestions.push({
                    type: 'indexing',
                    priority: 'high',
                    issue: `High sequential scan ratio on ${query.tablename}`,
                    suggestion: this.suggestIndexForTable(query.tablename),
                    impact: 'Significantly improves query performance'
                });
            }
        });

        // Bot-specific suggestions
        this.addBotSpecificSuggestions(suggestions, analysis);

        return suggestions.sort((a, b) => {
            const priorityOrder = { 'critical': 0, 'high': 1, 'medium': 2, 'low': 3 };
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        });
    }

    // Suggest specific indexes for bot tables
    suggestIndexForTable(tableName) {
        const indexSuggestions = {
            'users': 'CREATE INDEX CONCURRENTLY idx_users_last_vc_date ON users(last_vc_date) WHERE last_vc_date IS NOT NULL;',
            'vc_sessions': 'CREATE INDEX CONCURRENTLY idx_vc_sessions_user_date ON vc_sessions(discord_id, date);',
            'daily_voice_stats': 'CREATE INDEX CONCURRENTLY idx_daily_stats_date_user ON daily_voice_stats(date, discord_id);'
        };

        return indexSuggestions[tableName] || `Consider adding appropriate indexes for frequently queried columns in ${tableName}`;
    }

    // Add Discord bot specific optimization suggestions
    addBotSpecificSuggestions(suggestions, analysis) {
        // Check if we have voice tracking data
        const vcSessionsTable = analysis.tableStats.find(t => t.tablename === 'vc_sessions');
        if (vcSessionsTable && vcSessionsTable.live_tuples > 50000) {
            suggestions.push({
                type: 'data_retention',
                priority: 'medium',
                issue: 'Large vc_sessions table may impact performance',
                suggestion: 'Implement data retention policy - archive sessions older than 1 year',
                impact: 'Reduces query times and database size'
            });
        }

        // Suggest batch operations for stats updates
        suggestions.push({
            type: 'optimization',
            priority: 'low',
            issue: 'Individual daily stats updates',
            suggestion: 'Consider batching daily stats updates for better performance',
            impact: 'Reduces database load during high voice activity'
        });

        // Connection pooling optimization
        suggestions.push({
            type: 'configuration',
            priority: 'low',
            issue: 'Default connection pool settings',
            suggestion: 'Fine-tune pool settings based on bot usage patterns',
            impact: 'Optimizes resource usage and response times'
        });
    }

    // Create optimized queries for common operations
    getOptimizedQueries() {
        return {
            // Optimized user stats query with proper indexing
            getUserStatsOptimized: `
                WITH user_info AS (
                    SELECT id, discord_id, current_streak, longest_streak, last_vc_date
                    FROM users 
                    WHERE discord_id = $1
                ),
                today_stats AS (
                    SELECT total_minutes, session_count
                    FROM daily_voice_stats 
                    WHERE discord_id = $1 AND date = CURRENT_DATE
                ),
                monthly_stats AS (
                    SELECT SUM(total_minutes) as total_minutes, SUM(session_count) as session_count
                    FROM daily_voice_stats 
                    WHERE discord_id = $1 
                    AND date >= date_trunc('month', CURRENT_DATE)
                ),
                alltime_stats AS (
                    SELECT SUM(total_minutes) as total_minutes, SUM(session_count) as session_count
                    FROM daily_voice_stats 
                    WHERE discord_id = $1
                )
                SELECT 
                    ui.*,
                    COALESCE(ts.total_minutes, 0) as today_minutes,
                    COALESCE(ts.session_count, 0) as today_sessions,
                    COALESCE(ms.total_minutes, 0) as monthly_minutes,
                    COALESCE(ms.session_count, 0) as monthly_sessions,
                    COALESCE(ats.total_minutes, 0) as alltime_minutes,
                    COALESCE(ats.session_count, 0) as alltime_sessions
                FROM user_info ui
                LEFT JOIN today_stats ts ON TRUE
                LEFT JOIN monthly_stats ms ON TRUE  
                LEFT JOIN alltime_stats ats ON TRUE;
            `,

            // Optimized active session cleanup
            cleanupAbandonedSessions: `
                UPDATE vc_sessions 
                SET left_at = CURRENT_TIMESTAMP,
                    duration_minutes = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - joined_at)) / 60
                WHERE left_at IS NULL 
                AND joined_at < CURRENT_TIMESTAMP - INTERVAL '24 hours'
                RETURNING discord_id, voice_channel_name, duration_minutes;
            `
        };
    }
}

module.exports = new DatabaseOptimizer();
