# Timezone-Aware Reset Central Service Implementation Plan

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
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_daily_reset_tz TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_monthly_reset_tz TIMESTAMP;

-- Performance indexes for timezone queries
CREATE INDEX IF NOT EXISTS idx_users_timezone ON users(timezone);
CREATE INDEX IF NOT EXISTS idx_users_daily_reset_tz ON users(last_daily_reset_tz);
CREATE INDEX IF NOT EXISTS idx_users_timezone_daily ON users(timezone, last_daily_reset_tz);
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
async getUsersInResetWindow(resetType = 'daily') { /* Implementation */ }
```

**Create timezone management command**:
- `src/commands/timezone.js` - New command file
- `/timezone set <timezone>` - Set user timezone with validation
- `/timezone get` - Show current timezone
- `/timezone list` - Show popular timezones
- Update `src/register-commands.js`

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

### 🎯 **Phase 4: Service Integration (Week 3-4)**

**Modify `src/services/voiceService.js`**:
- **Remove**: Local reset logic from `calculateAndAwardPoints()`
- **Replace**: `getUserDailyTime()` to use timezone-aware date calculation
- **Modify**: `updateStreak()` to accept timezone parameter
- **Keep**: Core point calculation and session management unchanged

**Modify `src/utils/dailyTaskManager.js`**:
- **Keep**: Active voice session handling during crossover
- **Remove**: Global midnight detection (`checkMidnightCleanup()`)
- **Replace**: `resetDailyVoiceStats()` to be called by central service per timezone
- **Add**: Timezone parameter to all reset methods

**Modify `src/services/monthlyResetService.js`**:
- **Keep**: Global leaderboard reset functionality
- **Remove**: Individual user monthly reset logic
- **Replace**: `checkAllUsersForReset()` to only handle global operations
- **Integrate**: With central service for user-specific monthly resets

### 🎯 **Phase 5: Gradual Migration (Week 4-5)**

**Week 4 - Daily Stats Reset Migration**:
1. Enable timezone-aware daily stats reset for new timezone setters
2. Keep global reset as fallback for UTC users
3. Monitor performance and accuracy
4. Validate daily voice limits work correctly

**Week 5a - Streak System Migration**:
1. Migrate streak calculation to use user timezones
2. Handle timezone changes with streak preservation logic
3. Update `checkAllStreaks()` to process per timezone
4. Validate no streaks are lost during migration

**Week 5b - Monthly Reset Migration**:
1. Enable timezone-aware monthly resets
2. Handle users who change timezones mid-month
3. Ensure monthly leaderboards remain globally synchronized
4. Validate all-time stats accumulation

### 🎯 **Phase 6: Production Validation and Cleanup (Week 5-6)**

**Performance Validation**:
- Monitor database query performance with timezone indexes
- Validate reset processing time remains under 5 minutes globally
- Check memory usage with multiple timezone schedulers
- Ensure no degradation in voice session tracking

**Data Integrity Validation**:
- Compare timezone-aware resets with expected results
- Validate no double-counting of points or hours
- Check cache invalidation works correctly across timezones
- Ensure leaderboards remain accurate

**Cleanup Tasks**:
- Remove deprecated reset methods from individual services
- Update all references to use central service
- Remove global reset scheduling from old services
- Update documentation and add comprehensive logging

### 🎯 **Rollback Strategy**

**Safety Measures**:
- Feature flags to instantly disable timezone-aware resets
- Preserve old reset methods during migration period
- Database backup before each migration phase
- Real-time monitoring of reset accuracy

**Rollback Triggers**:
- More than 5% of users experience incorrect resets
- Database performance degrades beyond acceptable limits
- Critical bugs in timezone calculations
- User complaints about streak/point loss

**Rollback Process**:
1. Disable central reset service via feature flag
2. Re-enable original reset services
3. Restore from database backup if data corruption
4. Investigate and fix issues before retry

## Files Requiring Modification

### 🔴 **Critical Changes** (Core Logic):
- `src/services/timezoneService.js` - Complete implementation
- `src/services/centralResetService.js` - Create new service
- `src/models/db.js` - Database schema and timezone queries
- `src/services/voiceService.js` - Remove local reset logic
- `src/utils/dailyTaskManager.js` - Integrate timezone awareness

### 🟡 **Moderate Changes** (Integration):
- `src/services/monthlyResetService.js` - Keep global resets only
- `src/commands/stats.js` - Timezone-aware displays
- `src/commands/time.js` - Add timezone commands
- `src/utils/timeUtils.js` - Add timezone utilities
- `src/utils/dailyLimitUtils.js` - Make timezone-aware

### 🟢 **Minor Changes** (Enhancement):
- `src/commands/leaderboard.js` - Clarify global vs user timezones
- `src/utils/cacheInvalidationService.js` - Timezone cache keys
- `src/index.js` - Initialize central reset service
- `src/register-commands.js` - Register timezone commands

## Edge Cases and Risk Mitigation (Detailed Analysis)

### 🔄 **Timezone Change During Active Session**
**Scenario**: User changes timezone while in voice channel
**Current Risk**: Session points calculated with mixed timezone logic
**Solution Strategy**:
```javascript
async handleTimezoneChange(userId, oldTimezone, newTimezone) {
    // 1. Complete current session in old timezone
    await this.completeActiveSessionInOldTimezone(userId, oldTimezone);
    
    // 2. Start new session tracking in new timezone  
    await this.startNewSessionInNewTimezone(userId, newTimezone);
    
    // 3. Preserve streak if same calendar day in both timezones
    await this.preserveStreakIfSameDay(userId, oldTimezone, newTimezone);
    
    // 4. Update daily limit tracking for new timezone
    await this.adjustDailyLimitForNewTimezone(userId, newTimezone);
    
    // 5. Log timezone change for audit
    this.logger.info('User timezone changed during active session', {
        userId, oldTimezone, newTimezone, preservedSession: true
    });
}
```

### 🕐 **Daylight Saving Time Transitions**
**Spring Forward (2 AM → 3 AM)**: 
- **Risk**: 2 AM doesn't exist, scheduled resets fail
- **Solution**: Schedule all DST-affected resets for 3 AM on transition days
- **Implementation**: `isDSTTransitionDay()` method using dayjs timezone data

**Fall Back (2 AM → 1 AM)**:
- **Risk**: 1-2 AM occurs twice, double resets possible
- **Solution**: Use UTC timestamps for reset tracking, ignore local time ambiguity
- **Implementation**: Store `last_daily_reset_tz` as UTC timestamp

```javascript
async getNextResetTime(userId, resetType) {
    const userTimezone = await this.getUserTimezone(userId);
    const now = dayjs().tz(userTimezone);
    
    let nextReset;
    if (resetType === 'daily') {
        nextReset = now.add(1, 'day').startOf('day');
        
        // Handle DST transitions
        if (await this.isDSTTransitionDay(userTimezone, nextReset)) {
            nextReset = nextReset.hour(3); // Safe hour during DST
        }
    }
    
    return nextReset.utc(); // Always return UTC for scheduling
}
```

### 🌍 **Multiple Timezone Coordination**
**Scenario**: Users in different timezones need coordinated resets
**Risk**: Database contention, inconsistent global state
**Solution**: Staggered processing with timezone batching
```javascript
async processGlobalResets() {
    // Process timezones in order from UTC-12 to UTC+14
    const timezones = await this.getActiveTimezones();
    const sortedTimezones = this.sortTimezonesByOffset(timezones);
    
    for (const timezone of sortedTimezones) {
        const usersInTimezone = await this.getUsersInTimezone(timezone);
        
        if (this.isResetTime(timezone, 'daily')) {
            await this.processBatchDailyReset(usersInTimezone, timezone);
        }
        
        if (this.isResetTime(timezone, 'monthly')) {
            await this.processBatchMonthlyReset(usersInTimezone, timezone);
        }
        
        // Stagger processing to avoid database overload
        await this.sleep(1000); // 1 second between timezone batches
    }
}
```

### 💾 **Database Performance with Timezone Queries**
**Risk**: Complex timezone queries slow down database operations
**Mitigation Strategies**:

1. **Optimized Indexes**:
```sql
-- Composite index for timezone-based reset queries
CREATE INDEX CONCURRENTLY idx_users_timezone_reset 
ON users(timezone, last_daily_reset_tz) 
WHERE timezone != 'UTC';

