---
phase: 1
category: audit-finding
priority: critical
implementation-phase: 2
dependencies: []
date-created: 2025-06-15
last-updated: 2025-06-15
author: phase-1-audit
---

# Service Architecture Audit - Phase 1

## 🎯 Executive Summary

**Current State**: 6 services with significant functionality overlap and coupling
**Gap Identified**: Monolithic services, scattered query logic, tight coupling
**Impact**: Maintenance difficulty, code duplication, testing complexity
**Implementation Phase**: Phase 2 (Service Unification)

## 🔍 Service Inventory & Analysis

### **Core Services Identified**

| Service | Size | Primary Purpose | Coupling Level | Refactor Priority |
|---------|------|-----------------|----------------|-------------------|
| `voiceService.js` | **1037 lines** | Voice tracking, leaderboards, user management | **HIGH** | **CRITICAL** |
| `timezoneService.js` | **802 lines** | User timezone management, logging | **HIGH** | **CRITICAL** |
| `centralResetService.js` | **608 lines** | Reset coordination | **MEDIUM** | **HIGH** |
| `taskService.js` | **414 lines** | Task management | Medium | Medium |
| `materializedViewManager.js` | **238 lines** | Database view management | Low | Medium |
| `monthlyResetService.js` | **193 lines** | Monthly reset logic | Medium | Medium |

**Total Service Code**: 3,292 lines across 6 services

### **Database Layer Analysis**

| Component | Size | Primary Purpose | Issues Identified |
|-----------|------|-----------------|-------------------|
| `db.js` | 894 lines | Database connection, migrations, utilities | Monolithic, embedded migrations |

## 📊 Detailed Service Analysis

### **1. voiceService.js - CRITICAL ANALYSIS**

**Size**: 1038 lines - **OVERSIZED** for single service
**Primary Functions**:
- User creation and caching
- Voice session management (start/end)
- Leaderboard generation (monthly/all-time)
- House leaderboard management
- Points calculation and updates
- Database optimization queries

**Key Dependencies**:
```javascript
const { pool, getCachedUser, setCachedUser, clearUserCache, calculatePointsForHours,
        checkAndPerformMonthlyReset, getUserHouse, updateHousePoints, executeWithResilience } = require('../models/db');
const dayjs = require('dayjs');
const { measureDatabase } = require('../utils/performanceMonitor');
const queryCache = require('../utils/queryCache');
const { calculateDailyLimitInfo, generateDailyLimitMessage } = require('../utils/dailyLimitUtils');
const { roundHoursFor55MinRule, minutesToHours } = require('../utils/timeUtils');
const CacheInvalidationService = require('../utils/cacheInvalidationService');
const BaseService = require('../utils/baseService');
const timezoneService = require('./timezoneService');
```

**Critical Issues Identified**:

1. **Service Bloat**: Single service handling too many responsibilities
   - User management
   - Session tracking
   - Leaderboard generation
   - Points calculation
   - House management

2. **Database Coupling**: Direct database pool access mixed with service logic

3. **Query Duplication**: Multiple leaderboard queries with similar patterns:
   ```javascript
   // Monthly leaderboard - Line 624
   result = await client.query('SELECT * FROM monthly_leaderboard');

   // All-time leaderboard - Line 627
   result = await client.query('SELECT * FROM alltime_leaderboard');
   ```

4. **Caching Complexity**: Multiple caching layers without clear strategy

**Refactoring Recommendations**:
- **Split into 4 services**: UserService, SessionService, LeaderboardService, PointsService
- **Extract query patterns** to dedicated QueryService
- **Centralize caching strategy**

### **2. timezoneService.js - SECONDARY CRITICAL ANALYSIS**

**Size**: 802 lines - **OVERSIZED** for timezone management
**Primary Functions**:
- User timezone preference management
- Timezone-aware date calculations
- Structured logging with Winston
- Performance monitoring integration

**Key Dependencies**:
```javascript
const { pool } = require('../models/db');
const BaseService = require('../utils/baseService');
const winston = require('winston');
const timezonePerformanceMonitor = require('../utils/timezonePerformanceMonitor');
const dayjs = require('dayjs');
```

**Issues Identified**:
1. **Logging Complexity**: 50+ lines of Winston configuration within service
2. **Database Coupling**: Direct pool access mixed with timezone logic
3. **Performance Monitoring**: Built-in monitoring adds complexity

**Refactoring Recommendations**:
- **Extract logging configuration** to shared logging service
- **Simplify timezone logic** - focus on core timezone functionality
- **Standardize service patterns** across all services

### **3. Database Layer (db.js) - STRUCTURAL ANALYSIS**

**Size**: 894 lines - **OVERSIZED** for connection management
**Critical Issues**:

1. **Embedded Migrations**: Schema changes mixed with connection logic
   ```javascript
   // Lines 86-280+ - Embedded migration logic
   async function runMigrations(client) {
       // Migration 1: Add new columns to users table
       // Migration 2: Add points_earned column
       // Migration 3: Add house columns
       // ... 7+ migrations embedded
   }
   ```

2. **Function Soup**: Utility functions mixed with connection management
   - User management functions
   - House management functions
   - Cache functions
   - Migration functions

3. **No Rollback Strategy**: Migrations have no rollback capabilities

**Immediate Actions Required**:
- **Extract migrations** to separate migration system
- **Create rollback procedures** for each migration
- **Split utility functions** into appropriate services

## 🚨 Critical Coupling Issues

### **High-Risk Coupling Patterns**

1. **voiceService ↔ db.js**: Tight coupling through multiple function imports
2. **Commands ↔ voiceService**: Direct service calls without abstraction
3. **Multiple services ↔ timezoneService**: Shared timezone logic

### **Query Pattern Duplication**

Identified similar query patterns across multiple locations:
- Leaderboard queries (monthly/all-time variations)
- User lookup and creation patterns
- House management queries
- Points calculation queries

## 🛠️ Implementation Recommendations

### **Phase 2 Service Refactoring Strategy**

1. **Extract Query Service**
   - Centralize all database queries
   - Implement consistent caching strategy
   - Add query optimization layer

2. **Split Monolithic Services**
   - Break voiceService into focused services
   - Extract migration system from db.js
   - Create service abstraction layer

3. **Implement Service Contracts**
   - Define clear interfaces between services
   - Add service-level testing
   - Document API contracts

## 🔗 Cross-References

### **Depends On**
- Complete slash commands audit (to understand service usage patterns)
- Database query analysis (to identify all query patterns)

### **Blocks**
- P2.1 Service Unification implementation
- P2.2 Database Query Consolidation
- P3.1 Command system redesign

### **Related**
- Infrastructure deployment audit (migration strategy)
- Performance optimization analysis

## 💡 Context & Decision Rationale

**Why This Audit is Critical**: The current service architecture shows classic signs of organic growth without planned architecture. The 1038-line voiceService and 894-line db.js indicate significant technical debt that will compound as new features are added.

**Strategic Importance**: Proper service architecture is foundational to all subsequent phases. Without addressing coupling and duplication, implementing new features (like Discord.js v14 components) becomes exponentially more complex.

**Risk Assessment**: **HIGH** - Current architecture makes feature development slow and error-prone. Refactoring should be prioritized before adding new functionality.

---

**Next Steps**:
1. Complete service size analysis (read remaining service files)
2. Begin slash commands functionality audit
3. Map all service interaction patterns
