# Timezone-Aware Reset Central Service Implementation Plan

## 🛠️ MANDATORY NPM PACKAGE USAGE REQUIREMENTS

Before implementing ANY timezone or scheduling functionality, you MUST use existing installed packages:

### 📦 **Required Package Usage**
- **`dayjs@1.11.13`** with timezone plugin: ALL date/time calculations, timezone conversions, DST handling
- **`node-cron@4.1.0`**: ALL scheduling (hourly/daily/monthly resets), NO custom timers
- **`winston@3.17.0`**: ALL logging (structured JSON logs), NO console.log
- **`pg@8.16.0`**: ALL database operations with connection pooling
- **`dotenv@16.5.0`**: ALL environment variable loading

### ⚠️ **Package Usage Audit Checklist**
**BEFORE coding any timezone feature:**
1. ✅ Check if `dayjs.tz()` can handle the timezone conversion
2. ✅ Check if `node-cron` can schedule the reset timing
3. ✅ Check if `winston` can log the operation
4. ✅ Use `pg.Pool` for database connections
5. ⛔ **NEVER** write custom date math, custom schedulers, or manual timezone calculations

### 🔍 **Current Package Usage Status**
- ✅ **dayjs**: ✅ Used in TimezoneService, VoiceService, DB operations
- ✅ **winston**: ✅ Used in CentralResetService for structured logging
- ✅ **node-cron**: ✅ Used in CentralResetService for reset scheduling
- ✅ **pg**: ✅ Used throughout with connection pooling
- ⚠️ **Missing**: `dailyLimitUtils.js` and `timeUtils.js` NOT using timezone-aware dayjs
- ⚠️ **Missing**: Commands NOT using dayjs for timezone display

### 📋 **Package Integration Requirements for Phase 4**
1. **Replace ALL** manual date calculations in utilities with `dayjs.tz()`
2. **Ensure ALL** user-facing time displays use user's timezone via `dayjs.tz()`
3. **Validate ALL** scheduling uses `node-cron` patterns
4. **Confirm ALL** error logging uses `winston` structured format
5. **Audit ALL** database operations use `pg.Pool` connections

---

## Overview
This document outlines the implementation plan for a centralized service that handles timezone-aware resets for the Discord bot, enabling users in different timezones to have their daily/weekly/monthly resets occur at appropriate local times.

## Requirements Analysis (Based on User Specifications)

### Core Timezone-Aware Functionalities

#### 1. **Streak System** (User Timezone Dependent)
- **Requirement**: User joins voice channel daily to maintain streak
- **Reset Logic**: Streak resets to 0 if user misses a day in their local timezone
- **Current Implementation**: Partially implemented in `voiceService.js` with global timezone logic
- **Edge Cases**:
  - User changes timezone mid-streak (preserve or reset streak?)
  - Daylight saving time transitions affecting streak calculation
  - Users joining at 11:59 PM then again at 12:01 AM same local day

#### 2. **15-Hour Daily Limit** (User Timezone Dependent)
- **Requirement**: Users stop gaining points after 15 hours in voice channel
- **Reset Logic**: Limit resets at user's local midnight
- **Current Implementation**: Implemented in `voiceService.js`, `dailyLimitUtils.js` but with global timing
- **Edge Cases**:
  - User changes timezone during active voice session
  - Session crossing midnight boundary in user's timezone
  - Server downtime during user's local midnight

#### 3. **Daily User Stats** (User Timezone Dependent)
- **Requirement**: Track daily voice hours and points earned, reset at user's local midnight
- **Reset Logic**: Daily stats reset to 0 at user's local midnight
- **Current Implementation**: `daily_voice_stats` table exists but uses server timezone
- **Edge Cases**:
  - Historical data migration when user changes timezone
  - Stats aggregation across different user timezones
  - Leap seconds and DST transitions

#### 4. **Daily Leaderboard** (Global Timezone - NOT User Dependent)
- **Requirement**: Global daily leaderboard resets at predefined server timezone
- **Reset Logic**: All house points reset at server-defined time (e.g., UTC midnight)
- **Current Implementation**: Exists in `monthlyResetService.js`
- **Edge Cases**:
  - Ensuring consistency during reset window
  - Handling concurrent updates during reset

