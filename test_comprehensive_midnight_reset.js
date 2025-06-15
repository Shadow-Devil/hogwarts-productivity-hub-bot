#!/usr/bin/env node

/**
 * Comprehensive Midnight Reset System Test
 * Tests the enhanced midnight reset functionality with detailed console output
 */

require('dotenv').config();
const DailyTaskManager = require('./src/utils/dailyTaskManager');
const { pool } = require('./src/models/db');
const dayjs = require('dayjs');

// Test configuration
const TEST_USER_ID = 'test_user_123456789';
const TEST_CHANNEL_ID = 'test_channel_987654321';

// Mock active voice sessions for testing
const mockActiveVoiceSessions = new Map();
const mockGracePeriodSessions = new Map();

// Mock voice service for testing
const mockVoiceService = {
    async handleMidnightCrossover(userId, channelId, member) {
        console.log(`🔧 Mock handleMidnightCrossover called for user ${userId}`);

        // Simulate a successful midnight crossover
        return {
            yesterdaySession: {
                id: 'yesterday_session_123',
                duration_minutes: 120, // 2 hours
                points_earned: 4, // 2 points per hour
                left_at: dayjs().startOf('day').toDate()
            },
            todaySession: {
                id: 'today_session_456',
                joined_at: dayjs().startOf('day').toDate()
            }
        };
    }
};

