#!/usr/bin/env node

/**
 * Database optimization and analysis script for Discord Productivity Bot
 * This script analyzes current database performance and applies targeted optimizations
 */

const { pool } = require('./src/models/db');
const databaseOptimizer = require('./src/utils/databaseOptimizer');
const queryCache = require('./src/utils/queryCache');
const { performanceMonitor } = require('./src/utils/performanceMonitor');

class DatabaseOptimizationScript {
    constructor() {
        this.results = {
            analysis: {},
            optimizations: [],
            recommendations: [],
            errors: []
        };
    }

    async run(options = {}) {
        console.log('🚀 Starting Database Optimization Analysis...\n');

        try {
            // 1. Connection Pool Analysis
            console.log('📊 Analyzing connection pool...');
            await this.analyzeConnectionPool();

            // 2. Query Performance Analysis
            console.log('🔍 Analyzing query performance...');
            await this.analyzeQueryPerformance();

            // 3. Cache Analysis
            console.log('💾 Analyzing cache performance...');
            await this.analyzeCachePerformance();

            // 4. Database Statistics
            console.log('📈 Gathering database statistics...');
            await this.gatherDatabaseStats();

            // 5. Apply optimizations if requested
            if (options.applyOptimizations) {
                console.log('🔧 Applying database optimizations...');
                await this.applyOptimizations(options);
            }

            // 6. Generate recommendations
            console.log('💡 Generating optimization recommendations...');
            await this.generateRecommendations();

            // 7. Show results
            this.displayResults();

        } catch (error) {
            console.error('❌ Error during optimization analysis:', error);
            this.results.errors.push(error.message);
        } finally {
            // Cleanup database optimizer monitoring
            databaseOptimizer.stopMonitoring();
            await pool.end();
        }
    }

    async analyzeConnectionPool() {
        try {
            const poolStats = databaseOptimizer.getConnectionPoolStats();
            const utilization = (poolStats.totalConnections / poolStats.maxConnections) * 100;

            this.results.analysis.connectionPool = {
                ...poolStats,
                utilization: `${utilization.toFixed(1)}%`,
                status: this.getPoolStatus(utilization, poolStats.waitingClients)
            };

            console.log(`   Total: ${poolStats.totalConnections}/${poolStats.maxConnections} connections`);
            console.log(`   Idle: ${poolStats.idleConnections}, Waiting: ${poolStats.waitingClients}`);
            console.log(`   Utilization: ${utilization.toFixed(1)}%`);

        } catch (error) {
            this.results.errors.push(`Connection pool analysis failed: ${error.message}`);
        }
    }

    async analyzeQueryPerformance() {
        try {
            const analysis = databaseOptimizer.analyzeQueryPerformance();
            this.results.analysis.queryPerformance = analysis;

            console.log(`   Total queries: ${analysis.totalQueries}`);
            console.log(`   Slow queries: ${analysis.slowQueries} (${analysis.slowQueryRate}%)`);
            
            if (analysis.topSlowOperations.length > 0) {
                console.log('   Slowest operations:');
                analysis.topSlowOperations.slice(0, 3).forEach(op => {
                    console.log(`     ${op.operation}: ${op.avgTime.toFixed(2)}ms avg (${op.count} calls)`);
                });
            }

        } catch (error) {
            this.results.errors.push(`Query performance analysis failed: ${error.message}`);
        }
    }

    async analyzeCachePerformance() {
        try {
            const cacheStats = queryCache.getStats();
            this.results.analysis.cache = cacheStats;

            console.log(`   Cache size: ${cacheStats.size} entries`);
            console.log(`   Hit rate: ${cacheStats.hitRate}`);
            console.log(`   Memory usage: ${cacheStats.memoryUsage}`);
            console.log(`   Total requests: ${cacheStats.total} (${cacheStats.hits} hits, ${cacheStats.misses} misses)`);

        } catch (error) {
            this.results.errors.push(`Cache analysis failed: ${error.message}`);
        }
    }

