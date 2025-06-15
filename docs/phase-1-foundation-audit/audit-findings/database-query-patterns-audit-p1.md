---
phase: 1
category: audit-finding
priority: critical
implementation-phase: 2
dependencies: ["service-architecture-audit-p1.md"]
date-created: 2025-06-15
last-updated: 2025-06-15
author: phase-1-audit
---

# Database Query Patterns Audit - Phase 1

## 🎯 Executive Summary

**Current State**: Mixed migration strategy, query duplication, no rollback procedures
**Gap Identified**: Embedded migrations, scattered query logic, missing daily leaderboard
**Impact**: Deployment risk, maintenance complexity, potential data loss scenarios
**Implementation Phase**: Phase 2 (Database Optimization)

## 🔍 Database Architecture Analysis

### **Current Database Management**

| Component | Location | Size | Purpose | Issues |
|-----------|----------|------|---------|---------|
| Embedded Migrations | `db.js` Lines 86-280+ | ~200 lines | Schema updates | No rollback, mixed with connection logic |
| Migration Scripts | `migrate-database.sh` | 263 lines | Production deployment | Complex, error-prone |
| User Migration | `migrate-user-timezones.js` | 227 lines | Timezone data migration | One-time script |
| Database Improvements | `database-improvements.sql` | TBD | SQL optimizations | Static file |

### **Migration Strategy Assessment**

#### **Current Migration Patterns**:

1. **Embedded Migrations** (db.js):
```javascript
// Lines 86-280+ - Embedded in connection logic
async function runMigrations(client) {
    // Migration 1: Add new columns to users table
    const columnsToAdd = [
        { name: 'all_time_points', type: 'INTEGER DEFAULT 0' },
        { name: 'monthly_hours', type: 'DECIMAL(10,2) DEFAULT 0' },
        // ... 7+ migrations embedded
    ];
}
```

2. **Shell Script Migrations** (migrate-database.sh):
```bash
# Lines 1-50 - Production deployment script
execute_sql() {
    local description="$1"
    local sql_command="$2"
    echo "📝 $description"
    if psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "$sql_command" > /dev/null 2>&1; then
```

#### **🚨 Critical Migration Issues**:

1. **No Rollback Strategy**: Migrations are one-way only
2. **Mixed Concerns**: Schema changes embedded in application code
3. **Error Handling**: Migrations continue on error without validation
4. **Version Control**: No migration versioning or dependency tracking

## 📊 Query Pattern Analysis

### **Identified Query Duplication**

#### **Leaderboard Queries** (Multiple Locations):

1. **voiceService.js** (Lines 624-627):
```javascript
if (type === 'monthly') {
    result = await client.query('SELECT * FROM monthly_leaderboard');
} else {
    result = await client.query('SELECT * FROM alltime_leaderboard');
}
```

2. **Database Views** (migrate-database.sh):
```sql
CREATE VIEW monthly_leaderboard AS
SELECT
    ROW_NUMBER() OVER (ORDER BY u.monthly_hours DESC, u.monthly_points DESC) as rank,
    u.discord_id, u.username, u.house, u.monthly_hours as hours, u.monthly_points as points
FROM users u WHERE u.monthly_hours > 0
```

3. **Missing Daily Leaderboard**:
   - **Gap Identified**: No daily leaderboard view or queries
   - **Impact**: Users cannot see daily performance rankings
   - **Complexity**: Requires timezone-aware daily aggregation

#### **User Management Queries** (Scattered):

1. **User Creation** (voiceService.js):
```javascript
const result = await client.query('SELECT * FROM users WHERE discord_id = $1', [discordId]);
// If not found:
const newUserResult = await client.query(
    `INSERT INTO users (discord_id, username) VALUES ($1, $2) RETURNING *`,
    [discordId, username]
);
```

2. **User Updates** (Multiple Services):
```javascript
// Pattern repeated across services
await client.query('UPDATE users SET username = $1, updated_at = CURRENT_TIMESTAMP WHERE discord_id = $2',
    [username, discordId]);
```

#### **Points Calculation Queries** (Complex Logic):

1. **Points Updates** (voiceService.js):
```javascript
// Complex points calculation with multiple queries
const pointsEarned = calculatePointsForHours(duration);
await client.query(
    'UPDATE users SET monthly_points = monthly_points + $1, all_time_points = all_time_points + $1 WHERE discord_id = $2',
    [pointsEarned, discordId]
);
```

## 🗃️ Database Schema Analysis

### **Current Schema Structure**

Based on migration analysis, current tables include:

#### **Core Tables**:
1. **users** - User profiles and stats
2. **vc_sessions** - Voice channel sessions
3. **daily_voice_stats** - Daily aggregated statistics
4. **houses** - House system data
5. **tasks** - Task management
6. **daily_task_stats** - Task statistics

#### **Schema Evolution Issues**:

1. **Column Proliferation**: Users table has grown significantly
```javascript
// From migrations - users table columns added over time:
'all_time_points', 'monthly_hours', 'all_time_hours', 'last_monthly_reset',
'timezone', 'timezone_set_at', 'last_daily_reset_tz', 'last_monthly_reset_tz'
```

2. **Missing Indexes**: Performance-critical queries lack proper indexing
3. **Inconsistent Naming**: Mixed naming conventions across columns

### **Materialized Views Analysis**

#### **Current Views** (from materializedViewManager.js):
1. `monthly_leaderboard` - Monthly user rankings
2. `alltime_leaderboard` - All-time user rankings
3. `house_leaderboard_with_champions` - House rankings with champions

#### **Missing Views**:
1. **Daily Leaderboard** - Critical gap for daily rankings
2. **User Activity Summary** - Aggregated user performance
3. **Timezone-Aware Stats** - Daily stats by user timezone

## 🚨 Critical Database Risks

### **Deployment Risks**:

1. **Migration Failures**: No rollback if migration fails mid-process
2. **Data Loss**: Additive-only migrations could lose data on schema conflicts
3. **Downtime**: No zero-downtime migration strategy
4. **Environment Inconsistency**: Development vs production schema drift

### **Performance Risks**:

1. **Missing Indexes**: Large table scans on frequently queried columns
2. **N+1 Queries**: Service patterns suggest potential N+1 query issues
3. **Cache Invalidation**: No coordinated cache strategy across services

### **Maintenance Risks**:

1. **Schema Documentation**: No comprehensive schema documentation
2. **Query Optimization**: No query performance monitoring
3. **Backup Strategy**: Limited backup/restore procedures

## 🛠️ Database Optimization Recommendations

### **Phase 2 Migration Strategy**:

#### **1. Extract Migration System**:
```
/migrations/
  ├── 001_initial_schema.sql
  ├── 002_add_timezone_support.sql
  ├── 003_add_house_system.sql
  └── rollback/
      ├── 001_rollback.sql
      ├── 002_rollback.sql
      └── 003_rollback.sql
```

#### **2. Implement Daily Leaderboard**:
```sql
CREATE MATERIALIZED VIEW daily_leaderboard AS
SELECT
    ROW_NUMBER() OVER (
        PARTITION BY DATE(created_at AT TIME ZONE u.timezone)
        ORDER BY daily_hours DESC
    ) as rank,
    u.discord_id, u.username, u.house,
    SUM(session_duration) as daily_hours,
    DATE(created_at AT TIME ZONE u.timezone) as date
FROM vc_sessions vs
JOIN users u ON vs.discord_id = u.discord_id
WHERE DATE(created_at AT TIME ZONE u.timezone) = CURRENT_DATE
GROUP BY u.discord_id, u.username, u.house, DATE(created_at AT TIME ZONE u.timezone);
```

#### **3. Consolidate Query Patterns**:
- Create `QueryService` with standardized query methods
- Implement connection pooling optimization
- Add query performance monitoring

#### **4. Add Rollback Procedures**:
```bash
# For each migration, provide rollback
migrate-up() { psql -f migrations/001_schema.sql }
migrate-down() { psql -f rollback/001_rollback.sql }
```

## 🔗 Cross-References

### **Depends On**:
- P1.1 Service Architecture (query consolidation patterns)
- P1.4 Infrastructure Assessment (deployment procedures)

### **Blocks**:
- P2.2 Database Query Consolidation
- P2.3 Daily Leaderboard Implementation
- P4.1 Performance Optimization

### **Related**:
- Service unification (centralized query layer)
- Caching strategy (materialized view refresh)

## 💡 Context & Decision Rationale

**Why Database Audit is Critical**: Current migration strategy poses significant deployment risks. The embedded migration system and lack of rollback procedures create potential for data loss and system instability.

**Performance Impact**: Query duplication and missing indexes will become performance bottlenecks as user base grows. Proper query consolidation and optimization are essential for scalability.

**Feature Delivery**: The missing daily leaderboard represents a core feature gap that affects user engagement. Implementing timezone-aware daily rankings requires careful database design.

**Risk Mitigation**: Establishing proper migration, rollback, and backup procedures is essential before any major refactoring work begins.

---

**Next Steps**:
1. Complete infrastructure deployment audit
2. Design proper migration system with rollback capabilities
3. Implement daily leaderboard database structure
4. Create comprehensive backup/restore procedures