async function runComprehensiveTest() {
    console.log('🚀 COMPREHENSIVE MIDNIGHT RESET SYSTEM TEST');
    console.log('═'.repeat(60));
    console.log(`📅 Test Date: ${dayjs().format('YYYY-MM-DD HH:mm:ss')}`);
    console.log('');

    const manager = new DailyTaskManager();
    let testsPassed = 0;
    let totalTests = 0;

    try {
        // Test 1: Manager instantiation
        totalTests++;
        console.log('🧪 Test 1: DailyTaskManager Instantiation');
        console.log('   ✅ Manager created successfully');
        console.log(`   📊 Status: ${JSON.stringify(manager.getStatus(), null, 4)}`);
        testsPassed++;
        console.log('');

        // Test 2: Database connection and schema validation
        totalTests++;
        console.log('🧪 Test 2: Database Schema Validation');
        const client = await pool.connect();

        try {
            // Check if archived column exists
            const archivedColumn = await client.query(`
                SELECT column_name, data_type, column_default
                FROM information_schema.columns
                WHERE table_name = 'daily_voice_stats' AND column_name = 'archived'
            `);

            if (archivedColumn.rows.length > 0) {
                console.log('   ✅ archived column exists in daily_voice_stats');
                console.log(`   📋 Column details: ${JSON.stringify(archivedColumn.rows[0], null, 4)}`);
                testsPassed++;
            } else {
                console.log('   ❌ archived column missing from daily_voice_stats');
            }
        } finally {
            client.release();
        }
        console.log('');

        // Test 3: Setup test data
        totalTests++;
        console.log('🧪 Test 3: Test Data Setup');
        await setupTestData();
        console.log('   ✅ Test data created successfully');
        testsPassed++;
        console.log('');

        // Test 4: Test individual user midnight reset processing
        totalTests++;
        console.log('🧪 Test 4: Individual User Midnight Reset Processing');

        // Setup mock sessions
        mockActiveVoiceSessions.set(TEST_USER_ID, {
            channelId: TEST_CHANNEL_ID,
            joinTime: dayjs().subtract(2, 'hours').toDate(),
            sessionId: 'test_session_123',
            lastSeen: new Date()
        });

        console.log(`   🎤 Mock active voice session created for user: ${TEST_USER_ID}`);

        const resetResult = await manager.processUserMidnightReset(
            TEST_USER_ID,
            mockActiveVoiceSessions,
            mockGracePeriodSessions,
            mockVoiceService
        );

        console.log('   📊 Reset Result:');
        console.log(`      • Session Type: ${resetResult.sessionType}`);
        console.log(`      • Points Awarded: ${resetResult.pointsAwarded}`);
        console.log(`      • Hours Processed: ${resetResult.hoursProcessed.toFixed(2)}h`);
        console.log(`      • New Session Created: ${resetResult.newSessionCreated}`);
        console.log(`      • Was in Grace Period: ${resetResult.wasInGracePeriod}`);

        if (resetResult.sessionType === 'active_voice' && resetResult.pointsAwarded > 0) {
            console.log('   ✅ Individual user reset processed successfully');
            testsPassed++;
        } else {
            console.log('   ❌ Individual user reset processing failed');
        }
        console.log('');

        // Test 5: Test grace period user processing
        totalTests++;
        console.log('🧪 Test 5: Grace Period User Processing');

        const GRACE_USER_ID = 'grace_user_987654321';
        mockGracePeriodSessions.set(GRACE_USER_ID, {
            channelId: TEST_CHANNEL_ID,
            joinTime: dayjs().subtract(3, 'hours').toDate(),
            sessionId: 'grace_session_789',
            gracePeriodStart: Date.now() - (4 * 60 * 1000) // Started 4 minutes ago
        });

        console.log(`   ⏸️ Mock grace period session created for user: ${GRACE_USER_ID}`);

        const graceResetResult = await manager.processUserMidnightReset(
            GRACE_USER_ID,
            mockActiveVoiceSessions,
            mockGracePeriodSessions,
            mockVoiceService
        );

        console.log('   📊 Grace Period Reset Result:');
        console.log(`      • Session Type: ${graceResetResult.sessionType}`);
        console.log(`      • Points Awarded: ${graceResetResult.pointsAwarded}`);
        console.log(`      • Hours Processed: ${graceResetResult.hoursProcessed.toFixed(2)}h`);
        console.log(`      • Was in Grace Period: ${graceResetResult.wasInGracePeriod}`);

        if (graceResetResult.sessionType === 'grace_period' && graceResetResult.wasInGracePeriod) {
            console.log('   ✅ Grace period user processing successful');
            testsPassed++;
        } else {
            console.log('   ❌ Grace period user processing failed');
        }
        console.log('');

        // Test 6: Task limit functionality
        totalTests++;
        console.log('🧪 Test 6: Task Limit Functionality');

        const limitCheck = await manager.canUserAddTask(TEST_USER_ID);
        console.log('   📊 Task Limit Check Result:');
        console.log(`      • Can Add: ${limitCheck.canAdd}`);
        console.log(`      • Current Actions: ${limitCheck.currentActions}`);
        console.log(`      • Remaining: ${limitCheck.remaining}`);
        console.log(`      • Daily Limit: ${limitCheck.limit}`);

        if (typeof limitCheck.canAdd === 'boolean' && limitCheck.limit === 10) {
            console.log('   ✅ Task limit functionality working correctly');
            testsPassed++;
        } else {
            console.log('   ❌ Task limit functionality failed');
        }
        console.log('');

        // Test 7: Comprehensive midnight operations simulation
        totalTests++;
        console.log('🧪 Test 7: Full Midnight Operations Simulation');
        console.log('   🌅 Simulating complete midnight reset...');

        // Mock the voice state update module
        const originalRequire = require;
        const Module = require('module');
        const originalResolveFilename = Module._resolveFilename;

        Module._resolveFilename = function(request, parent, isMain) {
            if (request === '../events/voiceStateUpdate') {
                return '/mock/voiceStateUpdate';
            }
            return originalResolveFilename.call(this, request, parent, isMain);
        };

        // Create mock module
        require.cache['/mock/voiceStateUpdate'] = {
            exports: {
                activeVoiceSessions: mockActiveVoiceSessions,
                gracePeriodSessions: mockGracePeriodSessions
            }
        };

        try {
            const midnightResult = await manager.resetDailyVoiceStats();

            console.log('   📊 Midnight Operations Result:');
            console.log(`      • Users Processed: ${midnightResult.processedSessions}`);
            console.log(`      • Grace Period Handled: ${midnightResult.gracePeriodHandled}`);
            console.log(`      • New Sessions Created: ${midnightResult.newSessionsCreated}`);
            console.log(`      • Total Points Awarded: ${midnightResult.totalPointsAwarded}`);
            console.log(`      • Total Hours Processed: ${midnightResult.totalHoursProcessed.toFixed(2)}h`);
            console.log(`      • Errors: ${midnightResult.errors}`);

            if (midnightResult.processedSessions > 0 && midnightResult.errors === 0) {
                console.log('   ✅ Full midnight operations simulation successful');
                testsPassed++;
            } else {
                console.log('   ❌ Full midnight operations simulation failed');
            }
        } finally {
            // Restore original require
            Module._resolveFilename = originalResolveFilename;
            delete require.cache['/mock/voiceStateUpdate'];
        }
        console.log('');

        // Test 8: Cleanup test data
        totalTests++;
        console.log('🧪 Test 8: Test Data Cleanup');
        await cleanupTestData();
        console.log('   ✅ Test data cleaned up successfully');
        testsPassed++;
        console.log('');

    } catch (error) {
        console.error('❌ Test execution error:', error);
        console.error('Stack trace:', error.stack);
    } finally {
        // Ensure database connections are closed
        try {
            await pool.end();
            console.log('🔌 Database connection pool closed');
        } catch (error) {
            console.error('⚠️ Error closing database pool:', error.message);
        }
    }

    // Final test summary
    console.log('═'.repeat(60));
    console.log('🏁 TEST EXECUTION SUMMARY');
    console.log('═'.repeat(60));
    console.log(`📊 Tests Passed: ${testsPassed}/${totalTests}`);
    console.log(`✅ Success Rate: ${((testsPassed / totalTests) * 100).toFixed(1)}%`);

    if (testsPassed === totalTests) {
        console.log('🎉 ALL TESTS PASSED! Enhanced midnight reset system is working correctly.');
        process.exit(0);
    } else {
        console.log('⚠️ Some tests failed. Please review the implementation.');
        process.exit(1);
    }
}

