import type { Config } from 'jest';
import { createDefaultPreset } from 'ts-jest';

const tsJestTransformCfg = createDefaultPreset().transform;

const config: Config =  {
    testEnvironment: 'node',
    transform: {
        ...tsJestTransformCfg
    },
    extensionsToTreatAsEsm: ['.ts'],
    roots: ['<rootDir>/src', '<rootDir>/tests'],
    testMatch: [
        '**/__tests__/**/*.ts',
        '**/?(*.)+(spec|test).ts'
    ],
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/index.ts',
        '!src/register-commands.ts'
    ],
    coverageDirectory: 'coverage',
    coverageReporters: [
        'text',
        'html',
        'lcov'
    ],
    setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
    testTimeout: 30000,
    verbose: true
};

export default config;
