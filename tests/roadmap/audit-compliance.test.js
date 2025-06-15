const RoadmapProgressTracker = require('../../scripts/roadmap/progress-tracker');
const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

// Mock execSync to prevent hanging external commands
jest.mock('child_process', () => ({
    execSync: jest.fn()
}));

describe('Audit Compliance Integration', () => {
    let tracker;
    let originalAuditData;
    const testAuditPath = path.join(__dirname, '../../data/audit-findings.json');

    beforeAll(async() => {
        tracker = new RoadmapProgressTracker();
        await tracker.initialize();

        // Backup original audit data
        try {
            const auditContent = await fs.readFile(testAuditPath, 'utf8');
            originalAuditData = JSON.parse(auditContent);
        } catch (error) {
            originalAuditData = null;
        }
    }, 30000); // 30 second timeout

    afterAll(async() => {
        // Restore original audit data if it existed
        if (originalAuditData) {
            await fs.writeFile(testAuditPath, JSON.stringify(originalAuditData, null, 2));
        }
    }, 10000); // 10 second timeout

    beforeEach(async() => {
        // Reset mocks
        jest.clearAllMocks();

        // Setup default successful mocks
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
        // Create test audit data
        const testAuditData = {
            auditFindings: {
                visualFeedbackGaps: {
                    description: 'Test visual gaps',
                    priority: 'high',
                    count: 5,
                    targetPhase: 'phase-2-point-system-redesign'
                }
            },
            complianceValidation: {
                lintCompliance: {
                    baseline: 97,
                    target: 0,
                    command: 'npm run lint',
                    description: 'ESLint compliance check'
                },
                visualCompliance: {
                    command: 'echo "COMPLIANT"',
                    description: 'Test visual compliance check'
                },
                serviceCompliance: {
                    command: 'echo "COMPLIANT"',
                    description: 'Test service compliance check'
                }
            }
        };

        await fs.writeFile(testAuditPath, JSON.stringify(testAuditData, null, 2));
    });

    describe('Audit Compliance Validator', () => {
        test('should pass when all compliance checks succeed', async() => {
            const config = {
                minimumComplianceScore: 100,
                strictCompliance: true,
                checkVisualCompliance: true,
                checkServiceCompliance: true
            };

            const result = await tracker.runAuditComplianceValidator(config);

            expect(result.passed).toBe(true);
            expect(result.complianceScore).toBe(100);
            expect(result.details.lintCompliance.passed).toBe(true);
            expect(result.details.visualCompliance.passed).toBe(true);
            expect(result.details.serviceCompliance.passed).toBe(true);
        }, 15000); // 15 second timeout

        test('should handle partial compliance with lenient settings', async() => {
            // Update test data to simulate partial compliance
            const testAuditData = {
                auditFindings: {},
                complianceValidation: {
                    lintCompliance: {
                        command: 'npm run lint'
                    },
                    visualCompliance: {
                        command: 'echo "NOT_COMPLIANT"'
                    },
                    serviceCompliance: {
                        command: 'echo "COMPLIANT"'
                    }
                }
            };
            await fs.writeFile(testAuditPath, JSON.stringify(testAuditData, null, 2));

            const config = {
                minimumComplianceScore: 60,
                strictCompliance: false,
                checkVisualCompliance: true,
                checkServiceCompliance: true
            };

            const result = await tracker.runAuditComplianceValidator(config);

            expect(result.passed).toBe(true);
            expect(result.complianceScore).toBeGreaterThanOrEqual(60);
            expect(result.details.visualCompliance.passed).toBe(false);
            expect(result.details.serviceCompliance.passed).toBe(true);
        });

        test('should fail when compliance score below threshold', async() => {
            // Update test data to simulate low compliance
            const testAuditData = {
                auditFindings: {},
                complianceValidation: {
                    lintCompliance: {
                        command: 'false' // This will fail
                    },
                    visualCompliance: {
                        command: 'echo "NOT_COMPLIANT"'
                    },
                    serviceCompliance: {
                        command: 'echo "NOT_COMPLIANT"'
                    }
                }
            };
            await fs.writeFile(testAuditPath, JSON.stringify(testAuditData, null, 2));

            const config = {
                minimumComplianceScore: 80,
                strictCompliance: true,
                checkVisualCompliance: true,
                checkServiceCompliance: true
            };

            const result = await tracker.runAuditComplianceValidator(config);

            expect(result.passed).toBe(false);
            expect(result.complianceScore).toBeLessThan(80);
            expect(result.failures.length).toBeGreaterThan(0);
        });

        test('should handle missing audit data gracefully', async() => {
            // Remove audit data file
            await fs.unlink(testAuditPath);

            const config = {
                minimumComplianceScore: 100,
                strictCompliance: true
            };

            const result = await tracker.runAuditComplianceValidator(config);

            expect(result.passed).toBe(false);
            expect(result.message).toContain('failed');
            expect(result.failures).toContainEqual(expect.stringMatching(/Audit data error/));
        });

        test('should respect selective compliance checking', async() => {
            const config = {
                minimumComplianceScore: 100,
                strictCompliance: true,
                checkVisualCompliance: false, // Skip visual checks
                checkServiceCompliance: true
            };

            const result = await tracker.runAuditComplianceValidator(config);

            expect(result.passed).toBe(true);
            expect(result.details.visualCompliance).toBeUndefined();
            expect(result.details.serviceCompliance).toBeDefined();
            expect(result.details.lintCompliance).toBeDefined();
        });
    });

    describe('Integration with Phase Validation', () => {
        test('should integrate audit compliance into phase completion validation', async() => {
            // Test that audit compliance is checked as part of phase validation
            const validation = await tracker.validatePhaseCompletion('phase-1-foundation');

            expect(validation.details).toHaveProperty('audit-compliance');
            expect(validation.details['audit-compliance']).toHaveProperty('passed');
            expect(validation.details['audit-compliance']).toHaveProperty('complianceScore');
        });

        test('should fail phase validation when audit compliance fails', async() => {
            // Create failing audit data
            const failingAuditData = {
                auditFindings: {},
                complianceValidation: {
                    lintCompliance: {
                        command: 'false' // This will fail
                    },
                    visualCompliance: {
                        command: 'echo "NOT_COMPLIANT"'
                    },
                    serviceCompliance: {
                        command: 'echo "NOT_COMPLIANT"'
                    }
                }
            };
            await fs.writeFile(testAuditPath, JSON.stringify(failingAuditData, null, 2));

            const validation = await tracker.validatePhaseCompletion('phase-1-foundation');

            expect(validation.passed).toBe(false);
            expect(validation.failures).toContainEqual(expect.stringMatching(/audit-compliance/));
        });
    });

    describe('Backward Compatibility', () => {
        test('should not break existing validation when audit data is missing', async() => {
            // Remove audit data
            await fs.unlink(testAuditPath);

            // Validate a phase that has other validators but no audit compliance
            const mockPhaseConfig = {
                validators: {
                    linting: {
                        type: 'command',
                        command: 'npm run lint'
                    }
                }
            };

            // This should still work for phases without audit compliance validators
            const result = await tracker.runValidator('linting', mockPhaseConfig.validators.linting);
            expect(result).toHaveProperty('passed');
        });
    });

    describe('Configuration Validation', () => {
        test('should handle invalid audit compliance configuration', async() => {
            const invalidConfig = {
                // Missing required fields
                type: 'audit-compliance'
            };

            const result = await tracker.runAuditComplianceValidator(invalidConfig);

            // Should use defaults and still attempt validation
            expect(result).toHaveProperty('passed');
            expect(result).toHaveProperty('complianceScore');
        });

        test('should apply reasonable defaults for missing config options', async() => {
            const minimalConfig = {
                type: 'audit-compliance'
            };

            const result = await tracker.runAuditComplianceValidator(minimalConfig);

            expect(result.complianceScore).toBeDefined();
            expect(typeof result.complianceScore).toBe('number');
            expect(result.complianceScore).toBeGreaterThanOrEqual(0);
            expect(result.complianceScore).toBeLessThanOrEqual(100);
        });
    });
});
