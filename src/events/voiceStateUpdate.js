const voiceService = require('../services/voiceService');

// Track active voice sessions with automatic cleanup
const activeVoiceSessions = new Map(); // key: userId, value: { channelId, joinTime, sessionId }

// Cleanup old sessions every 10 minutes
setInterval(() => {
    const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
    for (const [userId, session] of activeVoiceSessions.entries()) {
        if (session.joinTime.getTime() < tenMinutesAgo) {
            console.log(`🧹 Cleaning up stale session for user ${userId}`);
            activeVoiceSessions.delete(userId);
        }
    }
}, 600000); // Run every 10 minutes

module.exports = {
    name: 'voiceStateUpdate',
    async execute(oldState, newState) {
        try {
            const user = newState.member || oldState.member;
            if (!user || user.user.bot) return; // Ignore bots

            const userId = user.id;
            const username = user.user.username;
            const oldChannel = oldState.channel;
            const newChannel = newState.channel;

            // User joined a voice channel
            if (!oldChannel && newChannel) {
                console.log(`👥 ${username} joined voice channel: ${newChannel.name}`);
                
                // Start voice session in database
                const session = await voiceService.startVoiceSession(
                    userId, 
                    username, 
                    newChannel.id, 
                    newChannel.name
                );

                // Track in memory for cleanup
                activeVoiceSessions.set(userId, {
                    channelId: newChannel.id,
                    joinTime: new Date(),
                    sessionId: session.id
                });
            }
            // User left a voice channel
            else if (oldChannel && !newChannel) {
                console.log(`👋 ${username} left voice channel: ${oldChannel.name}`);
                
                // End voice session in database with member info for house detection
                await voiceService.endVoiceSession(userId, oldChannel.id, user);
                
                // Remove from memory tracking
                activeVoiceSessions.delete(userId);
            }
            // User switched voice channels
            else if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
                console.log(`🔄 ${username} switched from ${oldChannel.name} to ${newChannel.name}`);
                
                // End session in old channel with member info for house detection
                await voiceService.endVoiceSession(userId, oldChannel.id, user);
                
                // Start session in new channel
                const session = await voiceService.startVoiceSession(
                    userId, 
                    username, 
                    newChannel.id, 
                    newChannel.name
                );

                // Update memory tracking
                activeVoiceSessions.set(userId, {
                    channelId: newChannel.id,
                    joinTime: new Date(),
                    sessionId: session.id
                });
            }
        } catch (error) {
            console.error('Error in voiceStateUpdate:', error);
        }
    }
};

// Export active sessions for potential cleanup
module.exports.activeVoiceSessions = activeVoiceSessions;