    async gatherDatabaseStats() {
        const client = await pool.connect();
        try {
            // Table sizes
            const tableSizesResult = await client.query(`
                SELECT 
                    schemaname,
                    tablename,
                    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
                    pg_total_relation_size(schemaname||'.'||tablename) as size_bytes,
                    (SELECT reltuples::bigint FROM pg_class WHERE relname = tablename) as estimated_rows
                FROM pg_tables 
                WHERE schemaname = 'public'
                ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
            `);

            // Index usage with safer query
            const indexUsageResult = await client.query(`
                SELECT 
                    t.schemaname,
                    t.tablename,
                    i.indexname,
                    COALESCE(s.idx_scan, 0) as idx_scan,
                    COALESCE(s.idx_tup_read, 0) as idx_tup_read,
                    COALESCE(s.idx_tup_fetch, 0) as idx_tup_fetch
                FROM pg_tables t
                LEFT JOIN pg_indexes i ON i.tablename = t.tablename AND i.schemaname = t.schemaname
                LEFT JOIN pg_stat_user_indexes s ON s.indexrelname = i.indexname
                WHERE t.schemaname = 'public'
                ORDER BY COALESCE(s.idx_scan, 0) DESC
                LIMIT 10
            `);

            this.results.analysis.database = {
                tableSizes: tableSizesResult.rows,
                indexUsage: indexUsageResult.rows
            };

            console.log('   Table sizes:');
            tableSizesResult.rows.forEach(table => {
                console.log(`     ${table.tablename}: ${table.size} (${table.estimated_rows || 'unknown'} rows)`);
            });

        } catch (error) {
            this.results.errors.push(`Database stats gathering failed: ${error.message}`);
        } finally {
            client.release();
        }
    }

    async applyOptimizations(options) {
        try {
            const optimizationResults = await databaseOptimizer.applyOptimizations({
                createIndexes: options.createIndexes !== false,
                analyzeStats: options.analyzeStats !== false,
                enablePlanCache: options.enablePlanCache !== false,
                optimizeWorkMem: options.optimizeWorkMem !== false,
                enableParallel: options.enableParallel !== false
            });

            this.results.optimizations = optimizationResults;
            
            console.log('   Applied optimizations:');
            optimizationResults.forEach(result => {
                console.log(`     ${result}`);
            });

        } catch (error) {
            this.results.errors.push(`Optimization application failed: ${error.message}`);
        }
    }

    async generateRecommendations() {
        try {
            const recommendations = [];
            const analysis = this.results.analysis;

            // Connection pool recommendations
            if (analysis.connectionPool) {
                if (analysis.connectionPool.waitingClients > 0) {
                    recommendations.push({
                        type: 'critical',
                        category: 'Connection Pool',
                        issue: `${analysis.connectionPool.waitingClients} clients waiting for connections`,
                        action: 'Increase max_connections in database configuration',
                        impact: 'Eliminates connection bottlenecks'
                    });
                }

                const utilization = parseFloat(analysis.connectionPool.utilization);
                if (utilization > 80) {
                    recommendations.push({
                        type: 'high',
                        category: 'Connection Pool',
                        issue: `High connection pool utilization (${analysis.connectionPool.utilization})`,
                        action: 'Consider increasing max connections or optimizing query performance',
                        impact: 'Prevents connection exhaustion under peak load'
                    });
                }
            }

            // Query performance recommendations
            if (analysis.queryPerformance) {
                const slowQueryRate = parseFloat(analysis.queryPerformance.slowQueryRate);
                if (slowQueryRate > 5) {
                    recommendations.push({
                        type: 'high',
                        category: 'Query Performance',
                        issue: `${analysis.queryPerformance.slowQueryRate}% of queries are slow (>1s)`,
                        action: 'Optimize slow queries and add appropriate indexes',
                        impact: 'Improves overall bot responsiveness'
                    });
                }

                if (analysis.queryPerformance.topSlowOperations.length > 0) {
                    const slowestOp = analysis.queryPerformance.topSlowOperations[0];
                    recommendations.push({
                        type: 'medium',
                        category: 'Query Optimization',
                        issue: `Slowest operation: ${slowestOp.operation} (${slowestOp.avgTime.toFixed(2)}ms avg)`,
                        action: 'Review and optimize this specific query pattern',
                        impact: 'Reduces response time for common operations'
                    });
                }
            }

            // Cache recommendations
            if (analysis.cache) {
                const hitRate = parseFloat(analysis.cache.hitRate);
                if (hitRate < 70) {
                    recommendations.push({
                        type: 'medium',
                        category: 'Cache Performance',
                        issue: `Low cache hit rate (${analysis.cache.hitRate})`,
                        action: 'Increase cache TTL or add more cacheable operations',
                        impact: 'Reduces database load and improves response times'
                    });
                }

                if (analysis.cache.size > 1000) {
                    recommendations.push({
                        type: 'low',
                        category: 'Cache Management',
                        issue: `Large cache size (${analysis.cache.size} entries)`,
                        action: 'Consider implementing cache size limits or more aggressive cleanup',
                        impact: 'Optimizes memory usage'
                    });
                }
            }

            // Database-specific recommendations
            if (analysis.database && analysis.database.tableSizes) {
                const largestTable = analysis.database.tableSizes[0];
                if (largestTable && largestTable.size_bytes > 100 * 1024 * 1024) { // 100MB
                    recommendations.push({
                        type: 'medium',
                        category: 'Data Management',
                        issue: `Large table: ${largestTable.tablename} (${largestTable.size})`,
                        action: 'Consider implementing data archiving or partitioning',
                        impact: 'Improves query performance and reduces storage costs'
                    });
                }
            }

            // Bot-specific recommendations
            recommendations.push({
                type: 'low',
                category: 'Monitoring',
                issue: 'Regular performance monitoring',
                action: 'Set up automated alerts for slow queries and high connection usage',
                impact: 'Proactive identification of performance issues'
            });

            this.results.recommendations = recommendations.sort((a, b) => {
                const priority = { 'critical': 0, 'high': 1, 'medium': 2, 'low': 3 };
                return priority[a.type] - priority[b.type];
            });

        } catch (error) {
            this.results.errors.push(`Recommendation generation failed: ${error.message}`);
        }
    }

