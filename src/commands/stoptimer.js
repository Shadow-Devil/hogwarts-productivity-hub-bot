const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getUserVoiceChannel } = require('../utils/voiceUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stoptimer')
        .setDescription('Stop the active Pomodoro timer in your voice channel'),
    async execute(interaction, { activeVoiceTimers }) {
        try {
            // Use the reliable voice channel detection utility
            const voiceChannel = await getUserVoiceChannel(interaction);
            
            if (!voiceChannel) {
                return interaction.reply({
                    content: `┌─────────────────────────────┐
│ 🚫 **VOICE CHANNEL REQUIRED** │
└─────────────────────────────┘

You must be in a voice channel to stop a timer!

💡 *Join the voice channel with an active timer*`,
                });
            }
            
            const voiceChannelId = voiceChannel.id;
            if (!activeVoiceTimers.has(voiceChannelId)) {
                return interaction.reply({
                    content: `┌─────────────────────────────┐
│ ❌ **NO ACTIVE TIMER FOUND** │
└─────────────────────────────┘

No timer is currently running in <#${voiceChannelId}>

💡 *Use \`/timer\` to start a new Pomodoro session*`,
                });
            }
            const timer = activeVoiceTimers.get(voiceChannelId);
            if (timer.workTimeout) clearTimeout(timer.workTimeout);
            if (timer.breakTimeout) clearTimeout(timer.breakTimeout);
            activeVoiceTimers.delete(voiceChannelId);
            return interaction.reply({ 
                content: `┌─────────────────────────────┐
│ 🛑 **TIMER STOPPED**        │
└─────────────────────────────┘

Timer in <#${voiceChannelId}> has been stopped successfully.

💡 *Use \`/timer\` when you're ready for another session*` 
            });
        } catch (error) {
            console.error('Error in /stoptimer:', error);
            if (!interaction.replied && !interaction.deferred) {
                try {
                    await interaction.reply({
                        content: '❌ An error occurred. Please try again later.',
                    });
                } catch (err) {
                    console.error('Error sending fallback error reply:', err);
                }
            }
        }
    }
};
