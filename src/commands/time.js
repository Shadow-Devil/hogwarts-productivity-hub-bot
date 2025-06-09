const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const dayjs = require('dayjs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('time')
        .setDescription('Get the current server time'),
    async execute(interaction) {
        try {
            const now = dayjs();
            const embed = new EmbedBuilder()
                .setColor(0x3498db)
                .setTitle('🕐 Current Server Time')
                .setDescription(`**${now.format('MMMM D, YYYY')}**\n**${now.format('h:mm:ss A')}**`)
                .setTimestamp()
                .setFooter({ text: 'Server Time Zone: UTC' });

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in /time command:', error);
            
            if (!interaction.replied && !interaction.deferred) {
                try {
                    await interaction.reply({
                        content: '❌ An error occurred while getting the time.',
                        flags: MessageFlags.Ephemeral,
                    });
                } catch (err) {
                    console.error('Error sending time error reply:', err);
                }
            }
        }
    }
};