const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const sessionRecovery = require('../utils/sessionRecovery');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('recovery')
        .setDescription('View session recovery system status and force operations')
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('View session recovery system status'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('save')
                .setDescription('Force save current session states'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
    async execute(interaction) {
        try {
            await interaction.deferReply();
            
            const subcommand = interaction.options.getSubcommand();
            
            if (subcommand === 'status') {
                const stats = sessionRecovery.getRecoveryStats();
                
                const embed = new EmbedBuilder()
                    .setTitle('🛡️ Session Recovery System Status')
                    .setColor(stats.isInitialized ? 0x57F287 : 0xED4245)
                    .addFields([
                        {
                            name: '🔧 System Status',
                            value: `**Initialized:** ${stats.isInitialized ? '✅ Yes' : '❌ No'}\n**Shutting Down:** ${stats.isShuttingDown ? '🛑 Yes' : '✅ No'}\n**Periodic Saving:** ${stats.isPeriodicSavingActive ? '✅ Active' : '❌ Inactive'}`,
                            inline: true
                        },
                        {
                            name: '📊 Session Data',
                            value: `**Active Sessions:** ${stats.activeSessions}\n**Save Interval:** ${stats.saveInterval}s`,
                            inline: true
                        },
                        {
                            name: '💡 How It Works',
                            value: '• Sessions saved every 2 minutes\n• Graceful shutdown handling\n• Crash recovery on startup\n• Automatic heartbeat tracking',
                            inline: false
                        }
                    ])
                    .setFooter({ text: 'Session data is protected against crashes and server restarts' })
                    .setTimestamp();
                
                if (stats.isInitialized && stats.activeSessions > 0) {
                    embed.setDescription(`✅ **System is operational** - Currently protecting ${stats.activeSessions} active voice session${stats.activeSessions !== 1 ? 's' : ''}`);
                } else if (stats.isInitialized) {
                    embed.setDescription('✅ **System is operational** - No active sessions to protect');
                } else {
                    embed.setDescription('❌ **System not initialized** - Session recovery unavailable');
                }
                
                return interaction.editReply({ embeds: [embed] });
                
            } else if (subcommand === 'save') {
                await sessionRecovery.forceSave();
                
                const embed = new EmbedBuilder()
                    .setTitle('💾 Force Save Completed')
                    .setDescription('All active session states have been saved to the database')
                    .setColor(0x57F287)
                    .setTimestamp();
                
                return interaction.editReply({ embeds: [embed] });
            }
            
        } catch (error) {
            console.error('💥 Error in /recovery command:', {
                error: error.message,
                stack: error.stack,
                user: interaction.user.tag,
                subcommand: interaction.options.getSubcommand(),
                timestamp: new Date().toISOString()
            });
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('An error occurred while accessing the session recovery system')
                .setColor(0xED4245);
                
            try {
                if (interaction.deferred) {
                    await interaction.editReply({ embeds: [errorEmbed] });
                } else if (!interaction.replied) {
                    await interaction.reply({ embeds: [errorEmbed], flags: [MessageFlags.Ephemeral] });
                }
            } catch (replyError) {
                console.error('🔥 Error sending recovery error reply:', replyError.message);
            }
        }
    }
};