#### 5. **Monthly Leaderboard** (Global Timezone)
- **Requirement**: Monthly reset of total points/hours at 1st of each month
- **Reset Logic**: Global reset at server-defined timezone
- **Current Implementation**: ✅ Already implemented in `monthlyResetService.js`
- **Edge Cases**: Already handled properly

#### 6. **User Monthly Reset** (User Timezone Dependent)
- **Requirement**: Individual user points and voice hours reset monthly
- **Reset Logic**: Reset at 1st of month in user's local timezone
- **Current Implementation**: Global monthly reset exists
- **Edge Cases**:
  - Users in timezones that enter new month at different times
  - February 28/29 edge cases
  - Year-end transitions

## Current State Analysis

### ✅ **Existing Infrastructure (Ready for Extension)**
- **Database Foundation**: Robust PostgreSQL setup with connection pooling, resilience, and optimization
- **Time Libraries**: `dayjs` 1.11.13 with timezone plugin loaded in `timezoneService.js`
- **Service Architecture**: BaseService pattern with fallback mechanisms and error handling
- **Caching System**: Query cache with pattern-based invalidation
- **Performance Monitoring**: Database operation monitoring and optimization
- **Materialized Views**: Optimized views for leaderboards and user stats

### 🟡 **Current Reset Implementation (Needs Migration)**

#### Global Daily Resets (Server Timezone):
- **Location**: `src/utils/dailyTaskManager.js` - `checkMidnightCleanup()` at 00:00 UTC
- **Functionality**:
  - Archives daily voice stats for users not currently in voice
  - Handles active voice session crossovers during midnight
  - Clears task-related caches
  - Processes pending task cleanup
- **Status**: ✅ Working but timezone-unaware

#### Individual User Streak Management:
- **Location**: `src/services/voiceService.js` - `updateStreak()` and `checkAllStreaks()`
- **Functionality**:
  - Increments streak on daily voice session
  - Resets streaks for users who missed yesterday (based on `daily_voice_stats` table)
  - Uses global day calculation (`dayjs().subtract(1, 'day').format('YYYY-MM-DD')`)
- **Status**: 🔴 Needs timezone awareness for user-specific daily boundaries

#### Daily Voice Limit Enforcement:
- **Location**: `src/services/voiceService.js` - `calculateAndAwardPoints()` and `getUserDailyTime()`
- **Functionality**:
  - Enforces 15-hour daily limit based on `daily_voice_stats` table
  - Daily stats reset handled by `dailyTaskManager.js`
  - Points calculation uses daily cumulative system with 55-minute rounding
- **Status**: 🔴 Needs timezone-aware daily boundary detection

#### Monthly User Resets:
- **Location**: `src/services/monthlyResetService.js` - `checkAllUsersForReset()`
- **Functionality**:
  - Resets monthly points/hours using `checkAndPerformMonthlyReset()`
  - Runs hourly check for users needing reset
  - Uses server timezone for month boundaries
- **Status**: 🔴 Needs user timezone-aware monthly boundaries

#### Global Leaderboard Resets:
- **Location**: `src/services/monthlyResetService.js` (monthly) + daily through `dailyTaskManager.js`
- **Functionality**:
  - Monthly: Resets house points and user monthly stats
  - Daily: Archives completed daily stats
- **Status**: ✅ Should remain global timezone (as specified)

### ❌ **Missing Components**

#### Database Schema:
- No `timezone` column in `users` table
- No timezone-aware reset tracking fields
- No indexes for timezone-based queries

#### Timezone Service:
- **Current**: `src/services/timezoneService.js` has basic get/set methods
- **Missing**: Bulk operations, DST handling, timezone change migration
- **Missing**: Integration with reset scheduling

#### Central Scheduling:
- **Missing**: Timezone-aware cron scheduling using `node-cron`
- **Missing**: Batch processing for users in same timezone
- **Missing**: Recovery mechanisms for missed resets

### 🔧 **Current Reset Flow Analysis**

**Daily Reset Flow (00:00 Server Time)**:
1. `dailyTaskManager.checkMidnightCleanup()` triggers
2. `resetDailyVoiceStats()` processes all active voice users
3. `handleMidnightCrossover()` splits sessions at midnight boundary
4. Archives yesterday's `daily_voice_stats` for non-voice users
5. Clears voice-related caches
6. `monthlyResetService.checkAllUsersForReset()` calls `voiceService.checkAllStreaks()`

