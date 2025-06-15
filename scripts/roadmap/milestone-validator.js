#!/usr/bin/env node

/**
 * Milestone Validator
 *
 * Enforces phase gating by validating completion criteria before allowing
 * progression to the next phase. Ensures consistency and completeness.
 */

const RoadmapProgressTracker = require('./progress-tracker');
const fs = require('fs').promises;
const path = require('path');

class MilestoneValidator {
    constructor() {
        this.tracker = new RoadmapProgressTracker();
        this.validationReportDir = path.join(__dirname, '../../reports/validations');
    }

    async initialize() {
        await this.tracker.initialize();
        await fs.mkdir(this.validationReportDir, { recursive: true });
    }

    /**
     * Validate that a phase can be started (dependencies are met)
     */
    async validatePhaseStart(phaseId) {
        console.log(`🔍 Validating phase start prerequisites for: ${phaseId}`);

        const results = {
            phaseId,
            canStart: false,
            timestamp: new Date().toISOString(),
            checks: {},
            blockers: [],
            warnings: []
        };

        // Validate phase exists
        const phase = this.tracker.progressData.phases[phaseId];
        if (!phase) {
            results.blockers.push(`Phase '${phaseId}' not found`);
            return results;
        }

        // Check phase dependencies
        const dependencyCheck = await this.tracker.checkPhaseDependencies(phaseId);
        results.checks.dependencies = {
            passed: dependencyCheck.length === 0,
            details: dependencyCheck,
            message: dependencyCheck.length === 0 ?
                'All dependencies satisfied' :
                `Blocked by: ${dependencyCheck.join(', ')}`
        };

        if (dependencyCheck.length > 0) {
            results.blockers.push(`Dependencies not met: ${dependencyCheck.join(', ')}`);
        }

        // Run global validators
        const globalValidation = await this.runGlobalValidators();
        results.checks.globalValidation = globalValidation;

        if (!globalValidation.passed) {
            results.warnings.push('Global validation issues detected');
        }

        // Check if phase is already started or completed
        if (phase.status === 'in-progress') {
            results.warnings.push('Phase is already in progress');
        } else if (phase.status === 'completed') {
            results.blockers.push('Phase is already completed');
        }

        results.canStart = results.blockers.length === 0;

        // Save validation report
        await this.saveValidationReport(`phase-start-${phaseId}`, results);

        return results;
    }

    /**
     * Validate that a phase can be completed (all criteria met)
     */
    async validatePhaseCompletion(phaseId) {
        console.log(`🔍 Validating phase completion for: ${phaseId}`);

        const results = {
            phaseId,
            canComplete: false,
            timestamp: new Date().toISOString(),
            checks: {},
            failures: [],
            warnings: []
        };

        // Run phase-specific validation
        const phaseValidation = await this.tracker.validatePhaseCompletion(phaseId);
        results.checks.phaseValidation = phaseValidation;

        if (!phaseValidation.passed) {
            results.failures.push(...phaseValidation.failures);
        }

        // Check task completion status
        const taskValidation = await this.validatePhaseTaskCompletion(phaseId);
        results.checks.taskCompletion = taskValidation;

        if (!taskValidation.passed) {
            results.failures.push(...taskValidation.failures);
        }

        // Run deliverable validation
        const deliverableValidation = await this.validatePhaseDeliverables(phaseId);
        results.checks.deliverables = deliverableValidation;

        if (!deliverableValidation.passed) {
            results.failures.push(...deliverableValidation.failures);
        }

        // Run global validators
        const globalValidation = await this.runGlobalValidators();
        results.checks.globalValidation = globalValidation;

        if (!globalValidation.passed) {
            results.warnings.push('Global validation issues detected');
        }

        // Run audit compliance validation
        const auditCompliance = await this.validateAuditCompliance(phaseId);
        results.checks.auditCompliance = auditCompliance;

        if (!auditCompliance.passed) {
            results.failures.push('Audit compliance validation failed');
            results.failures.push(...auditCompliance.failures);
        }

        results.canComplete = results.failures.length === 0;

        // Save validation report
        await this.saveValidationReport(`phase-completion-${phaseId}`, results);

        return results;
    }