async function setupTestData() {
    const client = await pool.connect();
    try {
        // Create test user
        await client.query(`
            INSERT INTO users (discord_id, username)
            VALUES ($1, $2)
            ON CONFLICT (discord_id) DO UPDATE SET username = $2
        `, [TEST_USER_ID, 'TestUser']);

        // Create test daily voice stats
        const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
        await client.query(`
            INSERT INTO daily_voice_stats (discord_id, date, total_minutes, session_count, points_earned, user_id, archived)
            VALUES ($1, $2, $3, $4, $5, (SELECT id FROM users WHERE discord_id = $6), $7)
            ON CONFLICT (discord_id, date) DO UPDATE SET
                total_minutes = $3,
                session_count = $4,
                points_earned = $5,
                archived = $7
        `, [TEST_USER_ID, yesterday, 120, 2, 4, TEST_USER_ID, false]);

        console.log(`   📊 Created test data for user ${TEST_USER_ID}`);
        console.log(`   📅 Test daily stats created for ${yesterday}`);

    } finally {
        client.release();
    }
}

async function cleanupTestData() {
    const client = await pool.connect();
    try {
        // Clean up test data
        await client.query('DELETE FROM daily_voice_stats WHERE discord_id LIKE $1', ['test_user_%']);
        await client.query('DELETE FROM daily_voice_stats WHERE discord_id LIKE $1', ['grace_user_%']);
        await client.query('DELETE FROM users WHERE discord_id LIKE $1', ['test_user_%']);
        await client.query('DELETE FROM users WHERE discord_id LIKE $1', ['grace_user_%']);

        console.log('   🧹 Cleaned up test users and daily stats');

    } finally {
        client.release();
    }
}

// Handle process termination gracefully
process.on('SIGINT', async () => {
    console.log('\n🛑 Test interrupted by user');
    await cleanupTestData();
    await pool.end();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Test terminated');
    await cleanupTestData();
    await pool.end();
    process.exit(0);
});

// Run the test
if (require.main === module) {
    runComprehensiveTest();
}

module.exports = { runComprehensiveTest };