**Monthly Reset Flow (1st of Month)**:
1. `monthlyResetService.checkAllUsersForReset()` runs hourly
2. `checkAndPerformMonthlyReset()` resets monthly stats to all-time
3. Updates `last_monthly_reset` timestamp
4. Invalidates user caches

**Streak Validation Flow**:
1. `voiceService.checkAllStreaks()` queries users with streaks > 0
2. Checks if they have `daily_voice_stats` entry for yesterday with ≥15 minutes
3. Batch resets streaks for users who missed yesterday

### 📊 **Performance Characteristics**
- **Current Daily Reset**: ~2-5 minutes for 4000 users during midnight
- **Current Monthly Reset**: Processes users gradually over days
- **Streak Check**: Efficient batch processing with single query + batch updates
- **Database Load**: Well-optimized with materialized views and caching

## Central Service Architecture Need
**Why centralization is critical:**
1. **Eliminate Duplication**: Multiple services currently implement reset logic separately
2. **Data Consistency**: Ensure all timezone-dependent operations use same timing source
3. **Performance**: Batch timezone calculations and database operations
4. **Maintainability**: Single source of truth for all time-based operations
5. **Fault Tolerance**: Centralized error handling and recovery mechanisms

## Implementation Strategy

### Phase 1: Database Schema Extensions
**Files to modify**: `src/models/db.js`

**Tasks:**
- [ ] Add `timezone` VARCHAR(50) DEFAULT 'UTC' to users table
- [ ] Add `timezone_set_at` TIMESTAMP to users table
- [ ] Add `last_daily_reset` TIMESTAMP to users table
- [ ] Add `last_monthly_reset_tz` TIMESTAMP to users table (separate from global)
- [ ] Create indexes for timezone-based queries

**SQL Migration:**
```sql
-- Add timezone support to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'UTC';
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone_set_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_daily_reset TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_monthly_reset_tz TIMESTAMP;

-- Create performance indexes
CREATE INDEX IF NOT EXISTS idx_users_timezone ON users(timezone);
CREATE INDEX IF NOT EXISTS idx_users_daily_reset ON users(last_daily_reset);
CREATE INDEX IF NOT EXISTS idx_users_timezone_reset ON users(timezone, last_daily_reset);
```

### Phase 2: Complete TimezoneService Implementation
**Files to modify**: `src/services/timezoneService.js`

**Tasks:**
- [x] Basic timezone get/set functionality (partially done)
- [ ] Complete timezone validation with comprehensive IANA support
- [ ] Add timezone-aware reset scheduling methods
- [ ] Implement batch timezone operations for performance
- [ ] Add timezone change handling logic
- [ ] Add DST transition detection and handling

**New Methods to Add:**
- `batchGetUserTimezones(userIds)` - Bulk timezone retrieval
- `getUsersInTimezone(timezone)` - Get users in specific timezone
- `getUsersNeedingReset(resetType)` - Get users requiring reset
- `handleTimezoneChange(userId, oldTz, newTz)` - Migration logic
- `isDSTTransition(timezone, date)` - DST detection

### Phase 3: Central Reset Scheduler Service
**Files to create**: `src/services/centralResetService.js`

**Purpose**: Replace distributed reset logic with centralized, timezone-aware system

**Key Features:**
- Timezone-aware cron scheduling using `node-cron`
- Batch processing for performance
- Fault tolerance with retry mechanisms
- Comprehensive logging with `winston`

**Architecture:**
```javascript
class CentralResetService {
    // Daily resets (user timezone dependent)
    scheduleDailyResets()     // 15-hour limit, daily stats, streaks

    // Monthly resets (user timezone dependent)
    scheduleMonthlyResets()   // User monthly stats

    // Global resets (server timezone)
    scheduleGlobalResets()    // Daily/monthly leaderboards

    // Batch processing
    processBatchResets(resetType, users)

    // Recovery mechanisms
    recoverMissedResets()
}
```

### Phase 4: Service Integration and Migration
**Files to modify extensively:**

#### Core Services:
- `src/services/voiceService.js` - Remove local reset logic, integrate with central service
- `src/services/monthlyResetService.js` - Migrate to central service, keep global resets only
- `src/utils/dailyTaskManager.js` - Integrate with timezone-aware resets

