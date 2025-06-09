const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getUserVoiceChannel } = require('../utils/voiceUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('debug')
        .setDescription('Debug voice channel detection'),
    async execute(interaction, { activeVoiceTimers }) {
        try {
            console.log(`Debug command triggered by ${interaction.user.tag}`);
            
            // Test voice channel detection
            const voiceChannel = await getUserVoiceChannel(interaction);
            
            if (voiceChannel) {
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
                
                return interaction.reply({
                    content: `┌─────────────────────────────────┐
│ 🔍 **VOICE CHANNEL DEBUG INFO** │
└─────────────────────────────────┘

📍 **Channel:** ${voiceChannel.name}
🆔 **Channel ID:** ${voiceChannel.id}
🔧 **Type:** ${voiceChannel.type}
👥 **Members:** ${voiceChannel.members.size}${timerInfo}

🎯 *Debug information collected successfully!*`,
                    flags: MessageFlags.Ephemeral,
                });
            } else {
                return interaction.reply({
                    content: `┌─────────────────────────────────┐
│ ❌ **NO VOICE CHANNEL FOUND**   │
└─────────────────────────────────┘

You are not currently in a voice channel.

💡 *Join a voice channel and try again*`,
                    flags: MessageFlags.Ephemeral,
                });
            }
        } catch (error) {
            console.error('Error in /debug:', error);
            if (!interaction.replied && !interaction.deferred) {
                try {
                    await interaction.reply({
                        content: '❌ An error occurred during debug.',
                        flags: MessageFlags.Ephemeral,
                    });
                } catch (err) {
                    console.error('Error sending debug error reply:', err);
                }
            }
        }
    }
};
