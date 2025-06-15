const { SlashCommandBuilder } = require('discord.js');
const { getUserVoiceChannel } = require('../utils/voiceUtils');
const { createTimerTemplate, createErrorTemplate } = require('../utils/embedTemplates');
const { BotColors, StatusEmojis } = require('../utils/visualHelpers');
const { safeDeferReply, safeErrorReply } = require('../utils/interactionUtils');
const timezoneService = require('../services/timezoneService');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

// Extend dayjs with timezone support
dayjs.extend(utc);
dayjs.extend(timezone);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('time')
        .setDescription('Check your active Pomodoro timer status'),
    async execute(interaction, { activeVoiceTimers }) {
        try {
            // Immediately defer to prevent timeout
            const deferred = await safeDeferReply(interaction);
            if (!deferred) {
                console.warn('Failed to defer time interaction');
                return;
            }

            // Get user's voice channel
            const voiceChannel = await getUserVoiceChannel(interaction);

            if (!voiceChannel) {
                const embed = createErrorTemplate(
                    `${StatusEmojis.ERROR} Voice Channel Required`,
                    'You must be in a voice channel to check timer status and track your productivity sessions.',
                    {
                        helpText: 'Join a voice channel first, then try again',
                        additionalInfo: 'Timer status is tied to your current voice channel location.'
                    }
                );
                return interaction.editReply({ embeds: [embed] });
            }

            const voiceChannelId = voiceChannel.id;

            // Check if there's an active timer in this voice channel
            if (!activeVoiceTimers.has(voiceChannelId)) {
                const embed = createTimerTemplate('no_timer', {
                    voiceChannel: voiceChannel
                }, { includeMotivation: true });

                return interaction.editReply({ embeds: [embed] });
            }

            // Get timer info
            const timer = activeVoiceTimers.get(voiceChannelId);
            const now = new Date();
            const timeRemaining = Math.max(0, Math.ceil((timer.endTime - now) / 1000 / 60));

            const embed = createTimerTemplate('status', {
                voiceChannel: voiceChannel,
                phase: timer.phase,
                timeRemaining: timeRemaining,
                workTime: timer.phase === 'work' ? timeRemaining + Math.ceil((now - timer.startTime) / 1000 / 60) : null,
                breakTime: timer.phase === 'break' ? timeRemaining + Math.ceil((now - timer.startTime) / 1000 / 60) : null
            }, { showProgress: true });

            // Add timezone context to timer status
            try {
                const userTimezone = await timezoneService.getUserTimezone(interaction.user.id);
                const sessionEndTime = dayjs(timer.endTime).tz(userTimezone);
                const localTime = dayjs().tz(userTimezone);

                // Create timezone-aware footer
                const timerFooter = `🌍 Session ends at: ${sessionEndTime.format('h:mm A')} (${userTimezone}) | Local time: ${localTime.format('h:mm A')}`;

                // Update embed with timezone footer
                embed.setFooter({ text: timerFooter });
            } catch (error) {
                console.warn('Could not add timezone info to timer status:', error.message);
                // Use default footer if timezone fails
                embed.setFooter({ text: 'Use /stoptimer to stop early • Stay focused!' });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in /time command:', error);

            const embed = createErrorTemplate(
                'Timer Status Check Failed',
                'An error occurred while checking your timer status. Please try again in a moment.',
                { helpText: 'If this problem persists, contact support' }
            );

            await safeErrorReply(interaction, embed);
        }
    }
};
