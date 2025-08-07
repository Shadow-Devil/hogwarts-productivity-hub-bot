import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config([
  eslint.configs.recommended,
      {
        files: ['**/*.ts'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                console: 'readonly',
                process: 'readonly',
                Buffer: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                module: 'readonly',
                require: 'readonly',
                exports: 'readonly',
                global: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                "NodeJS": true
            },
        },
        rules: {
            'no-unused-vars': ['error', {
                varsIgnorePattern: '^_',
                argsIgnorePattern: '^_'
            }],
            'no-console': 'off', // Allow console for Discord bot logging
            'semi': ['error', 'always'],
            'quotes': ['error', 'single'],
            'indent': ['error', 4],
            'comma-dangle': ['error', 'never'],
            'no-trailing-spaces': 'error',
            'eol-last': 'error',
            'no-multiple-empty-lines': ['error', { max: 2 }],
            'brace-style': ['error', '1tbs'],
            'keyword-spacing': 'error',
            'space-before-blocks': 'error',
            'space-before-function-paren': ['error', 'never'],
            'object-curly-spacing': ['error', 'always'],
            'array-bracket-spacing': ['error', 'never'],
            'no-var': 'error',
            'prefer-const': 'error'
        }
    },
    tseslint.configs.base,

    {
        files: ['**/*.test.js', '**/*.spec.js', 'tests/**/*.js'],
        languageOptions: {
            globals: {
                describe: 'readonly',
                it: 'readonly',
                test: 'readonly',
                expect: 'readonly',
                beforeEach: 'readonly',
                afterEach: 'readonly',
                beforeAll: 'readonly',
                afterAll: 'readonly',
                jest: 'readonly'
            }
        }
    }
]);