-- Partial index for active timezone users only
CREATE INDEX CONCURRENTLY idx_users_active_timezone
ON users(timezone) 
WHERE timezone IS NOT NULL AND timezone != 'UTC';
```

2. **Query Optimization**:
```javascript
// Batch timezone queries instead of individual lookups
async batchGetUserTimezones(userIds) {
    const result = await pool.query(`
        SELECT discord_id, timezone, last_daily_reset_tz 
        FROM users 
        WHERE discord_id = ANY($1)
    `, [userIds]);
    
    return result.rows.reduce((acc, row) => {
        acc[row.discord_id] = row;
        return acc;
    }, {});
}
```

3. **Timezone Caching**:
```javascript
// Cache timezone data for frequently accessed users
class TimezoneCache {
    constructor() {
        this.cache = new Map();
        this.ttl = 1800000; // 30 minutes
    }
    
    async getUserTimezone(userId) {
        const cached = this.cache.get(userId);
        if (cached && (Date.now() - cached.timestamp) < this.ttl) {
            return cached.timezone;
        }
        
        const timezone = await this.fetchUserTimezone(userId);
        this.cache.set(userId, { timezone, timestamp: Date.now() });
        return timezone;
    }
}
```

### 🔄 **Server Downtime During Reset Window**
**Risk**: Missed resets due to server outage during critical reset times
**Solution**: Comprehensive recovery system
```javascript
async recoverMissedResets() {
    const recoveryStartTime = dayjs().subtract(25, 'hours'); // Check last 25 hours
    
    // Find users who should have had resets but didn't
    const missedDailyResets = await pool.query(`
        SELECT discord_id, timezone, last_daily_reset_tz
        FROM users 
        WHERE timezone IS NOT NULL
        AND (last_daily_reset_tz IS NULL OR last_daily_reset_tz < $1)
    `, [recoveryStartTime.toISOString()]);
    
    // Process missed resets in timezone order
    const groupedByTimezone = this.groupUsersByTimezone(missedDailyResets.rows);
    
    for (const [timezone, users] of groupedByTimezone) {
        for (const user of users) {
            const missedResetDates = await this.findMissedResetDates(user, timezone);
            
            for (const missedDate of missedResetDates) {
                await this.processBackdatedReset(user.discord_id, timezone, missedDate);
            }
        }
    }
    
    this.logger.warn('Missed reset recovery completed', {
        totalUsersProcessed: missedDailyResets.rows.length,
        timezonesProcessed: groupedByTimezone.size
    });
}
```

### ⚡ **Race Conditions During Reset**
**Risk**: Concurrent operations during reset window cause data inconsistency
**Solution**: Database transactions and proper locking
```javascript
async processUserReset(userId, resetType) {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Lock user row to prevent concurrent modifications
        await client.query(`
            SELECT * FROM users 
            WHERE discord_id = $1 
            FOR UPDATE
        `, [userId]);
        
        // Perform reset operations within transaction
        if (resetType === 'daily') {
            await this.performDailyResetInTransaction(client, userId);
        } else if (resetType === 'monthly') {
            await this.performMonthlyResetInTransaction(client, userId);
        }
        
        await client.query('COMMIT');
        
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}
```

### 🌐 **Edge Timezone Handling**
**Scenarios**: 
- Users in UTC+14 (Kiribati) - earliest daily reset
- Users in UTC-12 (Baker Island) - latest daily reset  
- Users setting invalid/deprecated timezones

**Solution**: Comprehensive timezone validation and normalization
```javascript
async validateAndNormalizeTimezone(timezone) {
    const validTimezones = new Set([
        // All IANA timezone identifiers
        'UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo',
        'Pacific/Kiritimati', 'Pacific/Midway', // Edge cases
        // ... comprehensive list
    ]);
    
    if (!validTimezones.has(timezone)) {
        // Attempt to normalize common variations
        const normalized = this.normalizeTimezone(timezone);
        if (normalized && validTimezones.has(normalized)) {
            return normalized;
        }
        
        throw new Error(`Invalid timezone: ${timezone}`);
    }
    
    return timezone;
}
```

### 📊 **Leap Year and Month Boundary Edge Cases**
**February 29th Issue**: 
- User sets timezone in leap year February 29th
- Next year February 29th doesn't exist
- Monthly reset date calculation fails

**Solution**: Smart date handling with dayjs
```javascript
async calculateNextMonthlyReset(userId) {
    const userTimezone = await this.getUserTimezone(userId);
    const currentTime = dayjs().tz(userTimezone);
    
    // Handle month-end edge cases
    let nextReset = currentTime.add(1, 'month').startOf('month');
    
    // If current date is Feb 29 and next year is not leap year
    if (currentTime.month() === 1 && currentTime.date() === 29) {
        nextReset = nextReset.date(1); // Always use 1st of month for consistency
    }
    
    return nextReset;
}
```

## 🔍 **Database Analysis Results**

### Current Database Schema Status:
```sql
-- EXISTING: users table structure (inspected via PostgreSQL tool)
Table "public.users"
Column          | Type                        | Current Status
----------------|-----------------------------|--------------
id              | integer                     | ✅ Primary key
discord_id      | character varying(255)      | ✅ Unique key  
username        | character varying(255)      | ✅ Present
house           | character varying(50)       | ✅ Present
monthly_points  | integer                     | ✅ Present
monthly_hours   | numeric(10,2)               | ✅ Present
all_time_points | integer                     | ✅ Present
all_time_hours  | numeric(10,2)               | ✅ Present
current_streak  | integer                     | ✅ Present
longest_streak  | integer                     | ✅ Present
last_vc_date    | date                        | ✅ Present
last_monthly_reset | date                     | ✅ Present (global timezone)
created_at      | timestamp without time zone | ✅ Present
updated_at      | timestamp without time zone | ✅ Present
timezone        | character varying(50)       | ❌ MISSING
timezone_set_at | timestamp                   | ❌ MISSING
last_daily_reset_tz | timestamp               | ❌ MISSING
last_monthly_reset_tz | timestamp             | ❌ MISSING
```

### Database Dependencies Check:
- ✅ PostgreSQL connection working (`botd_production` database)
- ✅ Existing tables: users, daily_voice_stats, vc_sessions, houses, etc.
- ✅ Materialized views: user_complete_profile, user_stats_summary
- ✅ Existing indexes optimized for current queries

### Package Dependencies Check:
```json
// EXISTING in package.json
"dayjs": "^1.11.13"     ✅ Available with timezone plugin
"pg": "^8.16.0"         ✅ PostgreSQL client available
"discord.js": "^14.19.3" ✅ Discord client available

