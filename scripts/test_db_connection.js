/**
 * Simple database connection test
 */

const { Pool } = require('pg');
require('dotenv').config();

async function testConnection() {
    console.log('🔍 Testing database connection...');
    
    const pool = new Pool({
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'discord_bot',
        password: process.env.DB_PASSWORD || 'postgres',
        port: process.env.DB_PORT || 5432,
    });

    try {
        const client = await pool.connect();
        console.log('✅ Successfully connected to database');
        
        // Test basic query
        const result = await client.query('SELECT NOW() as current_time');
        console.log(`🕐 Database time: ${result.rows[0].current_time}`);
        
        // Check if our tables exist
        const tables = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name
        `);
        
        console.log('\n📋 Existing tables:');
        tables.rows.forEach(row => {
            console.log(`  • ${row.table_name}`);
        });
        
        client.release();
        await pool.end();
        
        console.log('\n✅ Database connection test completed successfully');
        return true;
        
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        console.log('\n💡 Possible solutions:');
        console.log('  1. Make sure PostgreSQL is running');
        console.log('  2. Check your .env file configuration');
        console.log('  3. Verify database credentials');
        console.log('  4. Create the database if it doesn\'t exist');
        
        await pool.end();
        return false;
    }
}

if (require.main === module) {
    testConnection();
}

module.exports = { testConnection };
