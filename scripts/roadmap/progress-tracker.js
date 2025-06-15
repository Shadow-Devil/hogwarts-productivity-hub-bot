#!/usr/bin/env node

/**
 * Discord Bot Roadmap Progress Tracker
 *
 * Enforces phase gating, validates completion criteria, and tracks detailed progress
 * across the 5-phase Strategic Product Analysis & Implementation Roadmap.
 *
 * Features:
 * - Phase dependency enforcement
 * - Automated validation of completion criteria
 * - Structured progress tracking within phases
 * - Risk and blocker management
 * - Progress reporting and dashboards
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

class RoadmapProgressTracker {
    constructor() {
        this.dataFile = path.join(__dirname, '../../data/roadmap-progress.json');
        this.configFile = path.join(__dirname, '../../config/roadmap-config.json');
        this.progressData = null;
        this.config = null;
    }

    async initialize() {
        try {
            // Load existing progress data
            const progressContent = await fs.readFile(this.dataFile, 'utf8');
            this.progressData = JSON.parse(progressContent);
        } catch (error) {
            // Initialize new progress data if file doesn't exist
            this.progressData = await this.createInitialProgressData();
            await this.saveProgress();
        }

        try {
            // Load configuration
            const configContent = await fs.readFile(this.configFile, 'utf8');
            this.config = JSON.parse(configContent);
        } catch (error) {
            throw new Error(`Failed to load roadmap configuration: ${error.message}`);
        }
    }

    async createInitialProgressData() {
        return {
            metadata: {
                createdAt: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
                version: '1.0.0'
            },
            currentPhase: 'phase-1-foundation',
            phases: {
                'phase-1-foundation': {
                    id: 'phase-1-foundation',
                    name: 'Product Foundation Audit',
                    status: 'not-started',
                    progress: 0,
                    startDate: null,
                    endDate: null,
                    dependencies: [],
                    blockers: [],
                    tasks: {},
                    validations: {}
                },
                'phase-2-point-system': {
                    id: 'phase-2-point-system',
                    name: 'Point System Redesign',
                    status: 'blocked',
                    progress: 0,
                    startDate: null,
                    endDate: null,
                    dependencies: ['phase-1-foundation'],
                    blockers: [],
                    tasks: {},
                    validations: {}
                },
                'phase-3-commands': {
                    id: 'phase-3-commands',
                    name: 'Command Enhancement',
                    status: 'blocked',
                    progress: 0,
                    startDate: null,
                    endDate: null,
                    dependencies: ['phase-2-point-system'],
                    blockers: [],
                    tasks: {},
                    validations: {}
                },
                'phase-4-infrastructure': {
                    id: 'phase-4-infrastructure',
                    name: 'Infrastructure Hardening',
                    status: 'blocked',
                    progress: 0,
                    startDate: null,
                    endDate: null,
                    dependencies: ['phase-3-commands'],
                    blockers: [],
                    tasks: {},
                    validations: {}
                },
                'phase-5-integration': {
                    id: 'phase-5-integration',
                    name: 'Integration & Testing',
                    status: 'blocked',
                    progress: 0,
                    startDate: null,
                    endDate: null,
                    dependencies: ['phase-4-infrastructure'],
                    blockers: [],
                    tasks: {},
                    validations: {}
                }
            }
        };
    }

    async saveProgress() {
        this.progressData.metadata.lastUpdated = new Date().toISOString();
        await fs.mkdir(path.dirname(this.dataFile), { recursive: true });
        await fs.writeFile(this.dataFile, JSON.stringify(this.progressData, null, 2));
    }

    // Phase Management
    async startPhase(phaseId) {
        const phase = this.progressData.phases[phaseId];
        if (!phase) {
            throw new Error(`Phase '${phaseId}' not found`);
        }

        // Run comprehensive milestone validation before starting phase
        const MilestoneValidator = require('./milestone-validator');
        const milestoneValidator = new MilestoneValidator();
        await milestoneValidator.initialize();

        console.log(`🔍 Running milestone validation for phase start: ${phaseId}`);
        const milestoneValidation = await milestoneValidator.validatePhaseStart(phaseId);

        if (!milestoneValidation.canStart) {
            const blockers = milestoneValidation.blockers.join('\n• ');
            throw new Error(`❌ Phase start validation failed for ${phaseId}:\n• ${blockers}`);
        }

        // Check dependencies (legacy check, now part of milestone validation)
        const blockedByDependencies = await this.checkPhaseDependencies(phaseId);
        if (blockedByDependencies.length > 0) {
            throw new Error(`Cannot start ${phaseId}. Blocked by incomplete dependencies: ${blockedByDependencies.join(', ')}`);
        }

        phase.status = 'in-progress';
        phase.startDate = new Date().toISOString();
        this.progressData.currentPhase = phaseId;

        await this.saveProgress();
        console.log(`✅ Started phase: ${phase.name}`);

        // Display validation summary
        if (milestoneValidation.warnings.length > 0) {
            console.log(`⚠️  Warnings for ${phaseId}:`);
            milestoneValidation.warnings.forEach(warning => console.log(`  • ${warning}`));
        }
    }

    async completePhase(phaseId) {
        const phase = this.progressData.phases[phaseId];
        if (!phase) {
            throw new Error(`Phase '${phaseId}' not found`);
        }

        // Run comprehensive milestone validation before completing phase
        const MilestoneValidator = require('./milestone-validator');
        const milestoneValidator = new MilestoneValidator();
        await milestoneValidator.initialize();

        console.log(`🔍 Running milestone validation for phase completion: ${phaseId}`);
        const milestoneValidation = await milestoneValidator.validatePhaseCompletion(phaseId);

        if (!milestoneValidation.canComplete) {
            const failures = milestoneValidation.failures.join('\n• ');
            throw new Error(`❌ Phase completion validation failed for ${phaseId}:\n• ${failures}`);
        }

        // Validate completion criteria (legacy check, now part of milestone validation)
        const validationResults = await this.validatePhaseCompletion(phaseId);
        if (!validationResults.passed) {
            throw new Error(`Cannot complete ${phaseId}. Validation failures:\n${validationResults.failures.join('\n')}`);
        }

        phase.status = 'completed';
        phase.endDate = new Date().toISOString();
        phase.progress = 100;

        // Unblock dependent phases
        await this.unblockDependentPhases(phaseId);

        await this.saveProgress();
        console.log(`✅ Completed phase: ${phase.name}`);

        // Display validation summary
        console.log('📊 Milestone validation summary:');
        console.log(`  ✅ Phase validation: ${milestoneValidation.checks.phaseValidation?.passed ? 'PASSED' : 'FAILED'}`);
        console.log(`  ✅ Task completion: ${milestoneValidation.checks.taskCompletion?.passed ? 'PASSED' : 'FAILED'}`);
        console.log(`  ✅ Deliverables: ${milestoneValidation.checks.deliverables?.passed ? 'PASSED' : 'FAILED'}`);

        if (milestoneValidation.warnings.length > 0) {
            console.log(`⚠️  Warnings for ${phaseId}:`);
            milestoneValidation.warnings.forEach(warning => console.log(`  • ${warning}`));
        }
    }

    async checkPhaseDependencies(phaseId) {
        const phase = this.progressData.phases[phaseId];
        const blockedBy = [];

        for (const dependencyId of phase.dependencies) {
            const dependency = this.progressData.phases[dependencyId];
            if (dependency.status !== 'completed') {
                blockedBy.push(dependency.name);
            }
        }

        return blockedBy;
    }

    async unblockDependentPhases(completedPhaseId) {
        for (const [phaseId, phase] of Object.entries(this.progressData.phases)) {
            if (phase.dependencies.includes(completedPhaseId) && phase.status === 'blocked') {
                const remainingBlockers = await this.checkPhaseDependencies(phaseId);
                if (remainingBlockers.length === 0) {
                    phase.status = 'ready';
                    console.log(`📋 Phase ${phase.name} is now ready to start`);
                }
            }
        }
    }

    // Task Management
    async addTask(phaseId, taskId, taskData) {
        const phase = this.progressData.phases[phaseId];
        if (!phase) {
            throw new Error(`Phase '${phaseId}' not found`);
        }

        phase.tasks[taskId] = {
            id: taskId,
            name: taskData.name,
            description: taskData.description || '',
            status: 'not-started',
            priority: taskData.priority || 'medium',
            assignee: taskData.assignee || null,
            dueDate: taskData.dueDate || null,
            completedAt: null,
            blockers: [],
            ...taskData
        };

        await this.saveProgress();
        console.log(`📝 Added task '${taskData.name}' to ${phase.name}`);
    }

    async updateTaskStatus(phaseId, taskId, status, notes = '') {
        const phase = this.progressData.phases[phaseId];
        const task = phase?.tasks[taskId];

        if (!task) {
            throw new Error(`Task '${taskId}' not found in phase '${phaseId}'`);
        }

        task.status = status;
        task.lastUpdated = new Date().toISOString();

        if (status === 'completed') {
            task.completedAt = new Date().toISOString();
        }

        if (notes) {
            task.notes = task.notes || [];
            task.notes.push({
                timestamp: new Date().toISOString(),
                content: notes
            });
        }

        // Update phase progress
        await this.updatePhaseProgress(phaseId);
        await this.saveProgress();

        console.log(`✅ Updated task '${task.name}' status to '${status}'`);
    }

    async updatePhaseProgress(phaseId) {
        const phase = this.progressData.phases[phaseId];
        const tasks = Object.values(phase.tasks);

        if (tasks.length === 0) {
            phase.progress = 0;
            return;
        }

        const completedTasks = tasks.filter(task => task.status === 'completed').length;
        phase.progress = Math.round((completedTasks / tasks.length) * 100);
    }

    // Validation Framework
    async validatePhaseCompletion(phaseId) {
        const phase = this.progressData.phases[phaseId];
        const phaseConfig = this.config.phases[phaseId];

        if (!phaseConfig) {
            return { passed: false, failures: [`No configuration found for phase ${phaseId}`] };
        }

        const results = {
            passed: true,
            failures: [],
            warnings: [],
            details: {}
        };

        // Check task completion
        const incompleteTasks = Object.values(phase.tasks).filter(task => task.status !== 'completed');
        if (incompleteTasks.length > 0) {
            results.passed = false;
            results.failures.push(`${incompleteTasks.length} incomplete tasks: ${incompleteTasks.map(t => t.name).join(', ')}`);
        }

        // Run automated validations
        for (const [validatorName, validatorConfig] of Object.entries(phaseConfig.validators || {})) {
            try {
                const validationResult = await this.runValidator(validatorName, validatorConfig);
                results.details[validatorName] = validationResult;

                if (!validationResult.passed) {
                    results.passed = false;
                    results.failures.push(`${validatorName}: ${validationResult.message}`);
                }
            } catch (error) {
                results.passed = false;
                results.failures.push(`${validatorName}: Validation failed with error: ${error.message}`);
            }
        }

        return results;
    }

    async runValidator(validatorName, validatorConfig) {
        switch (validatorConfig.type) {
        case 'command':
            return await this.runCommandValidator(validatorConfig);
        case 'file-exists':
            return await this.runFileExistsValidator(validatorConfig);
        case 'test-suite':
            return await this.runTestSuiteValidator(validatorConfig);
        case 'audit-compliance':
            return await this.runAuditComplianceValidator(validatorConfig);
        default:
            throw new Error(`Unknown validator type: ${validatorConfig.type}`);
        }
    }

    async runCommandValidator(config) {
        try {
            const output = execSync(config.command, {
                encoding: 'utf8',
                cwd: process.cwd(),
                timeout: config.timeout || 30000
            });

            const passed = config.successPattern ?
                new RegExp(config.successPattern).test(output) :
                true;

            return {
                passed,
                message: passed ? 'Command executed successfully' : 'Command output did not match success pattern',
                output: output.trim()
            };
        } catch (error) {
            return {
                passed: false,
                message: `Command failed: ${error.message}`,
                output: error.stdout || error.message
            };
        }
    }

    async runFileExistsValidator(config) {
        try {
            await fs.access(config.filePath);
            return {
                passed: true,
                message: `File exists: ${config.filePath}`
            };
        } catch (error) {
            return {
                passed: false,
                message: `File does not exist: ${config.filePath}`
            };
        }
    }

    async runTestSuiteValidator(config) {
        try {
            const output = execSync(`npm test -- ${config.testPattern || ''}`, {
                encoding: 'utf8',
                cwd: process.cwd()
            });

            return {
                passed: true,
                message: 'All tests passed',
                output: output.trim()
            };
        } catch (error) {
            return {
                passed: false,
                message: 'Tests failed',
                output: error.stdout || error.message
            };
        }
    }

    async runAuditComplianceValidator(config) {
        try {
            const auditPath = path.join(__dirname, '../../data/audit-findings.json');
            const auditContent = await fs.readFile(auditPath, 'utf8');
            const auditData = JSON.parse(auditContent);

            const compliance = auditData.complianceValidation;
            const results = {
                passed: true,
                message: 'Audit compliance check',
                details: {},
                failures: []
            };            // Check lint compliance
            try {
                execSync(compliance.lintCompliance.command, {
                    stdio: 'pipe',
                    timeout: 30000 // 30 second timeout
                });
                results.details.lintCompliance = { passed: true, message: 'No lint errors found' };
            } catch (error) {
                results.passed = false;
                results.details.lintCompliance = { passed: false, message: 'Lint errors present' };
                results.failures.push('Lint compliance failed');
            }

            // Check visual compliance if specified in config
            if (config.checkVisualCompliance !== false) {
                try {
                    const visualResult = execSync(compliance.visualCompliance.command, {
                        encoding: 'utf8',
                        stdio: 'pipe',
                        timeout: 15000 // 15 second timeout
                    });
                    const visualPassed = visualResult.trim() === 'COMPLIANT';
                    results.details.visualCompliance = {
                        passed: visualPassed,
                        message: visualPassed ? 'Visual feedback system implemented' : 'Unused visual imports found'
                    };
                    if (!visualPassed && config.strictCompliance) {
                        results.passed = false;
                        results.failures.push('Visual compliance failed');
                    }
                } catch (error) {
                    results.details.visualCompliance = { passed: false, message: 'Could not check visual compliance' };
                    if (config.strictCompliance) {
                        results.passed = false;
                        results.failures.push('Visual compliance check failed');
                    }
                }
            }

            // Check service compliance if specified in config
            if (config.checkServiceCompliance !== false) {
                try {
                    const serviceResult = execSync(compliance.serviceCompliance.command, {
                        encoding: 'utf8',
                        stdio: 'pipe',
                        timeout: 15000 // 15 second timeout
                    });
                    const servicePassed = serviceResult.trim() === 'COMPLIANT';
                    results.details.serviceCompliance = {
                        passed: servicePassed,
                        message: servicePassed ? 'Commands use centralized services' : 'Direct database calls found'
                    };
                    if (!servicePassed && config.strictCompliance) {
                        results.passed = false;
                        results.failures.push('Service compliance failed');
                    }
                } catch (error) {
                    results.details.serviceCompliance = { passed: false, message: 'Could not check service compliance' };
                    if (config.strictCompliance) {
                        results.passed = false;
                        results.failures.push('Service compliance check failed');
                    }
                }
            }

            // Calculate overall compliance score
            const totalChecks = Object.keys(results.details).length;
            const passedChecks = Object.values(results.details).filter(detail => detail.passed).length;
            const complianceScore = Math.round((passedChecks / totalChecks) * 100);

            results.complianceScore = complianceScore;
            results.message = `Audit compliance: ${complianceScore}% (${passedChecks}/${totalChecks} checks passed)`;

            // Apply threshold-based pass/fail
            const threshold = config.minimumComplianceScore || 100;
            if (complianceScore < threshold) {
                results.passed = false;
                results.failures.push(`Compliance score ${complianceScore}% below required ${threshold}%`);
            }

            return results;

        } catch (error) {
            return {
                passed: false,
                message: `Audit compliance validation failed: ${error.message}`,
                details: {},
                failures: [`Audit data error: ${error.message}`]
            };
        }
    }

    // Reporting
    async generateProgressReport(format = 'console') {
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                currentPhase: this.progressData.currentPhase,
                overallProgress: this.calculateOverallProgress(),
                totalTasks: this.getTotalTaskCount(),
                completedTasks: this.getCompletedTaskCount(),
                blockers: this.getAllBlockers()
            },
            phases: {}
        };

        // Generate phase details
        for (const [phaseId, phase] of Object.entries(this.progressData.phases)) {
            report.phases[phaseId] = {
                name: phase.name,
                status: phase.status,
                progress: phase.progress,
                taskCount: Object.keys(phase.tasks).length,
                completedTasks: Object.values(phase.tasks).filter(t => t.status === 'completed').length,
                blockers: phase.blockers.length,
                duration: phase.startDate && phase.endDate ?
                    this.calculateDuration(phase.startDate, phase.endDate) : null
            };
        }

        switch (format) {
        case 'json':
            return JSON.stringify(report, null, 2);
        case 'markdown':
            return this.formatMarkdownReport(report);
        case 'console':
        default:
            return this.formatConsoleReport(report);
        }
    }

    formatConsoleReport(report) {
        let output = '\n🗺️  ROADMAP PROGRESS REPORT\n';
        output += '=' .repeat(50) + '\n\n';

        output += `📊 Overall Progress: ${report.summary.overallProgress}%\n`;
        output += `📋 Current Phase: ${this.progressData.phases[report.summary.currentPhase].name}\n`;
        output += `✅ Tasks: ${report.summary.completedTasks}/${report.summary.totalTasks}\n`;
        output += `🚫 Active Blockers: ${report.summary.blockers.length}\n\n`;

        output += 'PHASE STATUS:\n';
        output += '-'.repeat(30) + '\n';

        for (const [_phaseId, phaseReport] of Object.entries(report.phases)) {
            const statusIcon = this.getStatusIcon(phaseReport.status);
            output += `${statusIcon} ${phaseReport.name}: ${phaseReport.progress}% (${phaseReport.completedTasks}/${phaseReport.taskCount} tasks)\n`;
        }

        if (report.summary.blockers.length > 0) {
            output += '\n🚫 ACTIVE BLOCKERS:\n';
            output += '-'.repeat(20) + '\n';
            report.summary.blockers.forEach(blocker => {
                output += `• ${blocker.phase}: ${blocker.description}\n`;
            });
        }

        return output;
    }

    formatMarkdownReport(report) {
        let md = '# 🗺️ Roadmap Progress Report\n\n';
        md += `**Generated:** ${new Date(report.timestamp).toLocaleString()}\n\n`;

        md += '## 📊 Summary\n\n';
        md += `- **Overall Progress:** ${report.summary.overallProgress}%\n`;
        md += `- **Current Phase:** ${this.progressData.phases[report.summary.currentPhase].name}\n`;
        md += `- **Tasks Completed:** ${report.summary.completedTasks}/${report.summary.totalTasks}\n`;
        md += `- **Active Blockers:** ${report.summary.blockers.length}\n\n`;

        md += '## 📋 Phase Status\n\n';
        md += '| Phase | Status | Progress | Tasks | Blockers |\n';
        md += '|-------|--------|----------|-------|----------|\n';

        for (const [_phaseId, phaseReport] of Object.entries(report.phases)) {
            const statusIcon = this.getStatusIcon(phaseReport.status);
            md += `| ${statusIcon} ${phaseReport.name} | ${phaseReport.status} | ${phaseReport.progress}% | ${phaseReport.completedTasks}/${phaseReport.taskCount} | ${phaseReport.blockers} |\n`;
        }

        if (report.summary.blockers.length > 0) {
            md += '\n## 🚫 Active Blockers\n\n';
            report.summary.blockers.forEach(blocker => {
                md += `- **${blocker.phase}:** ${blocker.description}\n`;
            });
        }

        return md;
    }

    getStatusIcon(status) {
        const icons = {
            'not-started': '⚪',
            'ready': '🟡',
            'in-progress': '🔵',
            'completed': '✅',
            'blocked': '🔴',
            'on-hold': '⏸️'
        };
        return icons[status] || '❓';
    }

    calculateOverallProgress() {
        const phases = Object.values(this.progressData.phases);
        const totalProgress = phases.reduce((sum, phase) => sum + phase.progress, 0);
        return Math.round(totalProgress / phases.length);
    }

    getTotalTaskCount() {
        return Object.values(this.progressData.phases)
            .reduce((sum, phase) => sum + Object.keys(phase.tasks).length, 0);
    }

    getCompletedTaskCount() {
        return Object.values(this.progressData.phases)
            .reduce((sum, phase) =>
                sum + Object.values(phase.tasks).filter(task => task.status === 'completed').length, 0
            );
    }

    getAllBlockers() {
        const blockers = [];
        for (const [_phaseId, phase] of Object.entries(this.progressData.phases)) {
            phase.blockers.forEach(blocker => {
                blockers.push({
                    phase: phase.name,
                    description: blocker.description,
                    createdAt: blocker.createdAt
                });
            });
        }
        return blockers;
    }

    calculateDuration(startDate, endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffMs = end - start;
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        return `${diffDays} days`;
    }

    /**
     * Load and integrate audit findings into task management
     */
    async loadAuditFindings() {
        const auditFindings = {
            visualGaps: [],
            serviceIntegration: [],
            performance: [],
            architecture: []
        };

        try {
            // Load lint audit findings
            const lintAuditPath = path.join(__dirname, '../../lint-audit.txt');
            const lintContent = await fs.readFile(lintAuditPath, 'utf8');
            auditFindings.visualGaps = this.parseLintForVisualGaps(lintContent);
            auditFindings.serviceIntegration = this.parseLintForServiceGaps(lintContent);
        } catch (error) {
            console.warn('Could not load lint audit findings:', error.message);
        }

        try {
            // Load architecture audit findings
            const archAuditPath = path.join(__dirname, '../../docs/audits/ARCHITECTURE_AUDIT_REBUILD_PLAN.md');
            const archContent = await fs.readFile(archAuditPath, 'utf8');
            auditFindings.architecture = this.parseArchitectureAudit(archContent);
        } catch (error) {
            console.warn('Could not load architecture audit findings:', error.message);
        }

        return auditFindings;
    }

    parseLintForVisualGaps(content) {
        const visualGaps = [];
        const lines = content.split('\n');

        for (const line of lines) {
            if (line.includes('BotColors') || line.includes('StatusEmojis')) {
                const fileMatch = line.match(/\/([^/]+\.js):/);
                if (fileMatch) {
                    visualGaps.push({
                        file: fileMatch[1],
                        type: line.includes('BotColors') ? 'colors' : 'status',
                        priority: 'high',
                        description: `Visual feedback system not implemented in ${fileMatch[1]}`
                    });
                }
            }
        }

        return visualGaps;
    }

    parseLintForServiceGaps(content) {
        const serviceGaps = [];
        const lines = content.split('\n');

        for (const line of lines) {
            if (line.includes('Service') && line.includes('unused')) {
                const fileMatch = line.match(/\/([^/]+\.js):/);
                if (fileMatch) {
                    serviceGaps.push({
                        file: fileMatch[1],
                        type: 'service-integration',
                        priority: 'critical',
                        description: `Service imported but not used in ${fileMatch[1]}`
                    });
                }
            }
        }

        return serviceGaps;
    }

    parseArchitectureAudit(content) {
        const findings = [];

        if (content.includes('Service Integration')) {
            findings.push({
                category: 'service-coupling',
                priority: 'critical',
                description: 'Commands import services but use direct database calls'
            });
        }

        if (content.includes('Missing Feature')) {
            findings.push({
                category: 'incomplete-features',
                priority: 'high',
                description: 'Features partially implemented but not user-visible'
            });
        }

        return findings;
    }

    /**
     * Generate audit-driven tasks for a phase
     */
    async generateAuditDrivenTasks(phaseId) {
        const auditFindings = await this.loadAuditFindings();
        const tasks = [];

        // Generate tasks based on audit findings
        if (phaseId === 'phase-2-point-system-redesign') {
            // Visual feedback system tasks
            if (auditFindings.visualGaps.length > 0) {
                tasks.push({
                    id: 'visual-feedback-implementation',
                    name: 'Implement Visual Feedback System',
                    description: `Fix ${auditFindings.visualGaps.length} visual feedback gaps identified in audit`,
                    priority: 'high',
                    auditFindings: auditFindings.visualGaps,
                    successCriteria: [
                        'All commands use BotColors for branding',
                        'All status responses use StatusEmojis',
                        'Zero unused visual imports'
                    ]
                });
            }

            // Service integration tasks
            if (auditFindings.serviceIntegration.length > 0) {
                tasks.push({
                    id: 'service-integration-compliance',
                    name: 'Fix Service Integration Issues',
                    description: `Resolve ${auditFindings.serviceIntegration.length} service integration gaps`,
                    priority: 'critical',
                    auditFindings: auditFindings.serviceIntegration,
                    successCriteria: [
                        'All commands use centralized services',
                        'Zero unused service imports',
                        'No direct database calls in commands'
                    ]
                });
            }
        }

        return tasks;
    }

    /**
     * Enhanced task creation with audit findings integration
     */
    async createTaskWithAuditContext(phaseId, taskData) {
        const auditFindings = await this.loadAuditFindings();

        // Enhance task with relevant audit findings
        const relevantFindings = this.getRelevantAuditFindings(taskData.name, auditFindings);

        if (relevantFindings.length > 0) {
            taskData.auditContext = {
                relatedFindings: relevantFindings,
                complianceChecks: this.generateComplianceChecks(relevantFindings),
                validationCriteria: this.generateValidationCriteria(relevantFindings)
            };
        }

        return await this.createTask(phaseId, taskData);
    }

    getRelevantAuditFindings(taskName, auditFindings) {
        const relevant = [];
        const taskLower = taskName.toLowerCase();

        if (taskLower.includes('visual') || taskLower.includes('ui')) {
            relevant.push(...auditFindings.visualGaps);
        }

        if (taskLower.includes('service') || taskLower.includes('architecture')) {
            relevant.push(...auditFindings.serviceIntegration);
        }

        return relevant;
    }

    generateComplianceChecks(findings) {
        return findings.map(finding => ({
            type: 'audit-compliance',
            description: `Verify ${finding.description} is resolved`,
            validationCommand: finding.type === 'colors' || finding.type === 'status'
                ? 'npm run lint'
                : 'npm run test'
        }));
    }

    generateValidationCriteria(findings) {
        return findings.map(finding => `Resolve: ${finding.description}`);
    }

    /**
     * Show audit findings relevant to current development
     */
    async showAuditFindings(category = 'all') {
        try {
            const auditPath = path.join(__dirname, '../../data/audit-findings.json');
            const auditContent = await fs.readFile(auditPath, 'utf8');
            const auditData = JSON.parse(auditContent);

            console.log('\n🔍 AUDIT FINDINGS SUMMARY\n');
            console.log('='.repeat(50));

            const findings = auditData.auditFindings;

            if (category === 'all' || category === 'visual') {
                this.displayAuditCategory('Visual Feedback Gaps', findings.visualFeedbackGaps);
            }

            if (category === 'all' || category === 'service') {
                this.displayAuditCategory('Service Integration Gaps', findings.serviceIntegrationGaps);
            }

            if (category === 'all' || category === 'features') {
                this.displayAuditCategory('Incomplete Features', findings.incompleteFeatures);
            }

            if (category === 'all' || category === 'architecture') {
                this.displayAuditCategory('Architectural Inconsistencies', findings.architecturalInconsistencies);
            }

            console.log('\n📋 AUDIT-DRIVEN DEVELOPMENT CHECKLIST:');
            console.log('- Reference audit findings during feature design');
            console.log('- Validate compliance before phase completion');
            console.log('- Use audit data to prioritize technical debt');
            console.log('\n💡 Use: npm run roadmap-audit-compliance <phase> to check compliance');

        } catch (error) {
            console.error('❌ Error loading audit findings:', error.message);
        }
    }

    displayAuditCategory(title, finding) {
        if (!finding) {
            console.log(`\n📊 ${title.toUpperCase()}: No findings`);
            return;
        }

        console.log(`\n📊 ${title.toUpperCase()}`);
        console.log(`Priority: ${finding.priority ? finding.priority.toUpperCase() : 'N/A'} | Count: ${finding.count || 0}`);
        console.log(`Description: ${finding.description || 'No description available'}`);
        console.log(`Target Phase: ${finding.targetPhase || 'Not specified'}`);

        if (finding.affectedFiles && finding.affectedFiles.length > 0) {
            console.log(`Affected Files: ${finding.affectedFiles.length} files`);
        }

        if (finding.implementationRequirements && finding.implementationRequirements.length > 0) {
            console.log('Implementation Requirements:');
            finding.implementationRequirements.forEach(req => console.log(`  - ${req}`));
        }

        if (finding.successCriteria && finding.successCriteria.length > 0) {
            console.log('Success Criteria:');
            finding.successCriteria.forEach(criteria => console.log(`  ✓ ${criteria}`));
        }
    }

    /**
     * Check audit compliance for a phase
     */
    async checkAuditCompliance(phaseId) {
        try {
            const auditPath = path.join(__dirname, '../../data/audit-findings.json');
            const auditContent = await fs.readFile(auditPath, 'utf8');
            const auditData = JSON.parse(auditContent);

            console.log(`\n🔍 AUDIT COMPLIANCE CHECK: ${phaseId.toUpperCase()}\n`);
            console.log('='.repeat(60));

            const compliance = auditData.complianceValidation;
            let totalChecks = 0;
            let passedChecks = 0;

            // Check lint compliance
            totalChecks++;
            console.log('\n📋 Lint Compliance Check:');
            try {
                execSync(compliance.lintCompliance.command, { stdio: 'pipe' });
                console.log('✅ PASSED: No lint errors found');
                passedChecks++;
            } catch (error) {
                console.log('❌ FAILED: Lint errors present');
                console.log('   Fix with: npm run lint:fix');
            }

            // Check visual compliance
            totalChecks++;
            console.log('\n🎨 Visual Feedback Compliance Check:');
            try {
                const result = execSync(compliance.visualCompliance.command, {
                    encoding: 'utf8',
                    stdio: 'pipe'
                });
                if (result.includes('COMPLIANT')) {
                    console.log('✅ PASSED: Visual feedback system implemented');
                    passedChecks++;
                } else {
                    console.log('❌ FAILED: Unused visual imports found');
                }
            } catch (error) {
                console.log('⚠️ WARNING: Could not check visual compliance');
            }

            // Check service compliance
            totalChecks++;
            console.log('\n🏗️ Service Layer Compliance Check:');
            try {
                const result = execSync(compliance.serviceCompliance.command, {
                    encoding: 'utf8',
                    stdio: 'pipe'
                });
                if (result.includes('COMPLIANT')) {
                    console.log('✅ PASSED: Commands use centralized services');
                    passedChecks++;
                } else {
                    console.log('❌ FAILED: Direct database calls found in commands');
                }
            } catch (error) {
                console.log('⚠️ WARNING: Could not check service compliance');
            }

            // Overall compliance score
            const complianceScore = Math.round((passedChecks / totalChecks) * 100);
            console.log(`\n📊 OVERALL AUDIT COMPLIANCE: ${complianceScore}% (${passedChecks}/${totalChecks})`);

            if (complianceScore === 100) {
                console.log('🎉 Full audit compliance achieved!');
                console.log('✅ Phase can proceed to completion');
            } else {
                console.log('⚠️ Audit compliance incomplete');
                console.log('❌ Phase completion blocked until compliance achieved');
            }

            return complianceScore;

        } catch (error) {
            console.error('❌ Error checking audit compliance:', error.message);
            return 0;
        }
    }

    /**
     * Generate audit-driven tasks for the next phase
     */
    async generateAuditTasks(phaseId) {
        try {
            const auditPath = path.join(__dirname, '../../data/audit-findings.json');
            const auditContent = await fs.readFile(auditPath, 'utf8');
            const auditData = JSON.parse(auditContent);

            console.log(`\n📋 AUDIT-DRIVEN TASKS FOR: ${phaseId.toUpperCase()}\n`);
            console.log('='.repeat(60));

            const findings = auditData.auditFindings;
            const tasks = [];

            // Generate tasks based on target phase
            Object.entries(findings).forEach(([key, finding]) => {
                if (finding.targetPhase === phaseId) {
                    const taskId = `audit-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
                    tasks.push({
                        id: taskId,
                        name: `Resolve ${key.replace(/([A-Z])/g, ' $1')}`,
                        description: finding.description,
                        priority: finding.priority,
                        auditContext: {
                            category: key,
                            count: finding.count,
                            requirements: finding.implementationRequirements,
                            successCriteria: finding.successCriteria,
                            affectedFiles: finding.affectedFiles
                        }
                    });
                }
            });

            if (tasks.length === 0) {
                console.log('ℹ️ No audit-driven tasks found for this phase');
                return;
            }

            console.log(`Found ${tasks.length} audit-driven tasks:\n`);

            tasks.forEach(task => {
                console.log(`📌 ${task.name} (${task.priority.toUpperCase()})`);
                console.log(`   Description: ${task.description}`);
                console.log(`   Audit Context: ${task.auditContext.count} items to resolve`);
                console.log(`   Files Affected: ${task.auditContext.affectedFiles?.length || 0} files`);
                console.log('   Success Criteria:');
                task.auditContext.successCriteria.forEach(criteria => {
                    console.log(`     ✓ ${criteria}`);
                });
                console.log('');
            });

            console.log('💡 Use these tasks to create phase-specific work items');
            console.log('💡 All tasks include audit context for compliance validation');

        } catch (error) {
            console.error('❌ Error generating audit tasks:', error.message);
        }
    }
}

// CLI Interface
async function main() {
    const tracker = new RoadmapProgressTracker();
    await tracker.initialize();

    const command = process.argv[2];
    const args = process.argv.slice(3);

    try {
        switch (command) {
        case 'status': {
            const report = await tracker.generateProgressReport('console');
            console.log(report);
            break;
        }

        case 'report': {
            const format = args[0] || 'console';
            const reportOutput = await tracker.generateProgressReport(format);
            console.log(reportOutput);
            break;
        }

        case 'start-phase':
            if (!args[0]) {
                console.error('❌ Phase ID required');
                process.exit(1);
            }
            await tracker.startPhase(args[0]);
            break;

        case 'complete-phase':
            if (!args[0]) {
                console.error('❌ Phase ID required');
                process.exit(1);
            }
            await tracker.completePhase(args[0]);
            break;

        case 'add-task':
            if (args.length < 3) {
                console.error('❌ Usage: add-task <phaseId> <taskId> <taskName>');
                process.exit(1);
            }
            await tracker.addTask(args[0], args[1], { name: args[2] });
            break;

        case 'update-task':
            if (args.length < 3) {
                console.error('❌ Usage: update-task <phaseId> <taskId> <status>');
                process.exit(1);
            }
            await tracker.updateTaskStatus(args[0], args[1], args[2], args[3] || '');
            break;

        case 'validate': {
            if (!args[0]) {
                console.error('❌ Phase ID required');
                process.exit(1);
            }
            const validation = await tracker.validatePhaseCompletion(args[0]);
            console.log('🔍 Validation Results:');
            console.log(`Status: ${validation.passed ? '✅ PASSED' : '❌ FAILED'}`);
            if (validation.failures.length > 0) {
                console.log('\nFailures:');
                validation.failures.forEach(failure => console.log(`• ${failure}`));
            }
            break;
        }

        case 'audit-findings':
            {
                const category = args[0] || 'all';
                await tracker.showAuditFindings(category);
            }
            break;

        case 'audit-compliance':
            if (!args[0]) {
                console.error('❌ Phase ID required');
                process.exit(1);
            }
            await tracker.checkAuditCompliance(args[0]);
            break;

        case 'audit-tasks':
            if (!args[0]) {
                console.error('❌ Phase ID required');
                process.exit(1);
            }
            await tracker.generateAuditTasks(args[0]);
            break;

        case 'milestone-validate-start':
            if (!args[0]) {
                console.error('❌ Phase ID required');
                process.exit(1);
            }
            {
                const MilestoneValidator = require('./milestone-validator');
                const milestoneValidator = new MilestoneValidator();
                await milestoneValidator.initialize();
                const validation = await milestoneValidator.validatePhaseStart(args[0]);

                console.log('🔍 Phase Start Validation Results:');
                console.log(`Status: ${validation.canStart ? '✅ CAN START' : '❌ BLOCKED'}`);
                console.log(`Timestamp: ${validation.timestamp}`);

                if (validation.blockers.length > 0) {
                    console.log('\nBlockers:');
                    validation.blockers.forEach(blocker => console.log(`• ${blocker}`));
                }

                if (validation.warnings.length > 0) {
                    console.log('\nWarnings:');
                    validation.warnings.forEach(warning => console.log(`• ${warning}`));
                }
            }
            break;

        case 'milestone-validate-complete':
            if (!args[0]) {
                console.error('❌ Phase ID required');
                process.exit(1);
            }
            {
                const MilestoneValidator = require('./milestone-validator');
                const milestoneValidator = new MilestoneValidator();
                await milestoneValidator.initialize();
                const validation = await milestoneValidator.validatePhaseCompletion(args[0]);

                console.log('🔍 Phase Completion Validation Results:');
                console.log(`Status: ${validation.canComplete ? '✅ CAN COMPLETE' : '❌ BLOCKED'}`);
                console.log(`Timestamp: ${validation.timestamp}`);

                if (validation.failures.length > 0) {
                    console.log('\nFailures:');
                    validation.failures.forEach(failure => console.log(`• ${failure}`));
                }

                if (validation.warnings.length > 0) {
                    console.log('\nWarnings:');
                    validation.warnings.forEach(warning => console.log(`• ${warning}`));
                }

                // Show detailed validation results
                console.log('\n📋 Detailed Validation Results:');
                Object.entries(validation.checks).forEach(([checkName, checkResult]) => {
                    const status = checkResult.passed ? '✅' : '❌';
                    console.log(`  ${status} ${checkName}: ${checkResult.passed ? 'PASSED' : 'FAILED'}`);
                });
            }
            break;

        case 'milestone-health':
            {
                const MilestoneValidator = require('./milestone-validator');
                const milestoneValidator = new MilestoneValidator();
                await milestoneValidator.initialize();
                const health = await milestoneValidator.validateRoadmapHealth();

                console.log('🏥 Roadmap Health Check Results:');
                console.log(`Overall Status: ${health.overall.toUpperCase()}`);
                console.log(`Timestamp: ${health.timestamp}`);

                if (health.issues.length > 0) {
                    console.log('\n🚨 Issues:');
                    health.issues.forEach(issue => console.log(`• ${issue}`));
                }

                if (health.warnings.length > 0) {
                    console.log('\n⚠️  Warnings:');
                    health.warnings.forEach(warning => console.log(`• ${warning}`));
                }

                if (health.recommendations.length > 0) {
                    console.log('\n💡 Recommendations:');
                    health.recommendations.forEach(rec => console.log(`• ${rec}`));
                }
            }
            break;

        case undefined:
        case 'help':
        case '--help':
        case '-h':
        default:
            console.log(`
🗺️  Discord Bot Roadmap Progress Tracker

Usage:
  node progress-tracker.js <command> [args]

Commands:
  status                                 Show current progress status
  report [format]                        Generate progress report (console|json|markdown)
  start-phase <phaseId>                  Start a new phase
  complete-phase <phaseId>               Complete a phase (validates first)
  add-task <phaseId> <taskId> <name>     Add a task to a phase
  update-task <phaseId> <taskId> <status> [notes]  Update task status
  validate <phaseId>                     Validate phase completion criteria
  audit-findings [category]              Show audit findings (all|visual|service|features|architecture)
  audit-compliance <phaseId>             Check audit compliance for phase
  audit-tasks <phaseId>                  Generate audit-driven tasks for phase

Milestone Validation:
  milestone-validate-start <phaseId>     Validate that a phase can be started
  milestone-validate-complete <phaseId>  Validate that a phase can be completed
  milestone-health                       Run comprehensive roadmap health check

Phase IDs:
  phase-1-foundation    Product Foundation Audit
  phase-2-point-system  Point System Redesign
  phase-3-commands      Command Enhancement
  phase-4-infrastructure Infrastructure Hardening
  phase-5-integration   Integration & Testing
                `);
            break;
        }
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = RoadmapProgressTracker;
