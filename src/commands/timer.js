const { SlashCommandBuilder } = require('discord.js');
const { getUserVoiceChannel } = require('../utils/voiceUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('timer')
        .setDescription('Start a Pomodoro timer in your voice channel')
        .addIntegerOption(option =>
            option.setName('work')
                .setDescription('Work time in minutes (min 20)')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('break')
                .setDescription('Break time in minutes (min 5, optional)')
                .setRequired(false)),
    async execute(interaction, { activeVoiceTimers }) {
        try {
            // Use the reliable voice channel detection utility
            const voiceChannel = await getUserVoiceChannel(interaction);
            
            if (!voiceChannel) {
                if (!interaction.replied && !interaction.deferred) {
                    return interaction.reply({
                        content: `┌─────────────────────────────┐
│ 🚫 **VOICE CHANNEL REQUIRED** │
└─────────────────────────────┘

You must be in a voice channel to start a timer!

💡 *Join any voice channel first, then try again*`,
                    });
                }
                return;
            }
            const voiceChannelId = voiceChannel.id;
            // Enforce: only one timer per voice channel
            if (activeVoiceTimers.has(voiceChannelId)) {
                const existingTimer = activeVoiceTimers.get(voiceChannelId);
                
                // Safety check for timer data integrity
                if (!existingTimer || !existingTimer.endTime || !existingTimer.phase) {
                    console.warn(`Corrupted timer data found for channel ${voiceChannelId}, cleaning up...`);
                    activeVoiceTimers.delete(voiceChannelId);
                } else {
                    const timeRemaining = Math.ceil((existingTimer.endTime - new Date()) / 60000);
                    
                    // If timer has already expired, clean it up
                    if (timeRemaining <= 0) {
                        console.log(`Expired timer found for channel ${voiceChannelId}, cleaning up...`);
                        if (existingTimer.workTimeout) clearTimeout(existingTimer.workTimeout);
                        if (existingTimer.breakTimeout) clearTimeout(existingTimer.breakTimeout);
                        activeVoiceTimers.delete(voiceChannelId);
                    } else {
                        // Timer is valid and active, reject the new timer request
                        if (!interaction.replied && !interaction.deferred) {
                            return interaction.reply({
                                content: `┌─────────────────────────────────┐
│ ⏳ **TIMER ALREADY RUNNING**    │
└─────────────────────────────────┘

A timer is already active in <#${voiceChannelId}>!

🕒 **Current Phase:** ${existingTimer.phase.toUpperCase()}
⌛ **Time Remaining:** ${timeRemaining} minutes

🛑 *Use \`/stoptimer\` to stop the current timer first*`,
                            });
                        }
                        return;
                    }
                }
            }
            const work = interaction.options.getInteger('work');
            const breakTime = interaction.options.getInteger('break') || 0;
            if (work < 20 || (breakTime > 0 && breakTime < 5)) {
                if (!interaction.replied && !interaction.deferred) {
                    return interaction.reply({
                        content: `┌──────────────────────────────┐
│ ⚠️ **INVALID TIMER VALUES**  │
└──────────────────────────────┘

**Minimum Requirements:**
🕒 Work Time: **20 minutes**
☕ Break Time: **5 minutes** (if specified)

💡 *Try again with valid values*`,
                    });
                }
                return;
            }
            await interaction.reply({
                content: `┌─────────────────────────────────┐
│ ⏱️ **POMODORO TIMER STARTED**   │
└─────────────────────────────────┘

🕒 **Work Time:** ${work} minutes${breakTime > 0 ? `\n☕ **Break Time:** ${breakTime} minutes` : ''}
📍 **Location:** <#${voiceChannelId}>

🎯 *Focus time! Good luck with your session!*
💡 *Use \`/stoptimer\` if you need to stop early*`
            });
            const workTimeout = setTimeout(async () => {
                try {
                    await interaction.followUp({ 
                        content: `┌─────────────────────────────┐
│ 🔔 **WORK SESSION COMPLETE** │
└─────────────────────────────┘

<@${interaction.user.id}> Great work! 🎉

${breakTime > 0 ? `☕ **Break time!** Take a well-deserved ${breakTime}-minute break.\n🔔 *I'll notify you when it's time to get back to work.*` : '🎯 **Session finished!** Great job staying focused!'}`
                    });
                } catch (err) {
                    console.error('Error sending work over message:', err);
                }
                if (breakTime > 0) {
                    const breakTimeout = setTimeout(async () => {
                        try {
                            await interaction.followUp({ 
                                content: `┌─────────────────────────────┐
│ 🕒 **BREAK TIME IS OVER**    │
└─────────────────────────────┘

<@${interaction.user.id}> Break's over! 💪

🎯 **Time to get back to work!**
✨ *You've got this! Stay focused and productive!*`
                            });
                        } catch (err) {
                            console.error('Error sending break over message:', err);
                        }
                        activeVoiceTimers.delete(voiceChannelId);
                    }, breakTime * 60 * 1000);
                    activeVoiceTimers.set(voiceChannelId, {
                        breakTimeout,
                        phase: 'break',
                        endTime: new Date(Date.now() + breakTime * 60 * 1000),
                    });
                } else {
                    activeVoiceTimers.delete(voiceChannelId);
                }
            }, work * 60 * 1000);
            activeVoiceTimers.set(voiceChannelId, {
                workTimeout,
                phase: 'work',
                endTime: new Date(Date.now() + work * 60 * 1000),
            });
        } catch (error) {
            console.error('Error in /timer:', error);
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
