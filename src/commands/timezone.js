const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const timezoneService = require('../services/timezoneService');
const { BotColors, StatusEmojis } = require('../utils/visualHelpers');
const { safeDeferReply, safeErrorReply } = require('../utils/interactionUtils');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const relativeTime = require('dayjs/plugin/relativeTime');

// Extend dayjs with timezone and relative time support
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);

// Common timezone mappings for user convenience
const COMMON_TIMEZONES = [
    { name: 'Eastern Time (US & Canada)', value: 'America/New_York' },
    { name: 'Central Time (US & Canada)', value: 'America/Chicago' },
    { name: 'Mountain Time (US & Canada)', value: 'America/Denver' },
    { name: 'Pacific Time (US & Canada)', value: 'America/Los_Angeles' },
    { name: 'Alaska Time', value: 'America/Anchorage' },
    { name: 'Hawaii Time', value: 'Pacific/Honolulu' },
    { name: 'Greenwich Mean Time', value: 'GMT' },
    { name: 'Central European Time', value: 'Europe/Berlin' },
    { name: 'Eastern European Time', value: 'Europe/Athens' },
    { name: 'British Summer Time', value: 'Europe/London' },
    { name: 'Japan Standard Time', value: 'Asia/Tokyo' },
    { name: 'China Standard Time', value: 'Asia/Shanghai' },
    { name: 'India Standard Time', value: 'Asia/Kolkata' },
    { name: 'Australian Eastern Time', value: 'Australia/Sydney' },
    { name: 'Australian Central Time', value: 'Australia/Adelaide' },
    { name: 'Australian Western Time', value: 'Australia/Perth' }
];

function createTimezoneEmbed(userTimezone, userLocalTime, nextResets) {
    const embed = new EmbedBuilder()
        .setColor(BotColors.SUCCESS)
        .setTitle(`${StatusEmojis.CLOCK} Your Timezone Settings`)
        .addFields(
            {
                name: '🌍 Current Timezone',
                value: `\`${userTimezone}\``,
                inline: true
            },
            {
                name: '🕐 Your Local Time',
                value: `${userLocalTime}`,
                inline: true
            },
            {
                name: '\u200B',
                value: '\u200B',
                inline: true
            }
        );

    if (nextResets) {
        embed.addFields(
            {
                name: '📅 Next Daily Reset',
                value: nextResets.daily,
                inline: true
            },
            {
                name: '🗓️ Next Monthly Reset',
                value: nextResets.monthly,
                inline: true
            }
        );
    }

    embed.setFooter({
        text: 'Use /timezone set <timezone> to change your timezone • /timezone list to see common timezones'
    });

    return embed;
}

function createTimezoneListEmbed() {
    const embed = new EmbedBuilder()
        .setColor(BotColors.INFO)
        .setTitle(`${StatusEmojis.INFO} Common Timezones`)
        .setDescription('Here are some commonly used timezones. You can use any valid IANA timezone identifier.');

    // Group timezones for better readability
    const groups = {
        '🇺🇸 United States': COMMON_TIMEZONES.slice(0, 6),
        '🌍 Europe & GMT': COMMON_TIMEZONES.slice(6, 10),
        '🌏 Asia & Pacific': COMMON_TIMEZONES.slice(10)
    };

    Object.entries(groups).forEach(([groupName, timezones]) => {
        const timezoneList = timezones
            .map(tz => `• **${tz.name}**: \`${tz.value}\``)
            .join('\n');
        embed.addFields({
            name: groupName,
            value: timezoneList,
            inline: false
        });
    });

    embed.addFields({
        name: '💡 Need a different timezone?',
        value: 'You can use any [IANA timezone identifier](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones). For example: `Europe/Paris`, `Asia/Tokyo`, `America/Sao_Paulo`',
        inline: false
    });

    embed.setFooter({
        text: 'Use /timezone set <timezone> to set your timezone'
    });

    return embed;
}