#### Database Models:
- `src/models/db.js` - Add timezone-aware query methods, update migration system

#### Command Handlers:
- `src/commands/stats.js` - Use timezone-aware data retrieval
- `src/commands/leaderboard.js` - Separate user vs global timezone logic
- `src/commands/time.js` - Add timezone setting functionality

#### Utilities:
- `src/utils/timeUtils.js` - Add timezone-aware utility functions
- `src/utils/dailyLimitUtils.js` - Make timezone-aware
- `src/utils/cacheInvalidationService.js` - Handle timezone-based cache keys

### Phase 5: Command Interface for Timezone Management
**Files to create/modify:**

**New Command**: `src/commands/timezone.js`
- Set user timezone: `/timezone set America/New_York`
- Get user timezone: `/timezone get`
- List popular timezones: `/timezone list`
- Reset to server timezone: `/timezone reset`

**Modify**: `src/commands/stats.js`
- Show timezone in user stats
- Add timezone-aware time displays

**Modify**: `src/register-commands.js`
- Register new timezone commands

## Migration Strategy (Detailed Implementation Plan)

### 🎯 **Phase 1: Database Schema Extension (Week 1)**

**Add timezone columns to users table**:
```sql
-- Execute in src/models/db.js migration system
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'UTC';
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone_set_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_daily_reset TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_monthly_reset_tz TIMESTAMP;

-- Performance indexes for timezone queries
CREATE INDEX CONCURRENTLY idx_users_timezone ON users(timezone);
CREATE INDEX CONCURRENTLY idx_users_daily_reset_tz ON users(last_daily_reset_tz);
CREATE INDEX CONCURRENTLY idx_users_timezone_daily ON users(timezone, last_daily_reset_tz);
```

**Modify Files**:
- `src/models/db.js` - Add migration in `runMigrations()` function
- Test with existing 4000+ user database

**Validation**:
- All existing users default to 'UTC' timezone
- No service disruption during migration
- Verify indexes created successfully

### 🎯 **Phase 2: Complete TimezoneService (Week 1-2)**

**Extend `src/services/timezoneService.js`**:

**Add missing methods**:
```javascript
// Bulk operations for performance
async batchGetUserTimezones(userIds) { /* Implementation */ }
async getUsersInTimezone(timezone) { /* Implementation */ }
async getUsersNeedingDailyReset() { /* Implementation */ }
async getUsersNeedingMonthlyReset() { /* Implementation */ }

// DST and timezone change handling
async handleTimezoneChange(userId, oldTz, newTz) { /* Implementation */ }
async isDSTTransitionDay(timezone, date) { /* Implementation */ }
async getNextResetTimeForUser(userId, resetType) { /* Implementation */ }

// Timezone-aware time calculations
async isUserMidnight(userId, tolerance = 60000) { /* Implementation */ }
async convertUserTimeToUTC(userId, localTime) { /* Implementation */ }
async getTodayInUserTimezone(userId) { /* Implementation */ }
```

**Create timezone management command**:
- `src/commands/timezone.js` - New command file
- `/timezone set <timezone>` - Set user timezone with validation
- `/timezone get` - Show current timezone
- `/timezone list` - Show popular timezones
- `/timezone reset` - Reset to UTC

### 🎯 **Phase 3: Central Reset Service Implementation (Week 2-3)**

**Create `src/services/centralResetService.js`**:

```javascript
class CentralResetService extends BaseService {
    constructor() {
        super('CentralResetService');
        this.resetSchedulers = new Map(); // Track active schedulers
        this.isRunning = false;
    }

    // Main scheduler - runs every minute to check for reset windows
    async start() {
        this.cronJob = cron.schedule('* * * * *', async () => {
            await this.checkTimezonedResets();
        });
        this.isRunning = true;
    }

    // Check all timezones for users needing resets
    async checkTimezonedResets() {
        // 1. Get unique timezones from active users
        // 2. For each timezone, check if it's midnight (daily) or 1st of month (monthly)
        // 3. Batch process users in same timezone
        // 4. Handle edge cases (DST transitions, timezone changes)
    }

    // Daily reset methods (replace dailyTaskManager logic)
    async processDailyReset(timezone, usersInTimezone) { /* Implementation */ }
    async handleUserDailyReset(userId, timezone) { /* Implementation */ }
    async resetUserDailyStats(userId) { /* Implementation */ }
    async checkUserStreak(userId, localDate) { /* Implementation */ }

    // Monthly reset methods (replace monthlyResetService logic)
    async processMonthlyReset(timezone, usersInTimezone) { /* Implementation */ }
    async handleUserMonthlyReset(userId, timezone) { /* Implementation */ }

    // Recovery and fault tolerance
    async recoverMissedResets() { /* Implementation */ }
    async validateResetIntegrity() { /* Implementation */ }
}
```

