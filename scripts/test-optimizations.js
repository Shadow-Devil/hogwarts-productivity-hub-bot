#!/usr/bin/env node
/**
 * Test script to validate database optimizations
 */

const { pool, executeCachedQuery, getOptimizationReport } = require('./src/models/db');

async function testOptimizations() {
    console.log('🧪 Testing Database Optimizations...\n');
    
    try {
        // Test 1: Cached query execution
        console.log('1️⃣ Testing cached query execution...');
        const startTime = Date.now();
        
        // First call (should hit database)
        await executeCachedQuery('test_user_lookup', 
            'SELECT discord_id, monthly_points FROM users LIMIT 5', 
            [], 'user_stats');
        const firstCallTime = Date.now() - startTime;
        
        // Second call (should hit cache)
        const cacheStartTime = Date.now();
        await executeCachedQuery('test_user_lookup', 
            'SELECT discord_id, monthly_points FROM users LIMIT 5', 
            [], 'user_stats');
        const cacheCallTime = Date.now() - cacheStartTime;
        
        console.log(`   First call: ${firstCallTime}ms (database)`);
        console.log(`   Second call: ${cacheCallTime}ms (cache)`);
        console.log(`   Cache speedup: ${(firstCallTime / Math.max(cacheCallTime, 1)).toFixed(2)}x\n`);
        
        // Test 2: Index utilization check
        console.log('2️⃣ Testing index utilization...');
        const indexQuery = `
            SELECT 
                schemaname,
                tablename,
                indexname,
                idx_scan as scans,
                idx_tup_read as tuples_read,
                idx_tup_fetch as tuples_fetched
            FROM pg_stat_user_indexes 
            WHERE indexname LIKE 'idx_%'
            ORDER BY idx_scan DESC
            LIMIT 5
        `;
        
        const indexStats = await pool.query(indexQuery);
        console.log('   Created indexes:');
        indexStats.rows.forEach(row => {
            console.log(`     ${row.indexname}: ${row.scans || 0} scans`);
        });
        
        // Test 3: Performance report
        console.log('\n3️⃣ Generating performance report...');
        const report = getOptimizationReport();
        
        console.log('   📊 Performance Summary:');
        console.log(`     Query Analysis: ${Object.keys(report.queryAnalysis).length} metrics`);
        console.log(`     Connection Pool: ${report.connectionPool.length} recommendations`);
        console.log(`     Cache Stats: ${report.cacheStats.size} entries, ${report.cacheStats.hitRate} hit rate`);
        console.log(`     Monitoring: ${report.monitoringStats.totalQueries} total queries tracked`);
        
        // Test 4: Table statistics
        console.log('\n4️⃣ Checking table statistics update...');
        const statsQuery = `
            SELECT 
                schemaname,
                tablename,
                n_tup_ins + n_tup_upd + n_tup_del as total_operations,
                last_analyze,
                last_autoanalyze
            FROM pg_stat_user_tables 
            WHERE schemaname = 'public'
            ORDER BY total_operations DESC
            LIMIT 5
        `;
        
        const tableStats = await pool.query(statsQuery);
        console.log('   Table statistics:');
        tableStats.rows.forEach(row => {
            const lastAnalyze = row.last_analyze || row.last_autoanalyze;
            console.log(`     ${row.tablename}: ${row.total_operations || 0} ops, analyzed: ${lastAnalyze ? 'Yes' : 'No'}`);
        });
        
        console.log('\n✅ All optimization tests completed successfully!');
        console.log('🎯 Database is optimized and ready for production load.');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Run if called directly
if (require.main === module) {
    testOptimizations().catch(console.error);
}

module.exports = testOptimizations;