function createTimezoneChangeEmbed(oldTimezone, newTimezone, userLocalTime, impacts) {
    const embed = new EmbedBuilder()
        .setColor(BotColors.SUCCESS)
        .setTitle(`${StatusEmojis.SUCCESS} Timezone Updated Successfully`)
        .addFields(
            {
                name: '🔄 Change Summary',
                value: `**From:** \`${oldTimezone}\`\n**To:** \`${newTimezone}\``,
                inline: false
            },
            {
                name: '🕐 Your New Local Time',
                value: userLocalTime,
                inline: true
            }
        );

    if (impacts && impacts.length > 0) {
        embed.addFields({
            name: '⚠️ Important Changes',
            value: impacts.join('\n'),
            inline: false
        });
    }

    embed.addFields({
        name: '✅ What This Affects',
        value: [
            '• Daily reset times (streaks, voice limits)',
            '• Monthly leaderboard resets',
            '• Task deadline calculations',
            '• All time-based statistics'
        ].join('\n'),
        inline: false
    });

    embed.setFooter({
        text: 'Your stats and streaks have been preserved during this timezone change'
    });

    return embed;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('timezone')
        .setDescription('Manage your timezone settings for accurate daily/monthly resets')
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View your current timezone settings')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Set your timezone')
                .addStringOption(option =>
                    option
                        .setName('timezone')
                        .setDescription('Your timezone (e.g., America/New_York, Europe/London)')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('View common timezone options')
        ),

    async execute(interaction) {
        try {
            // Immediately defer to prevent timeout
            const deferred = await safeDeferReply(interaction);
            if (!deferred) {
                console.warn('Failed to defer timezone interaction');
                return;
            }

            const subcommand = interaction.options.getSubcommand();
            const discordId = interaction.user.id;

            switch (subcommand) {
            case 'view':
                await module.exports.handleViewTimezone(interaction, discordId);
                break;
            case 'set': {
                const timezone = interaction.options.getString('timezone');
                await module.exports.handleSetTimezone(interaction, discordId, timezone);
                break;
            }
            case 'list':
                await module.exports.handleListTimezones(interaction);
                break;
            default:
                await safeErrorReply(interaction, 'Unknown subcommand');
            }

        } catch (error) {
            console.error('Error in timezone command:', error);
            await safeErrorReply(interaction, 'An error occurred while processing your timezone request. Please try again.');
        }
    },

    async handleViewTimezone(interaction, discordId) {
        try {
            const userTimezone = await timezoneService.getUserTimezone(discordId);
            const userLocalTime = dayjs().tz(userTimezone).format('dddd, MMMM D, YYYY [at] h:mm A');

            // Get next reset times
            const nextResets = {
                daily: await module.exports.getNextResetDisplay(discordId, 'daily'),
                monthly: await module.exports.getNextResetDisplay(discordId, 'monthly')
            };

            const embed = createTimezoneEmbed(userTimezone, userLocalTime, nextResets);
            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error viewing timezone:', error);
            await safeErrorReply(interaction, 'Failed to retrieve your timezone settings. Please try again.');
        }
    },

    async handleSetTimezone(interaction, discordId, newTimezone) {
        try {
            // Validate timezone
            try {
                dayjs().tz(newTimezone);
            } catch (error) {
                const embed = new EmbedBuilder()
                    .setColor(BotColors.ERROR)
                    .setTitle(`${StatusEmojis.ERROR} Invalid Timezone`)
                    .setDescription(`The timezone \`${newTimezone}\` is not valid.`)
                    .addFields({
                        name: '💡 Tips',
                        value: [
                            '• Use `/timezone list` to see common options',
                            '• Check [IANA timezone list](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)',
                            '• Format: `Continent/City` (e.g., `America/New_York`)'
                        ].join('\n')
                    });

                return interaction.editReply({ embeds: [embed] });
            }

            // Get current timezone for comparison
            const oldTimezone = await timezoneService.getUserTimezone(discordId);

            // Handle timezone change with impact analysis
            const changeResult = await timezoneService.handleTimezoneChange(discordId, oldTimezone, newTimezone);

            const userLocalTime = dayjs().tz(newTimezone).format('dddd, MMMM D, YYYY [at] h:mm A');

            // Create impact messages
            const impacts = [];
            if (changeResult.resetTimesChanged) {
                impacts.push('🔄 Your daily/monthly reset times have been adjusted');
            }
            if (changeResult.streakPreserved) {
                impacts.push('✅ Your streak has been preserved');
            }
            if (changeResult.dstAffected) {
                impacts.push('🌅 DST transition detected - times adjusted automatically');
            }

            const embed = createTimezoneChangeEmbed(oldTimezone, newTimezone, userLocalTime, impacts);
            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error setting timezone:', error);
            await safeErrorReply(interaction, 'Failed to update your timezone. Please try again.');
        }
    },

    async handleListTimezones(interaction) {
        try {
            const embed = createTimezoneListEmbed();
            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error listing timezones:', error);
            await safeErrorReply(interaction, 'Failed to load timezone list. Please try again.');
        }
    },

    async getNextResetDisplay(discordId, resetType) {
        try {
            const nextResetTime = await timezoneService.getNextResetTimeForUser(discordId, resetType);
            const userTimezone = await timezoneService.getUserTimezone(discordId);

            const localTime = dayjs(nextResetTime).tz(userTimezone);

            const relativeTime = localTime.fromNow();
            const exactTime = localTime.format('MMM D [at] h:mm A');

            return `${exactTime} (${relativeTime})`;
        } catch (error) {
            console.error(`Error getting next ${resetType} reset:`, error);
            return 'Unable to calculate';
        }
    }
};