// MISSING - Need to install
"node-cron": "^3.x"     ❌ Required for timezone-aware scheduling  
"winston": "^3.x"       ❌ Required for structured logging
```

### Current Service Implementation Analysis:
```javascript
// EXISTING IMPLEMENTATIONS:
src/services/timezoneService.js     ✅ Basic get/set methods (but timezone column missing)
src/utils/dailyTaskManager.js      ✅ Global midnight reset (needs timezone awareness)
src/services/monthlyResetService.js ✅ Global monthly reset (needs user timezone support)
src/services/voiceService.js       ✅ Streak logic (needs timezone-aware daily boundaries)

// MISSING IMPLEMENTATIONS:
src/services/centralResetService.js ❌ Central timezone-aware reset coordinator
src/commands/timezone.js           ❌ User timezone management commands
```

## 🎯 **Phase-by-Phase Implementation Plan**

### **PHASE 1: Foundation Setup** 
**Duration**: 2-3 hours  
**Risk Level**: Low (Non-breaking changes)

#### Sub-Phase 1.1: Install Required Dependencies
**Duration**: 15 minutes
**Changes**:
- Install `node-cron` and `winston` packages
- Update package.json and package-lock.json

**Files Modified**: 
- `package.json`

**Testing**: 
- Verify packages install correctly
- Test basic imports work

#### Sub-Phase 1.2: Database Schema Migration
**Duration**: 30 minutes  
**Changes**:
- Add timezone columns to users table
- Create timezone-specific indexes
- Backup database before migration

**Database Changes**:
```sql
-- Add timezone support columns
ALTER TABLE users ADD COLUMN timezone VARCHAR(50) DEFAULT 'UTC';
ALTER TABLE users ADD COLUMN timezone_set_at TIMESTAMP;
ALTER TABLE users ADD COLUMN last_daily_reset_tz TIMESTAMP;
ALTER TABLE users ADD COLUMN last_monthly_reset_tz TIMESTAMP;

