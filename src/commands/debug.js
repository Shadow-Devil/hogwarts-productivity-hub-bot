const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getUserVoiceChannel } = require('../utils/voiceUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('debug')
        .setDescription('Debug voice channel detection'),
    async execute(interaction, { activeVoiceTimers }) {
        try {
            // Defer reply immediately to prevent timeout issues
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            
            console.log(`Debug command triggered by ${interaction.user.tag}`);
            
            // Test voice channel detection
            const voiceChannel = await getUserVoiceChannel(interaction);
            
            if (voiceChannel) {
                console.log(`Voice channel found via cached member: ${voiceChannel.name} (${voiceChannel.id})`);
                
                // Check if there's an active timer in this voice channel
                let timerInfo = '';
                if (activeVoiceTimers.has(voiceChannel.id)) {
                    const timer = activeVoiceTimers.get(voiceChannel.id);
                    const timeRemaining = Math.ceil((timer.endTime - new Date()) / 60000);
                    timerInfo = `

⏳ **ACTIVE TIMER DETECTED**
🎯 Phase: **${timer.phase.toUpperCase()}**
⏱️ Time Remaining: **${timeRemaining} minutes**`;
                } else {
                    timerInfo = `

✅ **NO ACTIVE TIMER**
💡 Ready for new timer session!`;
                }
                
                await interaction.editReply({
                    content: `┌─────────────────────────────────┐
│ 🔍 **VOICE CHANNEL DEBUG INFO** │
└─────────────────────────────────┘

📍 **Channel:** ${voiceChannel.name}
🆔 **Channel ID:** ${voiceChannel.id}
🔧 **Type:** ${voiceChannel.type}
👥 **Members:** ${voiceChannel.members.size}${timerInfo}

🔧 **Status:** Detection working correctly!`
                });
            } else {
                console.log(`User ${interaction.user.tag} is not in any voice channel`);
                
                await interaction.editReply({
                    content: `┌─────────────────────────────────┐
│ 🔍 **VOICE CHANNEL DEBUG INFO** │
└─────────────────────────────────┘

❌ **No Voice Channel Detected**
💡 Please join a voice channel first to use voice-related commands.

🔧 **Troubleshooting:**
• Make sure you're connected to a voice channel
• Try leaving and rejoining the voice channel
• Check your Discord permissions`
                });
            }
        } catch (error) {
            console.error('Error in /debug:', error);
            
            const errorMessage = '❌ Debug check failed. Please try again later.';
            try {
                if (interaction.deferred) {
                    await interaction.editReply({ content: errorMessage });
                } else if (!interaction.replied) {
                    await interaction.reply({ content: errorMessage, flags: [MessageFlags.Ephemeral] });
                }
            } catch (err) {
                console.error('Error sending debug error reply:', err);
            }
        }
    }
};
