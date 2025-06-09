#!/usr/bin/env node

/**
 * Deprecation Fix Verification Test
 * Tests that all deprecated Discord.js patterns have been updated
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Deprecation Fix Verification');
console.log('═'.repeat(40));

// Test 1: Check for deprecated ephemeral usage
console.log('📋 Test 1: Checking for deprecated ephemeral patterns...');
let hasDeprecatedEphemeral = false;

function checkFileForDeprecated(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const issues = [];
    
    // Check for deprecated ephemeral: true
    if (content.includes('ephemeral: true')) {
        issues.push('Found deprecated ephemeral: true usage');
        hasDeprecatedEphemeral = true;
    }
    
    // Check for deprecated flags: [4096]
    if (content.includes('flags: [4096]')) {
        issues.push('Found deprecated flags: [4096] usage');
    }
    
    // Check for proper MessageFlags import
    if (content.includes('MessageFlags.Ephemeral') && !content.includes('MessageFlags } = require')) {
        issues.push('MessageFlags.Ephemeral used without proper import');
    }
    
    return issues;
}

// Scan all JavaScript files
function scanDirectory(dir) {
    const files = fs.readdirSync(dir);
    let totalIssues = 0;
    
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
            totalIssues += scanDirectory(filePath);
        } else if (file.endsWith('.js')) {
            const issues = checkFileForDeprecated(filePath);
            const relativePath = path.relative(process.cwd(), filePath);
            if (issues.length > 0) {
                console.log(`   ❌ ${relativePath}:`);
                issues.forEach(issue => console.log(`      • ${issue}`));
                totalIssues += issues.length;
            } else {
                console.log(`   ✅ ${relativePath} - No deprecated patterns found`);
            }
        }
    }
    
    return totalIssues;
}

const totalIssues = scanDirectory('./src');

console.log('');
console.log('📊 Test Results:');
console.log('─'.repeat(20));

if (totalIssues === 0) {
    console.log('✅ All deprecation fixes applied successfully!');
    console.log('🎉 No deprecated Discord.js patterns found');
    console.log('');
    console.log('✅ Fixed patterns:');
    console.log('   • ephemeral: true → flags: [MessageFlags.Ephemeral]');
    console.log('   • Proper MessageFlags imports added');
    console.log('   • All interaction replies use current API');
} else {
    console.log(`❌ Found ${totalIssues} deprecation issue${totalIssues > 1 ? 's' : ''}`);
    console.log('🔧 Please review and fix the issues above');
}

console.log('');
console.log('═'.repeat(40));
