const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const voiceStateScanner = require('../utils/voiceStateScanner');
const { createHeader, formatDataTable, createStatsCard } = require('../utils/visualHelpers');
const { safeDeferReply } = require('../utils/interactionUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('voicescan')
        .setDescription('Scan voice channels and start tracking for users already in voice')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        try {
            // Immediately defer to prevent timeout
            const deferred = await safeDeferReply(interaction);
            if (!deferred) {
                console.warn('Failed to defer voicescan interaction');
                return;
            }

            // Overall command timeout (12 seconds to stay under Discord's 15s limit)
            const commandTimeout = setTimeout(() => {
                console.warn('⏱️ /voicescan command approaching timeout limit');
            }, 12000);

            try {
                await module.exports.handleScanRun(interaction);
            } finally {
                clearTimeout(commandTimeout);
            }

        } catch (error) {
            console.error('💥 Error in /voicescan command:', {
                error: error.message,
                stack: error.stack,
                user: interaction.user.tag,
                timestamp: new Date().toISOString()
            });

            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Command Error')
                .setDescription('An unexpected error occurred while executing the voice scan command.')
                .setColor(0xED4245)
                .setTimestamp();

            try {
                if (interaction.deferred) {
                    await interaction.editReply({ embeds: [errorEmbed] });
                } else if (!interaction.replied) {
                    await interaction.reply({ embeds: [errorEmbed], flags: [MessageFlags.Ephemeral] });
                }
            } catch (replyError) {
                console.error('🔥 Failed to send error response:', replyError.message);
            }
        }
    },

    async handleScanRun(interaction) {
        // Check if scan is already running
        if (voiceStateScanner.isCurrentlyScanning()) {
            const embed = new EmbedBuilder()
                .setTitle('🔄 Voice Scan Already Running')
                .setDescription('A voice state scan is already in progress. Please wait for it to complete.')
                .setColor(0xFEE75C)
                .addFields([
                    {
                        name: '💡 Get Started',
                        value: 'The scan will begin immediately and show results when complete.',
                        inline: false
                    }
                ])
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        // Start the scan notification
        const startEmbed = new EmbedBuilder()
            .setTitle('🔍 Starting Voice State Scan')
            .setDescription('Scanning all voice channels for users to automatically start tracking...')
            .setColor(0x3498DB)
            .addFields([
                {
                    name: '⚡ Process',
                    value: 'This may take a few moments depending on server size.',
                    inline: false
                }
            ])
            .setTimestamp();

        await interaction.editReply({ embeds: [startEmbed] });

        try {
            // Get active voice sessions from the voice state update handler
            const { activeVoiceSessions } = require('../events/voiceStateUpdate');

            // Run the scan with timeout protection
            const scanPromise = voiceStateScanner.scanAndStartTracking(interaction.client, activeVoiceSessions);
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('SCAN_TIMEOUT')), 10000) // 10 second scan timeout
            );

            const scanResults = await Promise.race([scanPromise, timeoutPromise]);

            // Create comprehensive results embed
            await module.exports.sendScanResults(interaction, scanResults);

        } catch (error) {
            console.error('❌ Voice scan failed:', error);

            let errorTitle = '❌ Voice Scan Failed';
            let errorDescription = 'An error occurred during the voice scan operation.';

            if (error.message === 'SCAN_TIMEOUT') {
                errorTitle = '⏱️ Voice Scan Timeout';
                errorDescription = 'The voice scan operation timed out. This may happen during high server load or with large servers.';
            }

            const errorEmbed = new EmbedBuilder()
                .setTitle(errorTitle)
                .setDescription(errorDescription)
                .setColor(0xED4245)
                .addFields([
                    {
                        name: '🔄 Try Again',
                        value: 'You can retry the scan in a few moments when server load is lower.',
                        inline: false
                    }
                ])
                .setTimestamp();

            return interaction.editReply({ embeds: [errorEmbed] });
        }
    },

    async sendScanResults(interaction, scanResults) {
        const resultsEmbed = new EmbedBuilder()
            .setTitle(createHeader('Voice Scan Results', 'Scan Completed', '🎯', 'large'))
            .setColor(scanResults.errors > 0 ? 0xFEE75C : 0x57F287)
            .setTimestamp();

        // Scan statistics
        const scanStats = createStatsCard('Scan Statistics', {
            'Users Found': `${scanResults.totalUsersFound}`,
            'Tracking Started': `${scanResults.trackingStarted}`,
            'Channels Scanned': `${scanResults.channels.length}`,
            'Errors': `${scanResults.errors}`
        }, {
            showBigNumbers: true,
            emphasizeFirst: true
        });

        // Set description based on results
        if (scanResults.trackingStarted > 0) {
            resultsEmbed.setDescription(`✅ **Voice scan completed successfully!** Started tracking for ${scanResults.trackingStarted} users.\n\n${scanStats}`);
        } else if (scanResults.totalUsersFound > 0) {
            resultsEmbed.setDescription(`ℹ️ **Scan completed.** Found ${scanResults.totalUsersFound} users but they were already being tracked.\n\n${scanStats}`);
        } else {
            resultsEmbed.setDescription(`📭 **No users found in voice channels.** All voice channels are currently empty.\n\n${scanStats}`);
        }

        // Add channel details if any were found
        if (scanResults.channels.length > 0) {
            const channelData = scanResults.channels.map(channel => [
                channel.name.length > 20 ? channel.name.substring(0, 17) + '...' : channel.name,
                `${channel.userCount} users`
            ]);

            const channelTable = formatDataTable(channelData, [20, 15]);

            resultsEmbed.addFields([
                {
                    name: createHeader('Active Voice Channels', null, '🎤', 'emphasis'),
                    value: channelTable,
                    inline: false
                }
            ]);
        }

        // Set footer based on errors
        resultsEmbed.setFooter({
            text: scanResults.errors > 0 ?
                `Scan completed with ${scanResults.errors} errors - check logs for details` :
                'Voice state scan completed successfully'
        });

        // Send results with fallback
        try {
            return await interaction.editReply({ embeds: [resultsEmbed] });
        } catch (replyError) {
            console.error('❌ Failed to send scan results embed:', replyError);

            // Fallback to simple text response
            const fallbackMessage = `✅ Voice scan completed: ${scanResults.trackingStarted} users tracked, ${scanResults.totalUsersFound} users found in ${scanResults.channels.length} channels.`;

            try {
                return await interaction.editReply({ content: fallbackMessage });
            } catch (fallbackError) {
                console.error('❌ Even fallback response failed:', fallbackError);
            }
        }
    }
};
