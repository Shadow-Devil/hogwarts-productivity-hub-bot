#!/usr/bin/env node

console.log('Testing database optimizer dependencies...');

try {
    console.log('Loading pool...');
    const { pool } = require('./src/models/db');
    console.log('Pool loaded successfully');

    console.log('Loading database optimizer...');
    const databaseOptimizer = require('./src/utils/databaseOptimizer');
    console.log('Database optimizer loaded successfully');

    console.log('Loading query cache...');
    const queryCache = require('./src/utils/queryCache');
    console.log('Query cache loaded successfully');

    console.log('Loading performance monitor...');
    const { performanceMonitor } = require('./src/utils/performanceMonitor');
    console.log('Performance monitor loaded successfully');

    console.log('All dependencies loaded successfully!');

    // Test basic database connection
    console.log('Testing database connection...');
    pool.query('SELECT NOW() as current_time')
        .then(result => {
            console.log('Database connection successful:', result.rows[0].current_time);
            process.exit(0);
        })
        .catch(error => {
            console.error('Database connection failed:', error.message);
            process.exit(1);
        });

} catch (error) {
    console.error('Error loading dependencies:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
}