**Integration Strategy**:
- Run in parallel with existing services initially
- Log all operations for comparison
- Add feature flag to enable/disable timezone-aware resets

**Integration Strategy**:
- Run in parallel with existing services initially
- Log all operations for comparison
- Add feature flag to enable/disable timezone-aware resets

---

## 🎯 **CORRECTED PHASE ORGANIZATION**

After reviewing implementation status, here's the proper phase structure:

### ✅ **COMPLETED PHASES**

#### Phase 1: Database Schema Extensions (100% Complete)
- ✅ Added timezone columns to users table
- ✅ Created performance indexes  
- ✅ Database backup completed
- ✅ Timezone commands created and registered

#### Phase 2: Complete TimezoneService Implementation (85% Complete)
- ✅ Basic timezone get/set functionality
- ✅ CentralResetService framework with node-cron and winston
- ✅ Service integration into main bot
- ⚠️ **MISSING**: DST handling, timezone change methods

#### Phase 3: Central Reset Scheduler Service (85% Complete)
- ✅ Basic scheduling framework implemented
- ✅ Daily reset logic working (tested: 18 users in 14ms)
- ⚠️ **MISSING**: Complete monthly reset timezone logic
- ⚠️ **MISSING**: Edge case handling (DST transitions)

#### Phase 4: Service Integration and Migration (65% Complete)
- ✅ VoiceService partially updated for timezone awareness
- ✅ Core methods use user timezone
- ⚠️ **MISSING**: Utility files NOT timezone-aware (CRITICAL bug)
- ⚠️ **MISSING**: Command interfaces lack timezone display

#### Phase 5: Command Interface for Timezone Management (100% Complete)
- ✅ `/timezone` command implemented with set/get/list functionality
- ✅ Commands registered with Discord API
- ✅ Basic timezone management working

---

### 🔴 **REMAINING PHASES TO IMPLEMENT**

### Phase 6: Critical Gap Completion & NPM Package Integration
**Timeline**: 4 weeks
**Priority**: HIGH - Fixes critical dailyLimitUtils.js timezone bug affecting point calculations

#### **Phase 6.1: Critical TimezoneService Methods (Week 1)**
**Files to modify**: `src/services/timezoneService.js`
**Priority**: CRITICAL

**6.1.1: Handle Timezone Changes**
```javascript
/**
 * Handle user timezone change with data preservation
 * MUST use dayjs.tz() for all timezone calculations
 */
async handleTimezoneChange(userId, oldTimezone, newTimezone) {
    // 1. Validate new timezone using dayjs.tz.names()
    // 2. Preserve active voice session in old timezone
    // 3. Migrate daily stats if same calendar day
    // 4. Update streak preservation logic
    // 5. Log change with winston structured logging
}
```

**6.1.2: DST Transition Detection**
```javascript
/**
 * Detect DST transitions using dayjs timezone data
 * MUST use dayjs.tz() DST detection capabilities
 */
async isDSTTransition(timezone, date) {
    // Use dayjs.tz() to detect DST transitions
    // Return transition type: 'spring_forward', 'fall_back', or null
}
```

#### **Phase 6.2: Utility Files Timezone Integration (Week 1-2)**
**Priority**: CRITICAL - dailyLimitUtils affects all point calculations

**6.2.1: Fix dailyLimitUtils.js (CRITICAL)**
**Files to modify**: `src/utils/dailyLimitUtils.js`
**Issue**: Currently uses server timezone `dayjs().endOf('day')` causing wrong midnight for users

