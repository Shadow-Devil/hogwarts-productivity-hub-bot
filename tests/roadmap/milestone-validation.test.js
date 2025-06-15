const MilestoneValidator = require('../../scripts/roadmap/milestone-validator');
const RoadmapProgressTracker = require('../../scripts/roadmap/progress-tracker');
const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

// Mock execSync to prevent hanging external commands
jest.mock('child_process', () => ({
    execSync: jest.fn()
}));

describe('Milestone Validation Integration', () => {
    let validator;
    let tracker;
    let originalProgressData;
    let originalConfigData;
    let originalAuditData;

    const testProgressPath = path.join(__dirname, '../../data/roadmap-progress.json');
    const testConfigPath = path.join(__dirname, '../../config/roadmap-config.json');
    const testAuditPath = path.join(__dirname, '../../data/audit-findings.json');

    beforeAll(async() => {
        // Backup original data
        try {
            const progressContent = await fs.readFile(testProgressPath, 'utf8');
            originalProgressData = JSON.parse(progressContent);
        } catch (error) {
            originalProgressData = null;
        }

        try {
            const configContent = await fs.readFile(testConfigPath, 'utf8');
            originalConfigData = JSON.parse(configContent);
        } catch (error) {
            originalConfigData = null;
        }

        try {
            const auditContent = await fs.readFile(testAuditPath, 'utf8');
            originalAuditData = JSON.parse(auditContent);
        } catch (error) {
            originalAuditData = null;
        }
    }, 30000);

    afterAll(async() => {
        // Restore original data
        if (originalProgressData) {
            await fs.writeFile(testProgressPath, JSON.stringify(originalProgressData, null, 2));
        }
        if (originalConfigData) {
            await fs.writeFile(testConfigPath, JSON.stringify(originalConfigData, null, 2));
        }
        if (originalAuditData) {
            await fs.writeFile(testAuditPath, JSON.stringify(originalAuditData, null, 2));
        }
    }, 10000);

    beforeEach(async() => {
        // Reset mocks
        jest.clearAllMocks();

        // Setup mock responses
        execSync.mockImplementation((command) => {
            if (command.includes('npm run lint')) {
                return ''; // Success - no output
            }
            if (command === 'echo "COMPLIANT"') {
                return 'COMPLIANT';
            }
            if (command === 'echo "NOT_COMPLIANT"') {
                return 'NOT_COMPLIANT';
            }
            if (command === 'false') {
                throw new Error('Command failed');
            }
            return 'COMPLIANT'; // Default success
        });

        // Create test data
        const testProgressData = {
            currentPhase: 'phase-1-foundation',
            metadata: {
                lastUpdated: new Date().toISOString(),
                version: '1.0.0'
            },
            phases: {
                'phase-1-foundation': {
                    name: 'Phase 1: Foundation',
                    status: 'not-started',
                    progress: 0,
                    dependencies: [],
                    tasks: {
                        'task-1': {
                            name: 'Setup basic infrastructure',
                            status: 'completed',
                            assignee: 'system',
                            priority: 'high'
                        },
                        'task-2': {
                            name: 'Implement core features',
                            status: 'in-progress',
                            assignee: 'developer',
                            priority: 'high'
                        }
                    },
                    blockers: []
                },
                'phase-2-point-system': {
                    name: 'Phase 2: Point System',
                    status: 'not-started',
                    progress: 0,
                    dependencies: ['phase-1-foundation'],
                    tasks: {},
                    blockers: []
                }
            }
        };

        const testConfigData = {
            phases: {
                'phase-1-foundation': {
                    name: 'Phase 1: Foundation',
                    description: 'Establish foundation',
                    validators: {
                        lintValidator: {
                            type: 'command',
                            command: 'npm run lint'
                        }
                    },
                    deliverables: [
                        'Core bot functionality',
                        'Basic command structure'
                    ]
                },
                'phase-2-point-system': {
                    name: 'Phase 2: Point System',
                    description: 'Implement point system',
                    validators: {},
                    deliverables: []
                }
            },
            globalValidators: {
                lintCheck: {
                    type: 'command',
                    command: 'npm run lint'
                }
            }
        };

        const testAuditData = {
            auditFindings: {
                visualFeedbackGaps: {
                    description: 'Test visual gaps',
                    priority: 'high',
                    count: 3,
                    targetPhase: 'phase-1-foundation'
                }
            },
            complianceValidation: {
                lintCompliance: {
                    command: 'npm run lint',
                    description: 'ESLint compliance check'
                },
                visualCompliance: {
                    command: 'echo "COMPLIANT"',
                    description: 'Visual compliance check'
                },
                serviceCompliance: {
                    command: 'echo "COMPLIANT"',
                    description: 'Service compliance check'
                }
            }
        };

        await fs.writeFile(testProgressPath, JSON.stringify(testProgressData, null, 2));
        await fs.writeFile(testConfigPath, JSON.stringify(testConfigData, null, 2));
        await fs.writeFile(testAuditPath, JSON.stringify(testAuditData, null, 2));

        // Initialize validator and tracker
        validator = new MilestoneValidator();
        tracker = new RoadmapProgressTracker();

        await validator.initialize();
        await tracker.initialize();
    });

    describe('Phase Start Validation', () => {
        test('should validate phase start successfully with no blockers', async() => {
            const result = await validator.validatePhaseStart('phase-1-foundation');

            expect(result).toBeDefined();
            expect(result.phaseId).toBe('phase-1-foundation');
            expect(result.canStart).toBe(true);
            expect(result.blockers).toHaveLength(0);
            expect(result.checks.dependencies).toBeDefined();
            expect(result.checks.dependencies.passed).toBe(true);
        }, 15000);

        test('should block phase start when dependencies are not met', async() => {
            const result = await validator.validatePhaseStart('phase-2-point-system');

            expect(result).toBeDefined();
            expect(result.phaseId).toBe('phase-2-point-system');
            expect(result.canStart).toBe(false);
            expect(result.blockers.length).toBeGreaterThan(0);
            expect(result.checks.dependencies).toBeDefined();
            expect(result.checks.dependencies.passed).toBe(false);
        }, 15000);

        test('should handle already started phase gracefully', async() => {
            // Mark phase as in-progress
            tracker.progressData.phases['phase-1-foundation'].status = 'in-progress';
            await tracker.saveProgress();

            // Re-initialize validator to pick up the updated data
            await validator.initialize();

            const result = await validator.validatePhaseStart('phase-1-foundation');

            expect(result).toBeDefined();
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.warnings.some(w => w.includes('already in progress'))).toBe(true);
        }, 15000);
    });

    describe('Phase Completion Validation', () => {
        test('should validate phase completion successfully', async() => {
            // Mark all tasks as completed
            tracker.progressData.phases['phase-1-foundation'].tasks['task-2'].status = 'completed';
            await tracker.saveProgress();

            // Re-initialize validator to pick up the updated data
            await validator.initialize();

            const result = await validator.validatePhaseCompletion('phase-1-foundation');

            expect(result).toBeDefined();
            expect(result.phaseId).toBe('phase-1-foundation');
            expect(result.canComplete).toBe(true);
            expect(result.failures).toHaveLength(0);
            expect(result.checks.taskCompletion).toBeDefined();
            expect(result.checks.taskCompletion.passed).toBe(true);
        }, 15000);

        test('should fail completion when tasks are incomplete', async() => {
            const result = await validator.validatePhaseCompletion('phase-1-foundation');

            expect(result).toBeDefined();
            expect(result.canComplete).toBe(false);
            expect(result.failures.length).toBeGreaterThan(0);
            expect(result.checks.taskCompletion).toBeDefined();
            expect(result.checks.taskCompletion.passed).toBe(false);
        }, 15000);

        test('should include audit compliance in completion validation', async() => {
            // Mark all tasks as completed
            tracker.progressData.phases['phase-1-foundation'].tasks['task-2'].status = 'completed';
            await tracker.saveProgress();

            const result = await validator.validatePhaseCompletion('phase-1-foundation');

            expect(result).toBeDefined();
            expect(result.checks.auditCompliance).toBeDefined();
            expect(result.checks.auditCompliance.passed).toBe(true);
            expect(result.checks.auditCompliance.complianceScore).toBeGreaterThan(0);
        }, 15000);

        test('should fail completion when audit compliance fails', async() => {
            // Mark all tasks as completed
            tracker.progressData.phases['phase-1-foundation'].tasks['task-2'].status = 'completed';
            await tracker.saveProgress();

            // Mock audit compliance failure
            execSync.mockImplementation((command) => {
                if (command.includes('npm run lint')) {
                    throw new Error('Lint errors found');
                }
                return 'COMPLIANT';
            });

            const result = await validator.validatePhaseCompletion('phase-1-foundation');

            expect(result).toBeDefined();
            expect(result.canComplete).toBe(false);
            expect(result.failures.some(f => f.includes('Audit compliance'))).toBe(true);
        }, 15000);
    });

    describe('Integration with RoadmapProgressTracker', () => {
        test('should integrate milestone validation into phase start', async() => {
            // This tests that the tracker uses milestone validation
            await expect(tracker.startPhase('phase-1-foundation')).resolves.not.toThrow();

            // Verify phase was started
            const phase = tracker.progressData.phases['phase-1-foundation'];
            expect(phase.status).toBe('in-progress');
            expect(phase.startDate).toBeDefined();
        }, 15000);

        test('should prevent phase start when milestone validation fails', async() => {
            // Try to start phase with unmet dependencies
            await expect(tracker.startPhase('phase-2-point-system'))
                .rejects.toThrow(/Phase start validation failed/);
        }, 15000);

        test('should integrate milestone validation into phase completion', async() => {
            // Start phase first
            await tracker.startPhase('phase-1-foundation');

            // Complete all tasks
            tracker.progressData.phases['phase-1-foundation'].tasks['task-2'].status = 'completed';
            await tracker.saveProgress();

            await expect(tracker.completePhase('phase-1-foundation')).resolves.not.toThrow();

            // Verify phase was completed
            const phase = tracker.progressData.phases['phase-1-foundation'];
            expect(phase.status).toBe('completed');
            expect(phase.endDate).toBeDefined();
        }, 15000);

        test('should prevent phase completion when milestone validation fails', async() => {
            // Start phase first
            await tracker.startPhase('phase-1-foundation');

            // Don't complete tasks (leave task-2 as in-progress)

            await expect(tracker.completePhase('phase-1-foundation'))
                .rejects.toThrow(/Phase completion validation failed/);
        }, 15000);
    });

    describe('Roadmap Health Check', () => {
        test('should perform comprehensive health check', async() => {
            const health = await validator.validateRoadmapHealth();

            expect(health).toBeDefined();
            expect(health.overall).toBeDefined();
            expect(['healthy', 'warning', 'unhealthy']).toContain(health.overall);
            expect(health.timestamp).toBeDefined();
            expect(health.phases).toBeDefined();
            expect(health.recommendations).toBeDefined();
        }, 15000);

        test('should detect unhealthy roadmap conditions', async() => {
            // Add some blockers to make roadmap unhealthy
            tracker.progressData.phases['phase-1-foundation'].blockers.push({
                description: 'Test blocker',
                createdAt: new Date().toISOString()
            });
            await tracker.saveProgress();

            // Re-initialize validator to pick up the updated data
            await validator.initialize();

            const health = await validator.validateRoadmapHealth();

            expect(health.overall).toBe('unhealthy');
            expect(health.issues.length).toBeGreaterThan(0);
        }, 15000);
    });

    describe('Error Handling', () => {
        test('should handle invalid phase IDs gracefully', async() => {
            const result = await validator.validatePhaseStart('invalid-phase');

            expect(result).toBeDefined();
            expect(result.canStart).toBe(false);
            expect(result.blockers.length).toBeGreaterThan(0);
        }, 15000);

        test('should handle missing audit data gracefully', async() => {
            // Remove audit data file
            await fs.unlink(testAuditPath);

            const result = await validator.validatePhaseCompletion('phase-1-foundation');

            expect(result).toBeDefined();
            expect(result.checks.auditCompliance).toBeDefined();
            expect(result.checks.auditCompliance.passed).toBe(false);
        }, 15000);
    });

    describe('Performance and Reliability', () => {
        test('should complete validation within reasonable time', async() => {
            const startTime = Date.now();

            await validator.validatePhaseStart('phase-1-foundation');

            const endTime = Date.now();
            const duration = endTime - startTime;

            // Should complete within 10 seconds
            expect(duration).toBeLessThan(10000);
        }, 15000);

        test('should handle concurrent validations', async() => {
            const promises = [
                validator.validatePhaseStart('phase-1-foundation'),
                validator.validatePhaseCompletion('phase-1-foundation'),
                validator.validateRoadmapHealth()
            ];

            const results = await Promise.allSettled(promises);

            // All should complete successfully
            results.forEach(result => {
                expect(result.status).toBe('fulfilled');
            });
        }, 15000);
    });
});
