// Test script to verify getUserTasks functionality
console.log('Testing getUserTasks functionality...');

const taskService = require('./src/services/taskService');

async function testGetUserTasks() {
    try {
        console.log('Testing getUserTasks...');
        
        const testDiscordId = '123456789012345678';
        
        console.log('Getting tasks for discord ID:', testDiscordId);
        
        const result = await taskService.getUserTasks(testDiscordId);
        
        console.log('Result:', result);
        console.log('Number of tasks:', result.length);
        
        if (Array.isArray(result)) {
            console.log('✅ SUCCESS: getUserTasks is working correctly!');
            result.forEach((task, index) => {
                console.log(`Task ${index + 1}:`, {
                    id: task.id,
                    title: task.title,
                    is_complete: task.is_complete,
                    created_at: task.created_at
                });
            });
        } else {
            console.log('❌ FAILURE: getUserTasks did not return an array');
        }
        
    } catch (error) {
        console.error('❌ ERROR:', error);
    }
    
    process.exit(0);
}

testGetUserTasks();
