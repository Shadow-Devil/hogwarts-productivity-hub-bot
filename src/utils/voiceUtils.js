/**
 * Reliably get the voice channel for a user from an interaction
 * This function handles the case where Discord's cached member data might be stale
 * @param {ChatInputCommandInteraction} interaction - The Discord interaction
 * @returns {Promise<VoiceChannel|null>} - The voice channel or null if not found
 */
async function getUserVoiceChannel(interaction) {
    try {
        if (!interaction.guild) {
            console.warn('No guild found in interaction');
            return null;
        }

        // Method 1: Try cached member data first (fastest)
        if (interaction.member?.voice?.channel) {
            console.log(`Voice channel found via cached member: ${interaction.member.voice.channel.name} (${interaction.member.voice.channel.id})`);
            return interaction.member.voice.channel;
        }

        // Method 2: Force fresh fetch of member data (most reliable)
        try {
            const member = await interaction.guild.members.fetch({
                user: interaction.user.id,
                force: true // This forces Discord to fetch fresh data instead of using cache
            });

            if (member?.voice?.channel) {
                console.log(`Voice channel found via fresh fetch: ${member.voice.channel.name} (${member.voice.channel.id})`);
                return member.voice.channel;
            }
        } catch (fetchError) {
            console.error('Error fetching member with force:', fetchError);
        }

        // Method 3: Try fetching from voice states directly
        try {
            const voiceState = interaction.guild.voiceStates.cache.get(interaction.user.id);
            if (voiceState?.channel) {
                console.log(`Voice channel found via voice states cache: ${voiceState.channel.name} (${voiceState.channel.id})`);
                return voiceState.channel;
            }
        } catch (voiceStateError) {
            console.error('Error checking voice states cache:', voiceStateError);
        }

        console.log(`User ${interaction.user.tag} is not in any voice channel`);
        return null;
    } catch (error) {
        console.error('Error in getUserVoiceChannel:', error);
        return null;
    }
}

module.exports = {
    getUserVoiceChannel
};
