/**
 * Performance benchmarking tool for stress testing the Discord bot
 * Simulates various load scenarios to identify bottlenecks
 */

const { pool } = require('../models/db');
const voiceService = require('../services/voiceService');
const { performanceMonitor } = require('./performanceMonitor');

class PerformanceBenchmark {
    constructor() {
        this.results = [];
        this.isRunning = false;
    }

    // Run comprehensive performance benchmarks
    async runBenchmarks() {
        if (this.isRunning) {
            throw new Error('Benchmarks are already running');
        }

        this.isRunning = true;
        this.results = [];
        
        console.log('🚀 Starting performance benchmarks...\n');

        try {
            // Database connection benchmark
            await this.benchmarkDatabaseConnections();
            
            // Voice service operations benchmark
            await this.benchmarkVoiceOperations();
            
            // Memory stress test
            await this.benchmarkMemoryUsage();
            
            // Concurrent operations benchmark
            await this.benchmarkConcurrentOperations();

            console.log('\n✅ All benchmarks completed successfully');
            return this.generateBenchmarkReport();
        } catch (error) {
            console.error('❌ Benchmark failed:', error);
            throw error;
        } finally {
            this.isRunning = false;
        }
    }

    // Benchmark database connection performance
    async benchmarkDatabaseConnections() {
        console.log('📊 Benchmarking database connections...');
        
        const connectionTests = [10, 25, 50, 100]; // Number of concurrent connections
        const connectionResults = [];

        for (const connectionCount of connectionTests) {
            const startTime = Date.now();
            const promises = [];

            for (let i = 0; i < connectionCount; i++) {
                promises.push(this.testSingleConnection());
            }

            try {
                await Promise.all(promises);
                const duration = Date.now() - startTime;
                const avgTime = duration / connectionCount;
                
                connectionResults.push({
                    connectionCount,
                    totalTime: duration,
                    avgTime,
                    success: true
                });

                console.log(`  ✅ ${connectionCount} connections: ${duration}ms total, ${avgTime.toFixed(1)}ms avg`);
            } catch (error) {
                connectionResults.push({
                    connectionCount,
                    error: error.message,
                    success: false
                });

                console.log(`  ❌ ${connectionCount} connections: FAILED - ${error.message}`);
            }

            // Brief pause between tests
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        this.results.push({
            category: 'Database Connections',
            results: connectionResults
        });
    }

    // Test a single database connection
    async testSingleConnection() {
        const client = await pool.connect();
        try {
            await client.query('SELECT NOW()');
        } finally {
            client.release();
        }
    }

    // Benchmark voice service operations
    async benchmarkVoiceOperations() {
        console.log('🎤 Benchmarking voice service operations...');
        
        const operationCounts = [10, 25, 50]; // Number of operations
        const voiceResults = [];

        for (const count of operationCounts) {
            const startTime = Date.now();
            const operations = [];

            // Simulate voice session start/end cycles
            for (let i = 0; i < count; i++) {
                const userId = `benchmark_user_${i}`;
                const username = `BenchmarkUser${i}`;
                const channelId = `channel_${i % 5}`; // 5 different channels
                const channelName = `Benchmark Channel ${i % 5}`;

                operations.push(async () => {
                    // Start session
                    const session = await voiceService.startVoiceSession(
                        userId, username, channelId, channelName
                    );
                    
                    // Simulate brief voice time
                    await new Promise(resolve => setTimeout(resolve, 50));
                    
                    // End session
                    await voiceService.endVoiceSession(userId, channelId);
                });
            }

            try {
                await Promise.all(operations.map(op => op()));
                const duration = Date.now() - startTime;
                const avgTime = duration / count;

                voiceResults.push({
                    operationCount: count,
                    totalTime: duration,
                    avgTime,
                    success: true
                });

                console.log(`  ✅ ${count} voice ops: ${duration}ms total, ${avgTime.toFixed(1)}ms avg`);
            } catch (error) {
                voiceResults.push({
                    operationCount: count,
                    error: error.message,
                    success: false
                });

                console.log(`  ❌ ${count} voice ops: FAILED - ${error.message}`);
            }

            // Cleanup and pause
            await this.cleanupBenchmarkData();
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        this.results.push({
            category: 'Voice Operations',
            results: voiceResults
        });
    }

    // Benchmark memory usage patterns
    async benchmarkMemoryUsage() {
        console.log('🧠 Benchmarking memory usage...');
        
        const initialMemory = process.memoryUsage();
        const memorySnapshots = [initialMemory];

        // Create memory pressure by storing large objects
        const largeObjects = [];
        const objectSizes = [1000, 5000, 10000]; // Array sizes

        for (const size of objectSizes) {
            const startTime = Date.now();
            
            // Create large objects
            for (let i = 0; i < 100; i++) {
                largeObjects.push(new Array(size).fill(`data_${i}`));
            }

            const memoryAfter = process.memoryUsage();
            memorySnapshots.push(memoryAfter);
            
            const memoryIncrease = memoryAfter.heapUsed - initialMemory.heapUsed;
            const duration = Date.now() - startTime;

            console.log(`  📈 ${size} object size: +${(memoryIncrease / 1024 / 1024).toFixed(1)}MB in ${duration}ms`);
        }

        // Force garbage collection if available
        if (global.gc) {
            global.gc();
            const memoryAfterGC = process.memoryUsage();
            memorySnapshots.push(memoryAfterGC);
            console.log(`  🗑️ After GC: ${(memoryAfterGC.heapUsed / 1024 / 1024).toFixed(1)}MB`);
        }

        // Clear large objects
        largeObjects.length = 0;

        this.results.push({
            category: 'Memory Usage',
            results: {
                snapshots: memorySnapshots,
                initialHeap: (initialMemory.heapUsed / 1024 / 1024).toFixed(1),
                peakHeap: (Math.max(...memorySnapshots.map(s => s.heapUsed)) / 1024 / 1024).toFixed(1)
            }
        });
    }

    // Benchmark concurrent operations
    async benchmarkConcurrentOperations() {
        console.log('⚡ Benchmarking concurrent operations...');
        
        const concurrencyLevels = [5, 10, 20];
        const concurrentResults = [];

        for (const concurrency of concurrencyLevels) {
            const startTime = Date.now();
            const operations = [];

            // Mix of different operations
            for (let i = 0; i < concurrency; i++) {
                if (i % 3 === 0) {
                    // Database query
                    operations.push(this.testSingleConnection());
                } else if (i % 3 === 1) {
                    // Voice session simulation
                    operations.push(this.simulateVoiceSession(i));
                } else {
                    // Stats retrieval
                    operations.push(this.simulateStatsRetrieval(i));
                }
            }

            try {
                await Promise.all(operations);
                const duration = Date.now() - startTime;
                const avgTime = duration / concurrency;

                concurrentResults.push({
                    concurrencyLevel: concurrency,
                    totalTime: duration,
                    avgTime,
                    success: true
                });

                console.log(`  ✅ ${concurrency} concurrent ops: ${duration}ms total, ${avgTime.toFixed(1)}ms avg`);
            } catch (error) {
                concurrentResults.push({
                    concurrencyLevel: concurrency,
                    error: error.message,
                    success: false
                });

                console.log(`  ❌ ${concurrency} concurrent ops: FAILED - ${error.message}`);
            }

            // Cleanup between tests
            await this.cleanupBenchmarkData();
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        this.results.push({
            category: 'Concurrent Operations',
            results: concurrentResults
        });
    }

    // Simulate a voice session for benchmarking
    async simulateVoiceSession(index) {
        const userId = `concurrent_user_${index}`;
        const username = `ConcurrentUser${index}`;
        const channelId = `concurrent_channel_${index}`;
        const channelName = `Concurrent Channel ${index}`;

        const session = await voiceService.startVoiceSession(
            userId, username, channelId, channelName
        );
        
        // Brief delay to simulate voice time
        await new Promise(resolve => setTimeout(resolve, 100));
        
        await voiceService.endVoiceSession(userId, channelId);
    }

    // Simulate stats retrieval for benchmarking
    async simulateStatsRetrieval(index) {
        const userId = `stats_user_${index}`;
        const username = `StatsUser${index}`;
        
        // Ensure user exists
        await voiceService.getOrCreateUser(userId, username);
        
        // Retrieve stats
        await voiceService.getUserStats(userId);
    }

    // Clean up benchmark data
    async cleanupBenchmarkData() {
        const client = await pool.connect();
        try {
            // Delete benchmark users and related data
            await client.query(`
                DELETE FROM vc_sessions 
                WHERE discord_id LIKE 'benchmark_%' 
                OR discord_id LIKE 'concurrent_%' 
                OR discord_id LIKE 'stats_%'
            `);
            
            await client.query(`
                DELETE FROM daily_voice_stats 
                WHERE discord_id LIKE 'benchmark_%' 
                OR discord_id LIKE 'concurrent_%' 
                OR discord_id LIKE 'stats_%'
            `);
            
            await client.query(`
                DELETE FROM users 
                WHERE discord_id LIKE 'benchmark_%' 
                OR discord_id LIKE 'concurrent_%' 
                OR discord_id LIKE 'stats_%'
            `);
        } finally {
            client.release();
        }
    }

    // Generate comprehensive benchmark report
    generateBenchmarkReport() {
        const report = {
            timestamp: new Date().toISOString(),
            duration: Date.now() - this.startTime,
            results: this.results,
            summary: this.generateSummary(),
            recommendations: this.generateRecommendations()
        };

        return report;
    }

    // Generate summary of benchmark results
    generateSummary() {
        const summary = {
            totalTests: 0,
            passedTests: 0,
            failedTests: 0,
            avgResponseTimes: {}
        };

        this.results.forEach(category => {
            if (Array.isArray(category.results)) {
                category.results.forEach(result => {
                    summary.totalTests++;
                    if (result.success) {
                        summary.passedTests++;
                        summary.avgResponseTimes[category.category] = result.avgTime;
                    } else {
                        summary.failedTests++;
                    }
                });
            }
        });

        return summary;
    }

    // Generate performance recommendations
    generateRecommendations() {
        const recommendations = [];
        const summary = this.generateSummary();

        // Check overall success rate
        const successRate = (summary.passedTests / summary.totalTests) * 100;
        if (successRate < 90) {
            recommendations.push({
                priority: 'critical',
                issue: `Low success rate: ${successRate.toFixed(1)}%`,
                suggestion: 'Review failed tests and optimize bottlenecks'
            });
        }

        // Check response times
        Object.entries(summary.avgResponseTimes).forEach(([category, avgTime]) => {
            if (avgTime > 1000) {
                recommendations.push({
                    priority: 'high',
                    issue: `Slow ${category} operations: ${avgTime.toFixed(1)}ms avg`,
                    suggestion: 'Optimize queries and consider caching'
                });
            }
        });

        return recommendations;
    }
}

module.exports = new PerformanceBenchmark();
