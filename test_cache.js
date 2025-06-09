#!/usr/bin/env node

// Simple test script to verify cache functionality
const path = require('path');
const queryCache = require('./src/utils/queryCache');

console.log('🧪 Testing Query Cache System...\n');

// Test basic cache operations
console.log('1. Setting cache entries...');
queryCache.set('test:user1', { name: 'Alice', points: 100 }, 'userStats');
queryCache.set('test:user2', { name: 'Bob', points: 200 }, 'userStats');
queryCache.set('leaderboard:monthly', [{ rank: 1, name: 'Alice' }], 'leaderboard');

console.log('2. Getting cache entries...');
console.log('   User 1:', queryCache.get('test:user1'));
console.log('   User 2:', queryCache.get('test:user2'));
console.log('   Leaderboard:', queryCache.get('leaderboard:monthly'));

console.log('3. Cache statistics:');
const stats = queryCache.getStats();
console.log(`   - Size: ${stats.size} entries`);
console.log(`   - Memory: ${stats.memoryUsage}`);
console.log(`   - Hit rate: ${stats.hitRate}`);
console.log(`   - Hits: ${stats.hits}, Misses: ${stats.misses}`);

console.log('4. Testing cache miss...');
const missed = queryCache.get('nonexistent:key');
console.log('   Non-existent key result:', missed);

console.log('5. Updated statistics after miss:');
const stats2 = queryCache.getStats();
console.log(`   - Hit rate: ${stats2.hitRate}`);
console.log(`   - Hits: ${stats2.hits}, Misses: ${stats2.misses}`);

console.log('6. Testing pattern deletion...');
queryCache.deletePattern('test:*');
console.log('   Deleted test:* pattern');

console.log('7. Final cache state:');
const stats3 = queryCache.getStats();
console.log(`   - Size: ${stats3.size} entries`);
console.log('   - Remaining entries:', Object.keys(queryCache.cache));

console.log('\n✅ Cache test completed successfully!');
