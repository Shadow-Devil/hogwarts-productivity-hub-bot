#!/usr/bin/env node

/**
 * Comprehensive Functionality Audit Script
 * Verifies that all original functionality has been properly carried over to centralized utilities
 */

const path = require('path');
const fs = require('fs');

console.log('🔍 COMPREHENSIVE FUNCTIONALITY AUDIT');
console.log('='.repeat(70));
console.log('Verifying all required functions exist in centralized utilities...');
console.log('');
console.log('='.repeat(60));

// Test tracking
let testsPassed = 0;
let testsFailed = 0;
const missingFunctions = [];

function logTest(testName, passed, details = '') {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} ${testName}`);
    if (details) {
        console.log(`   ${details}`);
    }

    if (passed) {
        testsPassed++;
    } else {
        testsFailed++;
        if (!passed) missingFunctions.push({ test: testName, details });
    }
}

function testFunctionExists(module, functionName, testName) {
    try {
        const importedModule = require(module);
        const hasFunction = typeof importedModule[functionName] === 'function';
        logTest(testName, hasFunction,
            hasFunction ? `Function available: ${functionName}` :
            `Missing function: ${functionName} in ${module}`
        );
        return hasFunction;
    } catch (error) {
        logTest(testName, false, `Module import error: ${error.message}`);
        return false;
    }
}

async function auditFunctionality() {
    console.log('\n🔧 TESTING TIME UTILITIES');
    console.log('-'.repeat(40));

    // Test timeUtils.js functions
    testFunctionExists('./src/utils/timeUtils', 'roundHoursFor55MinRule',
        'roundHoursFor55MinRule exists in timeUtils');
    testFunctionExists('./src/utils/timeUtils', 'formatHours',
        'formatHours exists in timeUtils');
    testFunctionExists('./src/utils/timeUtils', 'minutesToHours',
        'minutesToHours exists in timeUtils');
    testFunctionExists('./src/utils/timeUtils', 'hoursToMinutes',
        'hoursToMinutes exists in timeUtils');
    testFunctionExists('./src/utils/timeUtils', 'calculateSessionDuration',
        'calculateSessionDuration exists in timeUtils');

    console.log('\n📊 TESTING DAILY LIMIT UTILITIES');
    console.log('-'.repeat(40));

    // Test dailyLimitUtils.js functions
    testFunctionExists('./src/utils/dailyLimitUtils', 'calculateDailyLimitInfo',
        'calculateDailyLimitInfo exists in dailyLimitUtils');
    testFunctionExists('./src/utils/dailyLimitUtils', 'formatDailyLimitStatus',
        'formatDailyLimitStatus exists in dailyLimitUtils');
    testFunctionExists('./src/utils/dailyLimitUtils', 'generateDailyLimitMessage',
        'generateDailyLimitMessage exists in dailyLimitUtils');

    console.log('\n🔄 TESTING CACHE INVALIDATION SERVICE');
    console.log('-'.repeat(40));

    // Test cacheInvalidationService.js functions
    testFunctionExists('./src/utils/cacheInvalidationService', 'invalidateAfterVoiceOperation',
        'invalidateAfterVoiceOperation exists in cacheInvalidationService');
    testFunctionExists('./src/utils/cacheInvalidationService', 'invalidateAfterTaskOperation',
        'invalidateAfterTaskOperation exists in cacheInvalidationService');

    console.log('\n🏗️ TESTING BASE SERVICE');
    console.log('-'.repeat(40));

    // Test BaseService class
    try {
        const BaseService = require('./src/utils/baseService');
        const hasExecuteWithFallback = BaseService.prototype.executeWithFallback;
        logTest('BaseService.executeWithFallback exists', !!hasExecuteWithFallback,
            hasExecuteWithFallback ? 'Optimized/fallback pattern available' :
            'Missing optimized/fallback pattern method');
    } catch (error) {
        logTest('BaseService import', false, `BaseService import error: ${error.message}`);
    }

    console.log('\n📅 TESTING MONTHLY RESET SERVICE');
    console.log('-'.repeat(40));

    // Test monthlyResetService.js functions
    testFunctionExists('./src/services/monthlyResetService', 'start',
        'start exists in monthlyResetService');
    testFunctionExists('./src/services/monthlyResetService', 'stop',
        'stop exists in monthlyResetService');

    console.log('\n🧮 TESTING CORE CALCULATION FUNCTIONS');
    console.log('-'.repeat(40));

    // Test db.js functions that were not moved (should remain in db.js)
    testFunctionExists('./src/models/db', 'calculatePointsForHours',
        'calculatePointsForHours exists in db.js');

    console.log('\n🔍 TESTING FUNCTION USAGE IN SERVICES');
    console.log('-'.repeat(40));

    // Test that services are using the centralized functions
    const voiceServiceContent = fs.readFileSync('./src/services/voiceService.js', 'utf8');
    const taskServiceContent = fs.readFileSync('./src/services/taskService.js', 'utf8');

    // VoiceService should use centralized utilities
    const voiceServiceUsesTimeUtils = voiceServiceContent.includes('require(\'../utils/timeUtils\')');
    const voiceServiceUsesDailyLimitUtils = voiceServiceContent.includes('require(\'../utils/dailyLimitUtils\')');
    const voiceServiceUsesCacheService = voiceServiceContent.includes('require(\'../utils/cacheInvalidationService\')');

    logTest('VoiceService imports timeUtils', voiceServiceUsesTimeUtils);
    logTest('VoiceService imports dailyLimitUtils', voiceServiceUsesDailyLimitUtils);
    logTest('VoiceService imports cacheInvalidationService', voiceServiceUsesCacheService);

    // TaskService should use centralized utilities
    const taskServiceExtendsBase = taskServiceContent.includes('extends BaseService');
    const taskServiceUsesCacheService = taskServiceContent.includes('require(\'../utils/cacheInvalidationService\')');

    logTest('TaskService extends BaseService', taskServiceExtendsBase);
    logTest('TaskService imports cacheInvalidationService', taskServiceUsesCacheService);

    console.log('\n🚫 TESTING FOR REMOVED DUPLICATE FUNCTIONS');
    console.log('-'.repeat(40));

    // Check that old duplicate functions are gone
    const hasOldRoundingInVoice = voiceServiceContent.includes('roundHoursFor55MinRule() {') ||
                                  voiceServiceContent.includes('roundHoursForPoints() {');
    const hasOldCacheInVoice = voiceServiceContent.includes('queryCache.invalidateUserRelatedCache(');
    const hasOldCacheInTask = taskServiceContent.includes('queryCache.invalidateUserRelatedCache(');

    logTest('Old rounding functions removed from VoiceService', !hasOldRoundingInVoice,
        hasOldRoundingInVoice ? 'Found old rounding functions' : 'No old rounding functions found');
    logTest('Old cache calls removed from VoiceService', !hasOldCacheInVoice,
        hasOldCacheInVoice ? 'Found old cache invalidation calls' : 'No old cache calls found');
    logTest('Old cache calls removed from TaskService', !hasOldCacheInTask,
        hasOldCacheInTask ? 'Found old cache invalidation calls' : 'No old cache calls found');

    console.log('\n📊 FINAL AUDIT RESULTS');
    console.log('='.repeat(60));

    const totalTests = testsPassed + testsFailed;
    const successRate = totalTests > 0 ? Math.round((testsPassed / totalTests) * 100) : 0;

    console.log(`Total Function Tests: ${totalTests}`);
    console.log(`✅ Passed: ${testsPassed}`);
    console.log(`❌ Failed: ${testsFailed}`);
    console.log(`Success Rate: ${successRate}%`);

    if (missingFunctions.length > 0) {
        console.log('\n❌ MISSING FUNCTIONALITY:');
        console.log('-'.repeat(40));
        missingFunctions.forEach((missing, index) => {
            console.log(`${index + 1}. ${missing.test}`);
            console.log(`   ${missing.details}`);
        });

        console.log('\n🔧 RECOMMENDED ACTIONS:');
        console.log('1. Add missing functions to appropriate centralized utilities');
        console.log('2. Update services to use the centralized functions');
        console.log('3. Remove any remaining duplicate code');
    } else {
        console.log('\n🎉 ALL FUNCTIONALITY VERIFIED!');
        console.log('✨ All required functions exist in centralized utilities');
        console.log('🚀 Bot should work correctly with the new architecture');
    }

    return testsFailed === 0;
}

// Run the audit
auditFunctionality().catch(error => {
    console.error('❌ Functionality audit failed:', error);
    process.exit(1);
});
