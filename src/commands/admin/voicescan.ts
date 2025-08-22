import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ChatInputCommandInteraction,
} from "discord.js";
import * as voiceStateScanner from "../../utils/voiceStateScanner.ts";
import {
  formatDataTable,
  createStatsCard,
} from "../../utils/visualHelpers.ts";

export default {
  data: new SlashCommandBuilder()
    .setName("voicescan")
    .setDescription(
      "Scan voice channels and start tracking for users already in voice"
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    // Check if scan is already running
    if (voiceStateScanner.isScanning) {
      await interaction.editReply({
        embeds: [{
          title: "🔄 Voice Scan Already Running",
          description: "A voice state scan is already in progress. Please wait for it to complete.",
          color: 0xfee75c,
          fields: [{
            name: "💡 Get Started",
            value: "The scan will begin immediately and show results when complete.",
            inline: false,
          }]
        }]
      });
      return;
    }

    // Start the scan notification
    await interaction.editReply({
      embeds: [{
        title: "🔍 Starting Voice State Scan",
        description: "Scanning all voice channels for users to automatically start tracking...",
        color: 0x3498db,
        fields: [{
          name: "⚡ Process",
          value: "This may take a few moments depending on server size.",
          inline: false,
        }]
      }]
    });

    const scanResults = await voiceStateScanner.scanAndStartTracking();

    // Scan statistics
    const scanStats = createStatsCard(
      "Scan Statistics",
      {
        "Users Found": `${scanResults.totalUsersFound}`,
        "Tracking Started": `${scanResults.trackingStarted}`,
        "Channels Scanned": `${scanResults.channels.length}`,
        Errors: `${scanResults.errors}`,
      }
    );

    const resultsEmbed = new EmbedBuilder({
      title: "Voice Scan Results",
      color: scanResults.errors > 0 ? 0xfee75c : 0x57f287,
      footer: {
        text:
          scanResults.errors > 0
            ? `Scan completed with ${scanResults.errors} errors - check logs for details`
            : "Voice state scan completed successfully",
      }
    });
    // Set description based on results
    if (scanResults.trackingStarted > 0) {
      resultsEmbed.setDescription(
        `✅ **Voice scan completed successfully!** Started tracking for ${scanResults.trackingStarted} users.\n\n${scanStats}`
      );
    } else if (scanResults.totalUsersFound > 0) {
      resultsEmbed.setDescription(
        `ℹ️ **Scan completed.** Found ${scanResults.totalUsersFound} users but they were already being tracked.\n\n${scanStats}`
      );
    } else {
      resultsEmbed.setDescription(
        `📭 **No users found in voice channels.** All voice channels are currently empty.\n\n${scanStats}`
      );
    }

    // Add channel details if any were found
    if (scanResults.channels.length > 0) {
      const channelData: [string, string][] = scanResults.channels.map((channel) => [
        channel.name.length > 20
          ? channel.name.substring(0, 17) + "..."
          : channel.name,
        `${channel.userCount} users`,
      ] as const);

      resultsEmbed.addFields([
        {
          name: "Active Voice Channels",
          value: formatDataTable(channelData),
          inline: false,
        },
      ]);
    }

    await interaction.editReply({ embeds: [resultsEmbed] });
  },
};
