#!/usr/bin/env node

/**
 * Discord Bot Functional Health Check
 *
 * Tests actual bot functionality, not file existence.
 * This is what senior Discord bot developers actually need.
 */

const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

class BotHealthChecker {
    constructor() {
        this.results = {
            timestamp: new Date().toISOString(),
            overall: 'unknown',
            checks: []
        };
    }

    /**
     * Test if bot can connect to Discord
     */
    async testDiscordConnection() {
        console.log('🔌 Testing Discord API connection...');

        if (!process.env.DISCORD_TOKEN) {
            return this.addResult('Discord Connection', false, 'No DISCORD_TOKEN found');
        }

        try {
            const client = new Client({
                intents: [GatewayIntentBits.Guilds]
            });

            return new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    client.destroy();
                    resolve(this.addResult('Discord Connection', false, 'Connection timeout'));
                }, 10000);

                client.once('ready', () => {
                    clearTimeout(timeout);
                    client.destroy();
                    resolve(this.addResult('Discord Connection', true, `Connected as ${client.user?.tag}`));
                });

                client.once('error', (error) => {
                    clearTimeout(timeout);
                    client.destroy();
                    resolve(this.addResult('Discord Connection', false, error.message));
                });

                client.login(process.env.DISCORD_TOKEN).catch((error) => {
                    clearTimeout(timeout);
                    resolve(this.addResult('Discord Connection', false, error.message));
                });
            });
        } catch (error) {
            return this.addResult('Discord Connection', false, error.message);
        }
    }

    /**
     * Test database connectivity
     */
    async testDatabaseConnection() {
        console.log('🗃️  Testing database connection...');

        try {
            // Use the same configuration as the main app
            const { Pool } = require('pg');
            const pool = new Pool({
                user: process.env.DB_USER || 'postgres',
                host: process.env.DB_HOST || 'localhost',
                database: process.env.DB_NAME || 'discord_bot',
                password: process.env.DB_PASSWORD || 'postgres',
                port: process.env.DB_PORT || 5432,
                ssl: false,
                connectionTimeoutMillis: 5000
            });

            await pool.query('SELECT 1 as health_check');
            await pool.end();
            return this.addResult('Database Connection', true, 'Connected successfully');
        } catch (error) {
            return this.addResult('Database Connection', false, error.message);
        }
    }

    /**
     * Test if commands are loadable
     */
    async testCommandsLoadable() {
        console.log('⚡ Testing command loading...');

        try {
            const commandsPath = path.join(__dirname, '../../src/commands');
            const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

            let loadedCommands = 0;
            const errors = [];

            for (const file of commandFiles) {
                try {
                    const commandPath = path.join(commandsPath, file);
                    // Clear require cache to ensure fresh load
                    delete require.cache[require.resolve(commandPath)];
                    require(commandPath);
                    loadedCommands++;
                } catch (error) {
                    errors.push(`${file}: ${error.message}`);
                }
            }

            if (errors.length === 0) {
                return this.addResult('Command Loading', true, `${loadedCommands} commands loaded successfully`);
            } else {
                return this.addResult('Command Loading', false, `Errors: ${errors.join('; ')}`);
            }
        } catch (error) {
            return this.addResult('Command Loading', false, error.message);
        }
    }

    /**
     * Add a test result
     */
    addResult(name, passed, details) {
        const result = {
            name,
            status: passed ? 'PASS' : 'FAIL',
            details,
            timestamp: new Date().toISOString()
        };

        this.results.checks.push(result);
        console.log(`${passed ? '✅' : '❌'} ${name}: ${details}`);

        return result;
    }

    /**
     * Run all health checks
     */
    async runAllChecks() {
        console.log('🏥 Starting Bot Functional Health Check\n');

        await this.testDiscordConnection();
        await this.testDatabaseConnection();
        await this.testCommandsLoadable();

        // Calculate overall status
        const failedChecks = this.results.checks.filter(check => check.status === 'FAIL');
        this.results.overall = failedChecks.length === 0 ? 'HEALTHY' : 'UNHEALTHY';

        // Display summary
        console.log('\n📊 Health Check Summary:');
        console.log(`Overall Status: ${this.results.overall}`);
        console.log(`Checks Passed: ${this.results.checks.length - failedChecks.length}/${this.results.checks.length}`);

        if (failedChecks.length > 0) {
            console.log('\n❌ Failed Checks:');
            failedChecks.forEach(check => {
                console.log(`  • ${check.name}: ${check.details}`);
            });
        }

        return this.results.overall === 'HEALTHY';
    }
}

// Run health check if called directly
if (require.main === module) {
    const checker = new BotHealthChecker();
    checker.runAllChecks()
        .then(healthy => {
            process.exit(healthy ? 0 : 1);
        })
        .catch(error => {
            console.error('Health check failed:', error);
            process.exit(1);
        });
}

module.exports = { BotHealthChecker };
