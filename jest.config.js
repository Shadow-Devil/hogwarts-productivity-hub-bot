export {
    testEnvironment: 'node',
    roots: ['<rootDir>/src', '<rootDir>/tests'],
    testMatch: [
        '**/__tests__/**/*.js',
        '**/?(*.)+(spec|test).js'
    ],
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/index.js',
        '!src/register-commands.js'
    ],
    coverageDirectory: 'coverage',
    coverageReporters: [
        'text',
        'html',
        'lcov'
    ],
    setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
    testTimeout: 30000,
    verbose: true
};