    async validatePhaseTaskCompletion(phaseId) {
        const phase = this.tracker.progressData.phases[phaseId];
        const tasks = Object.values(phase.tasks);

        const incompleteTasks = tasks.filter(task => task.status !== 'completed');
        const blockedTasks = tasks.filter(task => task.blockers && task.blockers.length > 0);

        return {
            passed: incompleteTasks.length === 0 && blockedTasks.length === 0,
            totalTasks: tasks.length,
            completedTasks: tasks.length - incompleteTasks.length,
            incompleteTasks: incompleteTasks.length,
            blockedTasks: blockedTasks.length,
            failures: [
                ...(incompleteTasks.length > 0 ? [`${incompleteTasks.length} tasks incomplete`] : []),
                ...(blockedTasks.length > 0 ? [`${blockedTasks.length} tasks blocked`] : [])
            ],
            details: {
                incomplete: incompleteTasks.map(t => ({ id: t.id, name: t.name, status: t.status })),
                blocked: blockedTasks.map(t => ({ id: t.id, name: t.name, blockers: t.blockers }))
            }
        };
    }

    async validatePhaseDeliverables(phaseId) {
        const phaseConfig = this.tracker.config.phases[phaseId];
        if (!phaseConfig || !phaseConfig.deliverables) {
            return {
                passed: true,
                message: 'No deliverables defined for this phase'
            };
        }

        const results = {
            passed: true,
            failures: [],
            deliverables: []
        };

        // This is a placeholder for deliverable validation
        // In a real implementation, you would check for specific files,
        // documentation, deployed features, etc.
        for (const deliverable of phaseConfig.deliverables) {
            const deliverableResult = {
                name: deliverable,
                status: 'not-validated',
                message: 'Manual validation required'
            };

            // Add specific validation logic here based on deliverable type
            results.deliverables.push(deliverableResult);
        }

        return results;
    }

    async runGlobalValidators() {
        const globalValidators = this.tracker.config.globalValidators || {};
        const results = {
            passed: true,
            failures: [],
            details: {}
        };

        for (const [validatorName, validatorConfig] of Object.entries(globalValidators)) {
            try {
                const validationResult = await this.tracker.runValidator(validatorName, validatorConfig);
                results.details[validatorName] = validationResult;

                if (!validationResult.passed) {
                    results.passed = false;
                    results.failures.push(`${validatorName}: ${validationResult.message}`);
                }
            } catch (error) {
                results.passed = false;
                results.failures.push(`${validatorName}: ${error.message}`);
            }
        }

        return results;
    }

    /**
     * Comprehensive roadmap health check
     */
    async validateRoadmapHealth() {
        console.log('🏥 Running comprehensive roadmap health check...');

        const health = {
            timestamp: new Date().toISOString(),
            overall: 'healthy',
            issues: [],
            warnings: [],
            recommendations: [],
            phases: {}
        };

        // Check each phase
        for (const phaseId of Object.keys(this.tracker.progressData.phases)) {
            const phaseHealth = await this.validatePhaseHealth(phaseId);
            health.phases[phaseId] = phaseHealth;

            if (phaseHealth.issues.length > 0) {
                health.issues.push(...phaseHealth.issues.map(issue => `${phaseId}: ${issue}`));
            }

            if (phaseHealth.warnings.length > 0) {
                health.warnings.push(...phaseHealth.warnings.map(warning => `${phaseId}: ${warning}`));
            }
        }

        // Global health checks
        const globalValidation = await this.runGlobalValidators();
        if (!globalValidation.passed) {
            health.issues.push(...globalValidation.failures);
        }

        // Determine overall health
        if (health.issues.length > 0) {
            health.overall = 'unhealthy';
        } else if (health.warnings.length > 0) {
            health.overall = 'warning';
        }

        // Generate recommendations
        health.recommendations = await this.generateRecommendations(health);

        // Save health report
        await this.saveValidationReport('roadmap-health', health);

        return health;
    }