    getPoolStatus(utilization, waitingClients) {
        if (waitingClients > 0) return 'critical';
        if (utilization > 80) return 'warning';
        if (utilization > 60) return 'good';
        return 'excellent';
    }

    displayResults() {
        console.log('\n' + '='.repeat(60));
        console.log('📋 DATABASE OPTIMIZATION ANALYSIS RESULTS');
        console.log('='.repeat(60));

        // Summary
        const { analysis } = this.results;
        console.log('\n📊 PERFORMANCE SUMMARY:');
        
        if (analysis.connectionPool) {
            const status = analysis.connectionPool.status;
            const statusIcon = {
                'excellent': '🟢',
                'good': '🟡',
                'warning': '🟠',
                'critical': '🔴'
            };
            console.log(`   Connection Pool: ${statusIcon[status]} ${status.toUpperCase()}`);
            console.log(`   Utilization: ${analysis.connectionPool.utilization}`);
        }

        if (analysis.queryPerformance) {
            console.log(`   Query Performance: ${analysis.queryPerformance.slowQueryRate}% slow queries`);
        }

        if (analysis.cache) {
            console.log(`   Cache Efficiency: ${analysis.cache.hitRate} hit rate`);
        }

        // Optimizations applied
        if (this.results.optimizations.length > 0) {
            console.log('\n🔧 OPTIMIZATIONS APPLIED:');
            this.results.optimizations.forEach(opt => {
                console.log(`   ${opt}`);
            });
        }

        // Recommendations
        if (this.results.recommendations.length > 0) {
            console.log('\n💡 RECOMMENDATIONS:');
            
            const byPriority = {};
            this.results.recommendations.forEach(rec => {
                if (!byPriority[rec.type]) byPriority[rec.type] = [];
                byPriority[rec.type].push(rec);
            });

            ['critical', 'high', 'medium', 'low'].forEach(priority => {
                if (byPriority[priority]) {
                    const priorityIcon = {
                        'critical': '🚨',
                        'high': '⚠️',
                        'medium': '📝',
                        'low': '💡'
                    };
                    console.log(`\n   ${priorityIcon[priority]} ${priority.toUpperCase()} PRIORITY:`);
                    byPriority[priority].forEach(rec => {
                        console.log(`     • ${rec.issue}`);
                        console.log(`       Action: ${rec.action}`);
                        console.log(`       Impact: ${rec.impact}\n`);
                    });
                }
            });
        }

        // Errors
        if (this.results.errors.length > 0) {
            console.log('❌ ERRORS ENCOUNTERED:');
            this.results.errors.forEach(error => {
                console.log(`   • ${error}`);
            });
        }

        console.log('\n✅ Analysis complete!\n');
    }
}

// CLI interface
async function main() {
    const args = process.argv.slice(2);
    const options = {
        applyOptimizations: args.includes('--apply'),
        createIndexes: !args.includes('--no-indexes'),
        analyzeStats: !args.includes('--no-analyze'),
        enablePlanCache: !args.includes('--no-plan-cache'),
        optimizeWorkMem: !args.includes('--no-work-mem'),
        enableParallel: !args.includes('--no-parallel')
    };

    if (args.includes('--help')) {
        console.log(`
Database Optimization Script for Discord Productivity Bot

Usage: node optimizeDatabase.js [options]

Options:
  --apply              Apply optimizations (default: analysis only)
  --no-indexes         Skip index creation
  --no-analyze         Skip table statistics update
  --no-plan-cache      Skip query plan cache optimization
  --no-work-mem        Skip work memory optimization
  --no-parallel        Skip parallel query optimization
  --help               Show this help message

Examples:
  node optimizeDatabase.js                    # Analysis only
  node optimizeDatabase.js --apply            # Apply all optimizations
  node optimizeDatabase.js --apply --no-indexes  # Apply without creating indexes
        `);
        return;
    }

    const script = new DatabaseOptimizationScript();
    await script.run(options);
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = DatabaseOptimizationScript;
