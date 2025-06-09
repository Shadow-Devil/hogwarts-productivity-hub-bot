const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getUserVoiceChannel } = require('../utils/voiceUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('time')
        .setDescription('Check your active Pomodoro timer status'),
    async execute(interaction, { activeVoiceTimers }) {
        try {
            // Get user's voice channel
            const voiceChannel = await getUserVoiceChannel(interaction);
            
            if (!voiceChannel) {
                return interaction.reply({
                    content: `┌─────────────────────────────┐
│ 🚫 **VOICE CHANNEL REQUIRED** │
└─────────────────────────────┘

You must be in a voice channel to check timer status!

💡 *Join a voice channel first, then try again*`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            const voiceChannelId = voiceChannel.id;
            
            // Check if there's an active timer in this voice channel
            if (!activeVoiceTimers.has(voiceChannelId)) {
                const embed = new EmbedBuilder()
                    .setColor(0x95a5a6)
                    .setTitle('⏰ Timer Status')
                    .setDescription(`**No Active Timer**\n\nNo Pomodoro timer is currently running in <#${voiceChannelId}>`)
                    .addFields(
                        { name: '💡 Get Started', value: 'Use `/timer` to start a new Pomodoro session!', inline: false }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Pomodoro Timer Status' });

                return interaction.reply({ embeds: [embed] });
            }

            // Get timer info
            const timer = activeVoiceTimers.get(voiceChannelId);
            const now = new Date();
            const timeRemaining = Math.max(0, Math.ceil((timer.endTime - now) / 1000 / 60));
            const totalMinutes = Math.ceil((timer.endTime - (now - timeRemaining * 60 * 1000)) / 1000 / 60);
            
            // Calculate progress percentage
            const elapsed = totalMinutes - timeRemaining;
            const progressPercentage = Math.min(100, Math.max(0, Math.round((elapsed / totalMinutes) * 100)));
            
            // Create progress bar
            const barLength = 20;
            const filledBars = Math.round((progressPercentage / 100) * barLength);
            const emptyBars = barLength - filledBars;
            const progressBar = '█'.repeat(filledBars) + '░'.repeat(emptyBars);
            
            // Determine color and emoji based on phase
            const isWorkPhase = timer.phase === 'work';
            const color = isWorkPhase ? 0xe74c3c : 0x2ecc71;
            const phaseEmoji = isWorkPhase ? '🎯' : '☕';
            const phaseText = isWorkPhase ? 'WORK SESSION' : 'BREAK TIME';
            
            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle(`${phaseEmoji} ${phaseText} ACTIVE`)
                .setDescription(`**Current Phase:** ${timer.phase.toUpperCase()}\n**Location:** <#${voiceChannelId}>`)
                .addFields(
                    { 
                        name: '⏱️ Time Remaining', 
                        value: `**${timeRemaining} minute${timeRemaining !== 1 ? 's' : ''}**`, 
                        inline: true 
                    },
                    { 
                        name: '📊 Progress', 
                        value: `${progressPercentage}%\n\`${progressBar}\``, 
                        inline: true 
                    },
                    { 
                        name: '🔧 Controls', 
                        value: 'Use `/stoptimer` to stop early', 
                        inline: false 
                    }
                )
                .setTimestamp()
                .setFooter({ text: `${isWorkPhase ? 'Stay focused!' : 'Enjoy your break!'}` });

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in /time command:', error);
            
            if (!interaction.replied && !interaction.deferred) {
                try {
                    await interaction.reply({
                        content: '❌ An error occurred while checking timer status.',
                        flags: MessageFlags.Ephemeral,
                    });
                } catch (err) {
                    console.error('Error sending time error reply:', err);
                }
            }
        }
    }
};