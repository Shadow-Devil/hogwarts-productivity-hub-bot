#!/usr/bin/env node

/**
 * Comprehensive test script to validate centralized code cleanup
 * Run this manually to verify all new utilities are working correctly
 */

const path = require('path');
const fs = require('fs');

console.log('🔍 CENTRALIZED CODE CLEANUP VALIDATION TEST');
console.log('='.repeat(50));

// Test results tracking
let testsPassed = 0;
let testsFailed = 0;
const issues = [];

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
        issues.push({ test: testName, details });
    }
}

function testFileExists(filePath, testName) {
    const exists = fs.existsSync(filePath);
    logTest(testName, exists, exists ? 'File found' : `File missing: ${filePath}`);
    return exists;
}

function testImportWorks(filePath, testName) {
    try {
        const module = require(filePath);
        const hasExports = module && (typeof module === 'object' || typeof module === 'function');
        logTest(testName, hasExports, hasExports ? 'Module loads successfully' : 'Module has no exports');
        return hasExports;
    } catch (error) {
        logTest(testName, false, `Import failed: ${error.message}`);
        return false;
    }
}

function testFileContains(filePath, searchTerms, testName) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const foundAll = searchTerms.every(term => content.includes(term));
        const foundTerms = searchTerms.filter(term => content.includes(term));

        logTest(testName, foundAll,
            foundAll ? `All ${searchTerms.length} terms found` :
            `Found ${foundTerms.length}/${searchTerms.length} terms: ${foundTerms.join(', ')}`
        );
        return foundAll;
    } catch (error) {
        logTest(testName, false, `File read error: ${error.message}`);
        return false;
    }
}

function testFileDoesNotContain(filePath, searchTerms, testName) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const foundTerms = searchTerms.filter(term => content.includes(term));
        const success = foundTerms.length === 0;

        logTest(testName, success,
            success ? `No deprecated terms found` :
            `Found deprecated terms: ${foundTerms.join(', ')}`
        );
        return success;
    } catch (error) {
        logTest(testName, false, `File read error: ${error.message}`);
        return false;
    }
}

