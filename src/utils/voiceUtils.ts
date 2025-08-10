import type {
  ChatInputCommandInteraction,
  GuildMember,
  VoiceBasedChannel,
} from "discord.js";

/**
 * get the voice channel for a user from an interaction
 * This function handles the case where Discord's cached member data might be stale
 * @param {ChatInputCommandInteraction} interaction - The Discord interaction
 * @param options - Options for voice channel detection
 */
export async function getUserVoiceChannel(
  interaction: ChatInputCommandInteraction
): Promise<VoiceBasedChannel | null> {
  if (!interaction.guild) {
    console.warn("No guild found in interaction");
    return null;
  }
  const member = interaction.member as GuildMember;

  // Method 1: Try cached member data first (fastest)
  if (member.voice?.channel) {
    console.log(
      `Voice channel found via cached member: ${member.voice.channel.name} (${member.voice.channel.id})`
    );
    return member.voice.channel;
  }

  // Method 2: Try fetching from voice states directly (fast, no API call)
  const voiceState = await interaction.guild.voiceStates.fetch(
    interaction.user.id
  );
  if (voiceState?.channel) {
    console.log(
      `Voice channel found via voice states cache: ${voiceState.channel.name} (${voiceState.channel.id})`
    );
    return voiceState.channel;
  }

  console.log(`User ${interaction.user.tag} is not in any voice channel`);
  return null;

}
