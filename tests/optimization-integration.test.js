/**
 * Integration Test for Database Optimization Features
 * Tests all newly integrated optimization methods
 */

const queryCache = require('../src/utils/queryCache');
const cacheWarming = require('../src/utils/cacheWarming');

class OptimizationIntegrationTest {
    constructor() {
        this.testResults = [];
    }

    /**
     * Run comprehensive integration tests
     */
    async runTests() {
        console.log('🧪 Starting Optimization Integration Tests');
        console.log('═'.repeat(50));

        await this.testSmartCacheInvalidation();
        await this.testBatchCacheOperations();
        await this.testCacheWarming();
        await this.testOptimizationReporting();

        this.printResults();
    }

    /**
     * Test smart cache invalidation
     */
    async testSmartCacheInvalidation() {
        console.log('🧹 Testing Smart Cache Invalidation...');

        try {
            // Set up test cache entries
            queryCache.set('user_stats:test123', { points: 100 }, 'userStats');
            queryCache.set('user_tasks:test123:all', [{ id: 1, title: 'Test' }], 'userTasks');
            queryCache.set('leaderboard:monthly', [{ user: 'test' }], 'leaderboard');

            console.log('   📝 Set up test cache entries');

            // Test invalidation
            const invalidatedCount = queryCache.invalidateUserRelatedCache('test123');

            // Verify invalidation
            const userStats = queryCache.get('user_stats:test123');
            const userTasks = queryCache.get('user_tasks:test123:all');
            const leaderboard = queryCache.get('leaderboard:monthly');

            const success = userStats === null && userTasks === null && leaderboard === null;

            this.testResults.push({
                test: 'Smart Cache Invalidation',
                status: success ? '✅ PASS' : '❌ FAIL',
                details: `Invalidated ${invalidatedCount} entries`
            });

            console.log(`   ${success ? '✅' : '❌'} Invalidated ${invalidatedCount} cache entries`);

        } catch (error) {
            this.testResults.push({
                test: 'Smart Cache Invalidation',
                status: '❌ ERROR',
                details: error.message
            });
            console.log(`   ❌ Error: ${error.message}`);
        }
    }

    /**
     * Test batch cache operations
     */
    async testBatchCacheOperations() {
        console.log('📦 Testing Batch Cache Operations...');

        try {
            // Test batchSet
            const batchEntries = [
                { key: 'test_batch_1', data: { value: 'data1' }, cacheType: 'default' },
                { key: 'test_batch_2', data: { value: 'data2' }, cacheType: 'default' },
                { key: 'test_batch_3', data: { value: 'data3' }, cacheType: 'default' }
            ];

            await queryCache.batchSet(batchEntries);
            console.log('   📝 Batch set 3 entries');

            // Test batchGet
            const keys = ['test_batch_1', 'test_batch_2', 'test_batch_3'];
            const results = await queryCache.batchGet(keys);

            const allFound = keys.every(key => results[key] !== undefined);
            const correctData = results['test_batch_1']?.value === 'data1';

            const success = allFound && correctData;

            this.testResults.push({
                test: 'Batch Cache Operations',
                status: success ? '✅ PASS' : '❌ FAIL',
                details: `Retrieved ${Object.keys(results).length}/${keys.length} entries`
            });

            console.log(`   ${success ? '✅' : '❌'} Batch operations successful`);

            // Cleanup
            keys.forEach(key => queryCache.delete(key));

        } catch (error) {
            this.testResults.push({
                test: 'Batch Cache Operations',
                status: '❌ ERROR',
                details: error.message
            });
            console.log(`   ❌ Error: ${error.message}`);
        }
    }

    /**
     * Test cache warming functionality
     */
    async testCacheWarming() {
        console.log('🔥 Testing Cache Warming...');

        try {
            const status = cacheWarming.getStatus();

            const success = typeof status === 'object' &&
                           'isActive' in status &&
                           'isCurrentlyWarming' in status;

            this.testResults.push({
                test: 'Cache Warming',
                status: success ? '✅ PASS' : '❌ FAIL',
                details: `Status: ${status.isActive ? 'Active' : 'Inactive'}`
            });

            console.log(`   ${success ? '✅' : '❌'} Cache warming system functional`);

        } catch (error) {
            this.testResults.push({
                test: 'Cache Warming',
                status: '❌ ERROR',
                details: error.message
            });
            console.log(`   ❌ Error: ${error.message}`);
        }
    }

    /**
     * Test optimization reporting
     */
    async testOptimizationReporting() {
        console.log('📊 Testing Optimization Reporting...');

        try {
            const stats = queryCache.getStats();

            const hasRequiredFields = stats.size !== undefined &&
                                    stats.hits !== undefined &&
                                    stats.hitRate !== undefined;

            this.testResults.push({
                test: 'Optimization Reporting',
                status: hasRequiredFields ? '✅ PASS' : '❌ FAIL',
                details: `Hit rate: ${stats.hitRate}, Entries: ${stats.size}`
            });

            console.log(`   ${hasRequiredFields ? '✅' : '❌'} Optimization metrics available`);

        } catch (error) {
            this.testResults.push({
                test: 'Optimization Reporting',
                status: '❌ ERROR',
                details: error.message
            });
            console.log(`   ❌ Error: ${error.message}`);
        }
    }

    /**
     * Print test results summary
     */
    printResults() {
        console.log('');
        console.log('📋 Integration Test Results');
        console.log('═'.repeat(50));

        this.testResults.forEach(result => {
            console.log(`${result.status} ${result.test}`);
            console.log(`   ${result.details}`);
        });

        const passed = this.testResults.filter(r => r.status.includes('PASS')).length;
        const total = this.testResults.length;

        console.log('');
        console.log(`🎯 Summary: ${passed}/${total} tests passed`);

        if (passed === total) {
            console.log('🎉 All optimization integrations working correctly!');
        } else {
            console.log('⚠️  Some tests failed - review optimization integration');
        }

        console.log('═'.repeat(50));
    }
}

// Export for testing
module.exports = OptimizationIntegrationTest;

// Run tests if called directly
if (require.main === module) {
    const tester = new OptimizationIntegrationTest();
    tester.runTests().catch(console.error);
}
