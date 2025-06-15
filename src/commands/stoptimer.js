const { SlashCommandBuilder } = require('discord.js');
const { getUserVoiceChannel } = require('../utils/voiceUtils');
const { createTimerTemplate, createSuccessTemplate, createErrorTemplate } = require('../utils/embedTemplates');
const { BotColors, StatusEmojis } = require('../utils/visualHelpers');
const { safeDeferReply, safeErrorReply, safeReply } = require('../utils/interactionUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stoptimer')
        .setDescription('Stop the active Pomodoro timer in your voice channel'),
    async execute(interaction, { activeVoiceTimers }) {
        try {
            // Immediately defer to prevent timeout
            const deferred = await safeDeferReply(interaction);
            if (!deferred) {
                console.warn('Failed to defer stoptimer interaction');
                return;
            }

            // Use the reliable voice channel detection utility
            const voiceChannel = await getUserVoiceChannel(interaction);

            if (!voiceChannel) {
                const embed = createErrorTemplate(
                    'Voice Channel Required',
                    'You must be in a voice channel to stop a timer and manage your productivity sessions.',
                    {
                        helpText: 'Join the voice channel with an active timer',
                        additionalInfo: 'Timer controls are tied to your current voice channel location.'
                    }
                );
                return safeReply(interaction, { embeds: [embed] });
            }

            const voiceChannelId = voiceChannel.id;
            if (!activeVoiceTimers.has(voiceChannelId)) {
                const embed = createErrorTemplate(
                    'No Active Timer Found',
                    `No Pomodoro timer is currently running in <#${voiceChannelId}>. There's nothing to stop!`,
                    {
                        helpText: 'Use `/timer <work_minutes>` to start a new Pomodoro session',
                        additionalInfo: 'Check `/time` to see if there are any active timers in your current voice channel.'
                    }
                );
                return interaction.reply({ embeds: [embed] });
            }
            const timer = activeVoiceTimers.get(voiceChannelId);
            if (timer.workTimeout) clearTimeout(timer.workTimeout);
            if (timer.breakTimeout) clearTimeout(timer.breakTimeout);
            activeVoiceTimers.delete(voiceChannelId);

            const embed = createSuccessTemplate(
                'Timer Stopped Successfully',
                `Your Pomodoro timer in <#${voiceChannelId}> has been stopped. No worries - every session counts towards building your productivity habits!`,
                {
                    helpText: 'Use `/timer <work_minutes>` when you\'re ready for another session',
                    additionalInfo: 'Remember: Consistency is key to building productive habits.'
                }
            );

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in /stoptimer:', error);

            const embed = createErrorTemplate(
                'Timer Stop Failed',
                'An error occurred while stopping your timer. Please try again in a moment.',
                { helpText: 'If this problem persists, contact support' }
            );

            await safeErrorReply(interaction, embed);
        }
    }
};
