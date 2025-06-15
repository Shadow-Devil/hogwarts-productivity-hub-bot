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

        // Check dependencies
        const blockedByDependencies = await this.checkPhaseDependencies(phaseId);
        if (blockedByDependencies.length > 0) {
            throw new Error(`Cannot start ${phaseId}. Blocked by incomplete dependencies: ${blockedByDependencies.join(', ')}`);
        }

        phase.status = 'in-progress';
        phase.startDate = new Date().toISOString();
        this.progressData.currentPhase = phaseId;

        await this.saveProgress();
        console.log(`✅ Started phase: ${phase.name}`);
    }

    async completePhase(phaseId) {
        const phase = this.progressData.phases[phaseId];
        if (!phase) {
            throw new Error(`Phase '${phaseId}' not found`);
        }

        // Validate completion criteria
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

        for (const [phaseId, phaseReport] of Object.entries(report.phases)) {
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
        for (const [phaseId, phase] of Object.entries(this.progressData.phases)) {
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
}

// CLI Interface
async function main() {
    const tracker = new RoadmapProgressTracker();
    await tracker.initialize();

    const command = process.argv[2];
    const args = process.argv.slice(3);

    try {
        switch (command) {
        case 'status':
            const report = await tracker.generateProgressReport('console');
            console.log(report);
            break;

        case 'report':
            const format = args[0] || 'console';
            const reportOutput = await tracker.generateProgressReport(format);
            console.log(reportOutput);
            break;

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

        case 'validate':
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