-- Create performance indexes
CREATE INDEX idx_users_timezone ON users(timezone);
CREATE INDEX idx_users_daily_reset_tz ON users(last_daily_reset_tz);
CREATE INDEX idx_users_timezone_daily ON users(timezone, last_daily_reset_tz);
```

**Files Modified**:
- `src/models/db.js` (add migration to runMigrations function)

**Testing**:
- Run migration on development database
- Verify all existing users have 'UTC' default timezone
- Test existing queries still work
- Run `npm test` to ensure no regressions

#### Sub-Phase 1.3: Complete TimezoneService Implementation
**Duration**: 60 minutes
**Changes**:
- Add missing bulk operation methods
- Add DST handling
- Add timezone change migration logic
- Add comprehensive timezone validation

**Files Modified**:
- `src/services/timezoneService.js` (extend existing implementation)

**New Methods to Add**:
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
```

**Testing**:
- Unit tests for each new method
- Test timezone validation with edge cases
- Test DST transition handling
- Verify caching works correctly

#### Sub-Phase 1.4: Create Timezone Management Commands
**Duration**: 45 minutes
**Changes**:
- Create `/timezone` slash command
- Add timezone setting, getting, and listing functionality
- Register commands with Discord

**Files Created**:
- `src/commands/timezone.js`