async function runTests() {
    console.log('\n📁 TESTING NEW CENTRALIZED UTILITY FILES');
    console.log('-'.repeat(40));

    // Test 1: Check all new utility files exist
    testFileExists('./src/utils/dailyLimitUtils.js', 'Daily Limit Utils exists');
    testFileExists('./src/utils/timeUtils.js', 'Time Utils exists');
    testFileExists('./src/utils/baseService.js', 'Base Service exists');
    testFileExists('./src/utils/cacheInvalidationService.js', 'Cache Invalidation Service exists');
    testFileExists('./src/services/monthlyResetService.js', 'Monthly Reset Service exists');

    console.log('\n📦 TESTING MODULE IMPORTS');
    console.log('-'.repeat(40));

    // Test 2: Check all new utilities can be imported
    testImportWorks('./src/utils/dailyLimitUtils.js', 'Daily Limit Utils imports');
    testImportWorks('./src/utils/timeUtils.js', 'Time Utils imports');
    testImportWorks('./src/utils/baseService.js', 'Base Service imports');
    testImportWorks('./src/utils/cacheInvalidationService.js', 'Cache Invalidation Service imports');
    testImportWorks('./src/services/monthlyResetService.js', 'Monthly Reset Service imports');

    console.log('\n🔄 TESTING SERVICE INTEGRATION');
    console.log('-'.repeat(40));

    // Test 3: Check VoiceService uses centralized utilities
    testFileContains('./src/services/voiceService.js', [
        'require(\'../utils/dailyLimitUtils\')',
        'require(\'../utils/timeUtils\')',
        'require(\'../utils/cacheInvalidationService\')',
        'calculateDailyLimitInfo',
        'CacheInvalidationService.invalidateAfterVoiceOperation'
    ], 'VoiceService uses centralized utilities');

    // Test 4: Check TaskService uses centralized utilities
    testFileContains('./src/services/taskService.js', [
        'extends BaseService',
        'require(\'../utils/cacheInvalidationService\')',
        'CacheInvalidationService.invalidateAfterTaskOperation'
    ], 'TaskService uses centralized utilities');

    // Test 5: Check main index.js uses new monthly reset service
    testFileContains('./src/index.js', [
        'require(\'./services/monthlyResetService\')',
        'monthlyResetService.start',
        'monthlyResetService.stop'
    ], 'Main app uses new monthly reset service');

    console.log('\n🧹 TESTING DUPLICATE CODE ELIMINATION');
    console.log('-'.repeat(40));

    // Test 6: Check duplicate functions are removed from VoiceService
    testFileDoesNotContain('./src/services/voiceService.js', [
        'roundHoursFor55MinRule() {',
        'roundHoursForPoints() {'
    ], 'Duplicate rounding functions removed from VoiceService');

    // Test 7: Check old cache invalidation calls are replaced
    testFileDoesNotContain('./src/services/voiceService.js', [
        'queryCache.invalidateUserRelatedCache('
    ], 'Old cache invalidation removed from VoiceService');

    testFileDoesNotContain('./src/services/taskService.js', [
        'queryCache.invalidateUserRelatedCache('
    ], 'Old cache invalidation removed from TaskService');

    console.log('\n⚙️ TESTING OPTIMIZED/FALLBACK PATTERN');
    console.log('-'.repeat(40));

    // Test 8: Check services use optimized/fallback pattern
    testFileContains('./src/services/voiceService.js', [
        'extends BaseService',
        'executeWithFallback(',
        'getUserStatsOptimized',
        'getUserStatsOriginal'
    ], 'VoiceService uses optimized/fallback pattern');

    testFileContains('./src/services/taskService.js', [
        'extends BaseService',
        'executeWithFallback(',
        'getTaskStatsOptimized',
        'getTaskStatsOriginal'
    ], 'TaskService uses optimized/fallback pattern');

    console.log('\n🗂️ TESTING FILE CLEANUP');
    console.log('-'.repeat(40));

    // Test 9: Check old monthly reset file handling
    if (testFileExists('./src/utils/monthlyReset.js', 'Old monthly reset file exists (should redirect)')) {
        testFileContains('./src/utils/monthlyReset.js', [
            'DEPRECATED',
            'require(\'../services/monthlyResetService\')'
        ], 'Old monthly reset file redirects to new service');
    }

    console.log('\n🏗️ TESTING STATS COMMAND INTEGRATION');
    console.log('-'.repeat(40));

    // Test 10: Check stats command uses centralized utilities
    testFileContains('./src/commands/stats.js', [
        'require(\'../utils/dailyLimitUtils\')',
        'require(\'../utils/timeUtils\')',
        'formatDailyLimitStatus',
        'formatHours'
    ], 'Stats command uses centralized utilities');

    console.log('\n🔧 TESTING DAILY TASK MANAGER CLEANUP');
    console.log('-'.repeat(40));

    // Test 11: Check dailyTaskManager uses centralized cache invalidation
    testFileContains('./src/utils/dailyTaskManager.js', [
        'require(\'./cacheInvalidationService\')',
        'CacheInvalidationService.invalidateAfterTaskOperation'
    ], 'DailyTaskManager uses centralized cache invalidation');

    testFileDoesNotContain('./src/utils/dailyTaskManager.js', [
        'queryCache.invalidateUserRelatedCache('
    ], 'DailyTaskManager old cache calls removed');

    console.log('\n📊 FINAL RESULTS');
    console.log('='.repeat(50));

    const totalTests = testsPassed + testsFailed;
    const successRate = totalTests > 0 ? Math.round((testsPassed / totalTests) * 100) : 0;

    console.log(`Total Tests Run: ${totalTests}`);
    console.log(`✅ Passed: ${testsPassed}`);
    console.log(`❌ Failed: ${testsFailed}`);
    console.log(`Success Rate: ${successRate}%`);

    if (issues.length > 0) {
        console.log('\n❌ ISSUES FOUND:');
        console.log('-'.repeat(30));
        issues.forEach((issue, index) => {
            console.log(`${index + 1}. ${issue.test}`);
            console.log(`   ${issue.details}`);
        });
    }

    if (testsFailed === 0) {
        console.log('\n🎉 ALL TESTS PASSED! Code cleanup is successful.');
        console.log('✨ The bot should now use centralized utilities without duplication.');
    } else {
        console.log('\n⚠️ Some tests failed. Please review the issues above.');
    }

    console.log('\n📝 NEXT STEPS:');
    console.log('1. Review any failed tests above');
    console.log('2. Run the bot with: npm start');
    console.log('3. Test key commands: /stats, /addtask, /completetask');
    console.log('4. Monitor console output for any errors');

    return testsFailed === 0;
}

// Run the tests
runTests().catch(error => {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
});