    async validatePhaseHealth(phaseId) {
        const phase = this.tracker.progressData.phases[phaseId];
        const phaseHealth = {
            status: phase.status,
            progress: phase.progress,
            issues: [],
            warnings: []
        };

        // Check for stale phases
        if (phase.status === 'in-progress' && phase.startDate) {
            const startDate = new Date(phase.startDate);
            const daysSinceStart = (Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24);

            if (daysSinceStart > 30) { // Configurable threshold
                phaseHealth.warnings.push(`Phase has been in progress for ${Math.round(daysSinceStart)} days`);
            }
        }

        // Check for blocked tasks
        const tasks = Object.values(phase.tasks);
        const blockedTasks = tasks.filter(task => task.blockers && task.blockers.length > 0);
        if (blockedTasks.length > 0) {
            phaseHealth.issues.push(`${blockedTasks.length} tasks are blocked`);
        }

        // Check for phase-level blockers
        if (phase.blockers && phase.blockers.length > 0) {
            phaseHealth.issues.push(`${phase.blockers.length} phase blockers active`);
        }

        // Check for overdue tasks
        const overdueTasks = tasks.filter(task => {
            if (!task.dueDate || task.status === 'completed') return false;
            return new Date(task.dueDate) < new Date();
        });
        if (overdueTasks.length > 0) {
            phaseHealth.warnings.push(`${overdueTasks.length} tasks are overdue`);
        }

        return phaseHealth;
    }

    async generateRecommendations(health) {
        const recommendations = [];

        // Based on health analysis, generate actionable recommendations
        if (health.issues.length > 0) {
            recommendations.push('🔧 Address critical issues before proceeding with roadmap');
        }

        if (health.warnings.length > 0) {
            recommendations.push('⚠️ Review warnings to prevent potential roadblocks');
        }

        // Check for phases that should be started
        for (const [phaseId, phase] of Object.entries(this.tracker.progressData.phases)) {
            if (phase.status === 'ready') {
                recommendations.push(`🚀 Phase ${phase.name} (${phaseId}) is ready to start`);
            }
        }

        // Global recommendations
        const globalValidation = await this.runGlobalValidators();
        if (!globalValidation.passed) {
            recommendations.push('🔍 Run global validation fixes before major milestones');
        }

        return recommendations;
    }