**Files Modified**:
- `src/register-commands.js`

**Command Features**:
- `/timezone set <timezone>` - Set user timezone with validation
- `/timezone get` - Show current timezone  
- `/timezone list` - Show popular timezones
- `/timezone reset` - Reset to UTC

**Testing**:
- Test command registration
- Test timezone validation with invalid inputs
- Test user feedback and error messages
- Verify database updates work correctly

### **PHASE 2: Central Reset Service**
**Duration**: 4-5 hours
**Risk Level**: Medium (New core functionality)

#### Sub-Phase 2.1: Create CentralResetService Foundation
**Duration**: 90 minutes
**Changes**:
- Create new CentralResetService class
- Implement basic timezone-aware scheduling using node-cron
- Add winston logging configuration
- Add timezone-aware reset detection logic

**Files Created**:
- `src/services/centralResetService.js`

**Core Features**:
```javascript
class CentralResetService extends BaseService {
    constructor() {
        super('CentralResetService');
        this.resetSchedulers = new Map();
        this.isRunning = false;
        this.setupWinstonLogging();
    }

    // Main scheduler - runs every minute using node-cron
    async start() {
        this.cronJob = cron.schedule('* * * * *', async () => {
            await this.checkTimezonedResets();
        });
    }

    // Check all timezones for users needing resets
    async checkTimezonedResets() { /* Implementation */ }
    
    // Recovery and fault tolerance
    async recoverMissedResets() { /* Implementation */ }
}
```

**Testing**:
- Test service initialization
- Test cron scheduling works
- Test winston logging configuration
- Verify timezone detection logic

#### Sub-Phase 2.2: Implement Daily Reset Logic
**Duration**: 120 minutes
**Changes**:
- Add timezone-aware daily reset processing
- Implement streak preservation during timezone changes
- Add daily limit reset logic
- Integrate with existing voice session handling

**Methods to Implement**:
```javascript
// Daily reset methods
async processDailyReset(timezone, usersInTimezone) { /* Implementation */ }
async handleUserDailyReset(userId, timezone) { /* Implementation */ }
async resetUserDailyStats(userId) { /* Implementation */ }
async checkUserStreak(userId, localDate) { /* Implementation */ }
```

**Integration Points**:
- Integrate with `dailyTaskManager.js` for voice session handling
- Preserve existing `handleMidnightCrossover` logic
- Ensure compatibility with current daily_voice_stats table

**Testing**:
- Test daily reset for different timezones
- Test streak preservation logic
- Test integration with voice sessions
- Test edge cases (DST transitions, timezone changes)

