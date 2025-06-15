const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getUserVoiceChannel } = require('../utils/voiceUtils');
const { createTimerTemplate, createErrorTemplate } = require('../utils/embedTemplates');
const { BotColors, StatusEmojis } = require('../utils/visualHelpers');
const { safeDeferReply, safeErrorReply, safeReply } = require('../utils/interactionUtils');
const timezoneService = require('../services/timezoneService');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

// Extend dayjs with timezone support for timer displays
dayjs.extend(utc);
dayjs.extend(timezone);

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
            // Immediately defer to prevent timeout
            const deferred = await safeDeferReply(interaction);
            if (!deferred) {
                console.warn('Failed to defer timer interaction');
                return;
            }

            // Use the reliable voice channel detection utility
            const voiceChannel = await getUserVoiceChannel(interaction);

            if (!voiceChannel) {
                const embed = createErrorTemplate(
                    `${StatusEmojis.ERROR} Voice Channel Required`,
                    'You must be in a voice channel to start a Pomodoro timer and track your productivity.',
                    {
                        helpText: 'Join any voice channel first, then try again',
                        additionalInfo: 'Timers help you maintain focus during productive voice sessions.'
                    }
                );

                return safeReply(interaction, { embeds: [embed] });
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
                        const embed = createErrorTemplate(
                            'Timer Already Running',
                            `A Pomodoro timer is already active in <#${voiceChannelId}>! Only one timer per voice channel is allowed.`,
                            {
                                helpText: 'Use `/stoptimer` to stop the current timer first',
                                additionalInfo: `**Current Phase:** ${existingTimer.phase.toUpperCase()}\n**Time Remaining:** ${timeRemaining} minutes`
                            }
                        );

                        if (!interaction.replied && !interaction.deferred) {
                            return safeReply(interaction, { embeds: [embed] });
                        }
                        return;
                    }
                }
            }
            const work = interaction.options.getInteger('work');
            const breakTime = interaction.options.getInteger('break') || 0;
            if (work < 20 || (breakTime > 0 && breakTime < 5)) {
                const embed = createErrorTemplate(
                    'Invalid Timer Values',
                    'Please ensure your timer values meet the minimum requirements for effective productivity sessions.',
                    {
                        helpText: 'Try again with valid values',
                        additionalInfo: '**Minimum Requirements:** Work Time: **20 minutes** • Break Time: **5 minutes** (if specified)'
                    }
                );

                return safeReply(interaction, { embeds: [embed] });
            }
            const userTimezone = await timezoneService.getUserTimezone(interaction.user.id);
            const now = dayjs().tz(userTimezone);
            const startTime = now.format('HH:mm');
            const endTime = now.add(work, 'minutes').format('HH:mm');
            const breakEndTime = breakTime > 0 ? now.add(work + breakTime, 'minutes').format('HH:mm') : null;

            const embed = createTimerTemplate('start', {
                workTime: work,
                breakTime: breakTime,
                voiceChannel: voiceChannel,
                phase: 'work',
                startTime: startTime,
                endTime: endTime,
                breakEndTime: breakEndTime
            }, {
                showProgress: true,
                includeMotivation: true,
                style: 'pomodoro'
            });

            await safeReply(interaction, { embeds: [embed] });

            // Add timezone context to timer start message
            try {
                const sessionEndTime = dayjs().tz(userTimezone).add(work, 'minute');
                const timerFooter = `🌍 Session ends at: ${sessionEndTime.format('h:mm A')} (${userTimezone})`;

                // Update the embed footer with timezone info
                const updatedEmbed = createTimerTemplate('start', {
                    workTime: work,
                    breakTime: breakTime,
                    voiceChannel: voiceChannel,
                    phase: 'work'
                }, {
                    showProgress: true,
                    includeMotivation: true,
                    style: 'pomodoro',
                    customFooter: timerFooter
                });

                await interaction.editReply({ embeds: [updatedEmbed] });
            } catch (error) {
                console.warn('Could not add timezone info to timer:', error.message);
                // Timer already started, timezone display is optional
            }
            const workTimeout = setTimeout(async() => {
                try {
                    const workCompleteEmbed = createTimerTemplate('work_complete', {
                        workTime: work,
                        breakTime: breakTime,
                        voiceChannel: voiceChannel,
                        phase: 'work_complete'
                    });

                    await interaction.followUp({
                        content: `<@${interaction.user.id}>`,
                        embeds: [workCompleteEmbed]
                    });
                } catch (err) {
                    console.error('Error sending work over message:', err);
                }
                if (breakTime > 0) {
                    const breakTimeout = setTimeout(async() => {
                        try {
                            const breakCompleteEmbed = createTimerTemplate('break_complete', {
                                workTime: work,
                                breakTime: breakTime,
                                voiceChannel: voiceChannel,
                                phase: 'break_complete'
                            });

                            await interaction.followUp({
                                content: `<@${interaction.user.id}>`,
                                embeds: [breakCompleteEmbed]
                            });
                        } catch (err) {
                            console.error('Error sending break over message:', err);
                        }
                        activeVoiceTimers.delete(voiceChannelId);
                    }, breakTime * 60 * 1000);
                    activeVoiceTimers.set(voiceChannelId, {
                        breakTimeout,
                        phase: 'break',
                        endTime: new Date(Date.now() + breakTime * 60 * 1000)
                    });
                } else {
                    activeVoiceTimers.delete(voiceChannelId);
                }
            }, work * 60 * 1000);
            activeVoiceTimers.set(voiceChannelId, {
                workTimeout,
                phase: 'work',
                endTime: new Date(Date.now() + work * 60 * 1000)
            });
        } catch (error) {
            console.error('Error in /timer:', error);

            const embed = createErrorTemplate(
                'Timer Creation Failed',
                'An unexpected error occurred while starting your Pomodoro timer. Please try again in a moment.',
                { helpText: 'If this problem persists, contact support' }
            );

            await safeErrorReply(interaction, embed);
        }
    }
};