    async saveValidationReport(reportName, data) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${reportName}-${timestamp}.json`;
        const filepath = path.join(this.validationReportDir, filename);

        await fs.writeFile(filepath, JSON.stringify(data, null, 2));
        console.log(`📄 Validation report saved: ${filename}`);
    }

    /**
     * Enforce phase gating - prevent phase start if validation fails
     */
    async enforcePhaseGating(phaseId) {
        const validation = await this.validatePhaseStart(phaseId);

        if (!validation.canStart) {
            console.error(`❌ Phase ${phaseId} cannot be started:`);
            validation.blockers.forEach(blocker => console.error(`  • ${blocker}`));
            throw new Error(`Phase gating violation: ${validation.blockers.join(', ')}`);
        }

        console.log(`✅ Phase ${phaseId} is approved to start`);
        return validation;
    }

    /**
     * Enforce completion gating - prevent phase completion if validation fails
     */
    async enforceCompletionGating(phaseId) {
        const validation = await this.validatePhaseCompletion(phaseId);

        if (!validation.canComplete) {
            console.error(`❌ Phase ${phaseId} cannot be completed:`);
            validation.failures.forEach(failure => console.error(`  • ${failure}`));
            throw new Error(`Completion gating violation: ${validation.failures.join(', ')}`);
        }

        console.log(`✅ Phase ${phaseId} is approved for completion`);
        return validation;
    }

    async validateAuditCompliance(phaseId) {
        try {
            console.log(`🔍 Running audit compliance validation for phase: ${phaseId}`);

            // Run audit compliance check using the tracker's built-in method
            const auditComplianceConfig = {
                minimumComplianceScore: 80,
                strictCompliance: false,
                checkVisualCompliance: true,
                checkServiceCompliance: true
            };

            const auditResult = await this.tracker.runAuditComplianceValidator(auditComplianceConfig);

            return {
                passed: auditResult.passed,
                complianceScore: auditResult.complianceScore,
                failures: auditResult.failures || [],
                details: auditResult.details,
                message: auditResult.passed ?
                    `Audit compliance passed with ${auditResult.complianceScore}% score` :
                    `Audit compliance failed with ${auditResult.complianceScore || 0}% score`
            };
        } catch (error) {
            console.warn(`⚠️  Audit compliance validation failed: ${error.message}`);
            return {
                passed: false,
                complianceScore: 0,
                failures: [`Audit compliance check failed: ${error.message}`],
                details: {},
                message: 'Audit compliance validation encountered an error'
            };
        }
    }
}

// CLI Interface
async function main() {
    const validator = new MilestoneValidator();
    await validator.initialize();

    const command = process.argv[2];
    const args = process.argv.slice(3);

    try {
        switch (command) {
        case 'validate-start': {
            if (!args[0]) {
                console.error('❌ Phase ID required');
                process.exit(1);
            }
            const startValidation = await validator.validatePhaseStart(args[0]);
            console.log('\n📋 Phase Start Validation Results:');
            console.log(`Status: ${startValidation.canStart ? '✅ APPROVED' : '❌ BLOCKED'}`);
            if (startValidation.blockers.length > 0) {
                console.log('\nBlockers:');
                startValidation.blockers.forEach(blocker => console.log(`• ${blocker}`));
            }
            break;
        }

        case 'validate-completion': {
            if (!args[0]) {
                console.error('❌ Phase ID required');
                process.exit(1);
            }
            const completionValidation = await validator.validatePhaseCompletion(args[0]);
            console.log('\n📋 Phase Completion Validation Results:');
            console.log(`Status: ${completionValidation.canComplete ? '✅ APPROVED' : '❌ BLOCKED'}`);
            if (completionValidation.failures.length > 0) {
                console.log('\nFailures:');
                completionValidation.failures.forEach(failure => console.log(`• ${failure}`));
            }
            break;
        }

        case 'health-check': {
            const health = await validator.validateRoadmapHealth();
            console.log('\n🏥 Roadmap Health Check:');
            console.log(`Overall Status: ${health.overall.toUpperCase()}`);

            if (health.issues.length > 0) {
                console.log('\n🔴 Issues:');
                health.issues.forEach(issue => console.log(`• ${issue}`));
            }

            if (health.warnings.length > 0) {
                console.log('\n🟡 Warnings:');
                health.warnings.forEach(warning => console.log(`• ${warning}`));
            }

            if (health.recommendations.length > 0) {
                console.log('\n💡 Recommendations:');
                health.recommendations.forEach(rec => console.log(`• ${rec}`));
            }
            break;
        }

        case 'enforce-start':
            if (!args[0]) {
                console.error('❌ Phase ID required');
                process.exit(1);
            }
            await validator.enforcePhaseGating(args[0]);
            break;

        case 'enforce-completion':
            if (!args[0]) {
                console.error('❌ Phase ID required');
                process.exit(1);
            }
            await validator.enforceCompletionGating(args[0]);
            break;

        case undefined:
        case 'help':
        case '--help':
        case '-h':
        default:
            console.log(`
🔒 Milestone Validator - Phase Gating Enforcement

Usage:
  node milestone-validator.js <command> [args]

Commands:
  validate-start <phaseId>      Validate phase start prerequisites
  validate-completion <phaseId> Validate phase completion criteria
  health-check                  Run comprehensive roadmap health check
  enforce-start <phaseId>       Enforce phase gating (throws on failure)
  enforce-completion <phaseId>  Enforce completion gating (throws on failure)

Phase IDs:
  phase-1-foundation    Product Foundation Audit
  phase-2-point-system  Point System Redesign
  phase-3-commands      Command Enhancement
  phase-4-infrastructure Infrastructure Hardening
  phase-5-integration   Integration & Testing
                `);
        }
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = MilestoneValidator;