#### Sub-Phase 2.3: Implement Monthly Reset Logic  
**Duration**: 60 minutes
**Changes**:
- Add timezone-aware monthly reset processing
- Handle month boundary edge cases
- Integrate with existing monthly reset infrastructure

**Methods to Implement**:
```javascript
// Monthly reset methods
async processMonthlyReset(timezone, usersInTimezone) { /* Implementation */ }
async handleUserMonthlyReset(userId, timezone) { /* Implementation */ }
```

**Testing**:
- Test monthly reset for different timezones
- Test month boundary edge cases (Feb 29, etc.)
- Test integration with existing monthly stats
- Verify leaderboard consistency

#### Sub-Phase 2.4: Add Recovery and Fault Tolerance
**Duration**: 45 minutes  
**Changes**:
- Implement missed reset detection and recovery
- Add database transaction safety
- Add comprehensive error handling and logging

**Features**:
```javascript
// Recovery mechanisms
async recoverMissedResets() { /* Implementation */ }
async validateResetIntegrity() { /* Implementation */ }
async processUserReset(userId, resetType) { /* With transactions */ }
```

**Testing**:
- Test missed reset recovery
- Test database transaction rollback
- Test error handling scenarios
- Verify logging completeness

### **PHASE 3: Service Integration**
**Duration**: 3-4 hours  
**Risk Level**: High (Modifying existing services)

#### Sub-Phase 3.1: Integrate CentralResetService with Main Bot
**Duration**: 30 minutes
**Changes**:
- Initialize CentralResetService in main bot
- Add service lifecycle management
- Add health monitoring integration

**Files Modified**:
- `src/index.js`

**Integration Code**:
```javascript
// In src/index.js
const CentralResetService = require('./services/centralResetService');
const centralResetService = new CentralResetService();

// Start timezone-aware reset service
await centralResetService.start();
```

**Testing**:
- Test service startup
- Test service shutdown
- Test error handling during initialization

#### Sub-Phase 3.2: Modify VoiceService for Timezone Awareness
**Duration**: 90 minutes
**Changes**:
- Update daily limit calculation to use user timezone
- Modify streak update logic to be timezone-aware
- Remove global timezone assumptions
- Integrate with CentralResetService

**Files Modified**:
- `src/services/voiceService.js`

**Key Changes**:
```javascript
// Update getUserDailyTime to use user timezone
async getUserDailyTime(discordId, date = null) {
    const userTimezone = await timezoneService.getUserTimezone(discordId);
    const targetDate = date || dayjs().tz(userTimezone).format('YYYY-MM-DD');
    // ... rest of logic
}

// Update updateStreak to use user timezone  
async updateStreak(discordId, sessionDate, userTimezone) {
    const today = dayjs(sessionDate).tz(userTimezone);
    // ... rest of logic
}
```

**Testing**:
- Test daily limit with different user timezones
- Test streak calculation accuracy
- Test voice session point calculation
- Verify backward compatibility

#### Sub-Phase 3.3: Update DailyTaskManager Integration
**Duration**: 60 minutes
**Changes**:
- Remove global midnight detection
- Integrate with CentralResetService for timezone-specific resets
- Preserve voice session crossover logic
- Update task cleanup to be timezone-aware

**Files Modified**:
- `src/utils/dailyTaskManager.js`

**Key Changes**:
```javascript
// Remove checkMidnightCleanup (replaced by CentralResetService)
// Keep resetDailyVoiceStats but make it timezone-specific
async resetDailyVoiceStats(timezone, usersInTimezone) {
    // Process users in specific timezone only
}
```

**Testing**:
- Test timezone-specific voice stats reset
- Test task cleanup timing
- Test voice session preservation
- Verify no double-processing

#### Sub-Phase 3.4: Update MonthlyResetService Integration
**Duration**: 45 minutes
**Changes**:
- Keep global leaderboard reset functionality
- Remove individual user monthly reset logic
- Integrate with CentralResetService for user-specific resets

**Files Modified**:
- `src/services/monthlyResetService.js`

**Key Changes**:
```javascript
// Keep global operations only
async checkAllUsersForReset() {
    // Only handle global leaderboard resets
    // User-specific resets now handled by CentralResetService
}
```