```javascript
// BEFORE (BROKEN - server timezone):
const endOfDay = dayjs().endOf('day');

// AFTER (FIXED - user timezone):
function calculateDailyLimitInfo(dailyHours, userTimezone, dailyLimitHours = 15) {
    const now = dayjs().tz(userTimezone);
    const endOfDay = now.endOf('day');
    // ... rest of logic
}
```

**6.2.2: Make timeUtils.js Timezone-Aware**
**Files to modify**: `src/utils/timeUtils.js`
- Add timezone parameters to all functions
- Use dayjs.tz() for timezone-aware calculations

**6.2.3: Update Cache Keys for Timezone Context**
**Files to modify**: `src/utils/cacheInvalidationService.js`
- Include timezone in cache keys
- Handle timezone change cache invalidation

#### **Phase 6.3: Command Interface Enhancement (Week 2-3)**

**6.3.1: Update Stats Command with Timezone Display**
**Files to modify**: `src/commands/stats.js`
```javascript
// Add timezone information to user stats
const userTimezone = await timezoneService.getUserTimezone(user.id);
const localTime = dayjs().tz(userTimezone).format('HH:mm');

// Show next reset in user timezone
const nextDailyReset = await timezoneService.getNextResetTime(user.id, 'daily');
```

**6.3.2: Update Leaderboard with Timezone Context**
**Files to modify**: `src/commands/leaderboard.js`
- Add timezone context to footer
- Show reset countdown in user timezone

#### **Phase 6.4: Edge Case Handling (Week 3)**

**6.4.1: DST Transition Handling**
**Files to modify**: `src/services/centralResetService.js`
- Handle spring forward (2 AM doesn't exist)
- Handle fall back (2 AM occurs twice)
- Use dayjs.tz() for DST detection

**6.4.2: Timezone Changes During Active Sessions**
**Files to modify**: `src/services/voiceService.js`
- Complete session in old timezone
- Start new session in new timezone
- Preserve session data integrity

### Phase 7: Production Resilience & Monitoring
**Timeline**: 1 week
**Priority**: MEDIUM

#### **Phase 7.1: Enhanced Error Handling**
- Comprehensive winston logging for all timezone operations
- Graceful fallback to UTC on timezone failures
- Structured error messages for debugging

#### **Phase 7.2: Performance Monitoring**
- Track timezone reset performance metrics
- Monitor database query performance
- Alert on reset processing delays

### Phase 8: Testing & Validation
**Timeline**: 1 week  
**Priority**: HIGH

#### **Phase 8.1: NPM Package Usage Audit**
```bash
# Validate no custom implementations exist
grep -r "new Date()" src/ | grep -v node_modules
grep -r "setInterval\|setTimeout" src/ | grep -v node_modules
grep -r "console\.log" src/ | grep -v node_modules
```

#### **Phase 8.2: Edge Case Testing Suite**
**Files to create**: `src/tests/timezone-edge-cases.test.js`
- DST spring forward/fall back transitions
- Timezone changes during active sessions
- February 29th leap year handling
- Extreme timezone offsets (UTC+14, UTC-12)

#### **Phase 8.3: Integration Testing**
- Test complete user timezone change flow
- Validate reset processing across all timezones
- Verify no data loss during edge cases

---

## 🎯 **IMPLEMENTATION ROADMAP**

### **IMMEDIATE PRIORITY** (Phase 6.1-6.2: Weeks 1-2)
1. **Critical Fix**: `dailyLimitUtils.js` timezone bug (affects all point calculations)
2. **Missing Methods**: `handleTimezoneChange()` and `isDSTTransition()` in TimezoneService
3. **Utility Integration**: Make `timeUtils.js` timezone-aware

### **USER EXPERIENCE** (Phase 6.3: Week 3)  
4. **Stats Command**: Show user timezone and reset times
5. **Leaderboard Context**: Add timezone information to global leaderboards

### **PRODUCTION READY** (Phase 6.4-8: Weeks 4-6)
6. **Edge Cases**: DST transitions, timezone changes during sessions
7. **Monitoring**: Performance metrics and error handling
8. **Testing**: Comprehensive edge case test suite

### **SUCCESS CRITERIA**
- ✅ No point calculation errors due to wrong timezone
- ✅ Users can change timezone without losing data
- ✅ DST transitions handled automatically
- ✅ All time displays show in user's timezone
- ✅ System performance unchanged
- ✅ Complete fallback to UTC on errors

---