**Testing**:
- Test global leaderboard reset timing
- Test separation of global vs user resets
- Verify no conflicts with CentralResetService

### **PHASE 4: Command Integration and User Experience**
**Duration**: 2-3 hours
**Risk Level**: Low (UI/UX enhancements)

#### Sub-Phase 4.1: Update Stats Command for Timezone Display
**Duration**: 45 minutes
**Changes**:
- Show user's timezone in stats display
- Add timezone-aware time displays
- Show next reset time in user's timezone

**Files Modified**:
- `src/commands/stats.js`

**Features**:
```javascript
// Add timezone info to stats embed
const userTimezone = await timezoneService.getUserTimezone(userId);
const nextReset = await timezoneService.getNextMidnightInUserTimezone(userId);

embed.addFields([{
    name: '🌍 Timezone',
    value: `${userTimezone}\nNext reset: ${nextReset.format('MMM DD, YYYY HH:mm')}`,
    inline: true
}]);
```

**Testing**:
- Test timezone display accuracy
- Test next reset time calculation
- Test with users in different timezones

#### Sub-Phase 4.2: Update Leaderboard Commands
**Duration**: 30 minutes
**Changes**:
- Clarify global vs user timezone in leaderboard descriptions
- Add timezone information where relevant
- Ensure leaderboard consistency

**Files Modified**:
- `src/commands/leaderboard.js`

**Testing**:
- Test leaderboard display consistency
- Test global timing explanations
- Verify user understanding

#### Sub-Phase 4.3: Add Timezone Awareness to Other Commands
**Duration**: 60 minutes
**Changes**:
- Update time-related commands to show user timezone
- Add timezone context to notifications
- Update help documentation

**Files Modified**:
- `src/commands/time.js`
- Any other time-related commands

**Testing**:
- Test all time displays use appropriate timezone
- Test user notifications are clear
- Test help documentation accuracy

### **PHASE 5: Testing and Validation**
**Duration**: 2-3 hours
**Risk Level**: Low (Quality assurance)

#### Sub-Phase 5.1: Comprehensive Integration Testing
**Duration**: 90 minutes
**Changes**:
- Create end-to-end tests for timezone functionality
- Test all reset scenarios
- Test error handling and edge cases

**Files Created**:
- `test/timezone-integration.test.js`
- `test/reset-service.test.js`

**Test Scenarios**:
- User sets timezone and gets appropriate resets
- Timezone changes during active sessions
- DST transitions
- Server downtime recovery
- Multiple timezone coordination

#### Sub-Phase 5.2: Performance Testing
**Duration**: 45 minutes
**Changes**:
- Test database performance with timezone queries
- Test memory usage with multiple timezone tracking
- Verify no degradation in core bot functionality

**Testing**:
- Run performance benchmarks
- Monitor database query times
- Check memory usage patterns
- Test with simulated user load

#### Sub-Phase 5.3: User Acceptance Testing
**Duration**: 45 minutes
**Changes**:
- Test user experience flows
- Verify error messages are helpful
- Test command discoverability

**Testing**:
- Test complete user journey
- Test error scenarios from user perspective
- Verify documentation accuracy

### **PHASE 6: Deployment and Monitoring**
**Duration**: 1-2 hours
**Risk Level**: Medium (Production deployment)

#### Sub-Phase 6.1: Production Database Migration
**Duration**: 30 minutes
**Changes**:
- Backup production database
- Apply schema migrations
- Verify data integrity

**Process**:
```bash
# Backup production database
pg_dump botd_production > botd_backup_pre_timezone_$(date +%Y%m%d_%H%M%S).sql

# Apply migrations
psql botd_production < timezone_migration.sql

# Verify migration success
psql botd_production -c "SELECT COUNT(*) FROM users WHERE timezone IS NOT NULL;"
```

#### Sub-Phase 6.2: Gradual Feature Rollout
**Duration**: 60 minutes
**Changes**:
- Deploy with feature flags
- Enable timezone features gradually
- Monitor for issues

**Rollout Plan**:
1. Deploy code with timezone features disabled
2. Enable timezone commands for testing
3. Enable daily resets for timezone setters
4. Enable monthly resets for timezone setters
5. Full timezone awareness enabled

#### Sub-Phase 6.3: Monitoring and Validation
**Duration**: 30 minutes
**Changes**:
- Set up monitoring for timezone operations
- Verify reset accuracy
- Monitor performance metrics

**Monitoring Points**:
- Reset processing time per timezone
- Database query performance
- Error rates in timezone operations
- User adoption of timezone features

## 🔄 **Phase Dependencies and Critical Path**

**Critical Path**: Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6

**Parallel Opportunities**:
- Phase 1.4 (timezone commands) can be done in parallel with Phase 2.1
- Phase 4 (UI updates) can be done in parallel with Phase 5 (testing)

**Rollback Points**:
- After Phase 1: Can rollback with only new unused database columns
- After Phase 2: Can disable CentralResetService and revert to old services  
- After Phase 3: Feature flags allow selective rollback of timezone features

## 🧪 **Testing Strategy Summary**

### Unit Tests (Each Sub-Phase):
- Individual method functionality
- Edge case handling
- Error scenarios
- Performance benchmarks

### Integration Tests (Phase 5):
- Service interaction testing
- Database consistency testing  
- User experience testing
- Performance under load

### Production Validation (Phase 6):
- Real user testing
- Performance monitoring
- Error rate monitoring
- Data integrity validation

## 📊 **Success Metrics**

### Functional Success:
- ✅ All users can set timezone preferences
- ✅ Daily limits reset at correct local time
- ✅ Streaks preserved across timezone changes
- ✅ Monthly resets occur at correct local time
- ✅ No reset processing errors

### Performance Success:
- ⚡ Reset processing < 5 minutes globally
- ⚡ Database queries < 50ms average
- ⚡ Memory usage increase < 10%
- ⚡ No degradation in voice tracking

### User Experience Success:
- 😊 Intuitive timezone setting commands
- 😊 Clear reset time communication
- 😊 Helpful error messages
- 😊 Seamless transition from global resets

---

**Implementation Status**: Ready to begin Phase 1
**Estimated Total Time**: 12-16 hours over 3-4 days
**Risk Assessment**: Medium overall, with careful rollback planning

## Testing Strategy

### Unit Tests:
- Timezone validation functions
- Timezone conversion accuracy
- DST transition handling
- Reset scheduling logic

### Integration Tests:
- User timezone change scenarios
- Cross-timezone reset coordination
- Database migration scripts
- Service communication patterns

### End-to-End Tests:
- Complete reset cycles in different timezones
- User experience with timezone changes
- Performance under load with multiple timezones
- Recovery from various failure scenarios

## Success Metrics

### Functional Metrics:
- ✅ All users can set their preferred timezone
- ✅ Daily limits reset at user's local midnight
- ✅ Streaks properly maintained across timezones
- ✅ Global leaderboards reset consistently
- ✅ Monthly resets occur at correct local time

### Performance Metrics:
- ⚡ Database queries for timezone operations < 50ms
- ⚡ Reset processing completes within 5 minutes globally
- ⚡ Memory usage increase < 10% from timezone features
- ⚡ No impact on voice session tracking performance

### Reliability Metrics:
- 🛡️ 99.9% reset accuracy (no missed resets)
- 🛡️ Complete recovery from server downtime
- 🛡️ Zero data loss during timezone transitions
- 🛡️ Graceful handling of all edge cases

## Implementation Timeline

### Week 1: Foundation
- Database schema migration
- Complete TimezoneService implementation
- Add timezone management commands

### Week 2: Central Service
- Implement CentralResetService
- Add comprehensive testing
- Create monitoring and logging

### Week 3: Integration
- Integrate with existing services
- Migrate daily user stats reset
- Performance testing

### Week 4: Migration
- Migrate remaining reset functionality
- Remove old reset logic
- Documentation and cleanup

### Week 5: Monitoring
- Monitor production performance
- Fix any issues discovered
- User feedback integration

---

**Status**: Ready for implementation
**Priority**: High - Addresses core user experience issues
**Estimated Effort**: 4-5 weeks full implementation
**Risk Level**: Medium - Requires careful migration planning
