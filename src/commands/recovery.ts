import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ChatInputCommandInteraction,
} from "discord.js";
import * as sessionRecovery from "../utils/sessionRecovery.ts";
import {
  createHeader,
  formatDataTable,
  createStatsCard,
} from "../utils/visualHelpers.ts";
import { safeDeferReply } from "../utils/interactionUtils.ts";

async function status(interaction: ChatInputCommandInteraction) {
  const stats = sessionRecovery.getRecoveryStats();

  const embed = new EmbedBuilder()
    .setTitle(
      createHeader(
        "Session Recovery System",
        stats.isInitialized ? "Operational" : "Inactive",
        "🛡️",
        "large"
      )
    )
    .setColor(stats.isInitialized ? 0x57f287 : 0xed4245)
    .setTimestamp();

  // Recovery system overview with big numbers
  const systemStats = createStatsCard(
    "Recovery Status",
    {
      System: stats.isInitialized ? "✅ Operational" : "❌ Inactive",
      "Active Sessions": `${stats.activeSessions}`,
      "Auto-Save": stats.isPeriodicSavingActive
        ? "✅ Active"
        : "❌ Inactive",
      "Save Interval": `${stats.saveInterval}s`,
    },
    {
      emphasizeFirst: true,
    }
  );

  if (stats.isInitialized && stats.activeSessions > 0) {
    embed.setDescription(
      `✅ **System is operational** - Currently protecting ${stats.activeSessions} active voice session${stats.activeSessions !== 1 ? "s" : ""}\n\n${systemStats}`
    );
  } else if (stats.isInitialized) {
    embed.setDescription(
      `✅ **System is operational** - No active sessions to protect\n\n${systemStats}`
    );
  } else {
    embed.setDescription(
      `❌ **System not initialized** - Session recovery unavailable\n\n${systemStats}`
    );
  }

  // System status in table format
  const statusData = [
    ["System Initialized", stats.isInitialized ? "✅ Yes" : "❌ No"],
    ["Shutting Down", stats.isShuttingDown ? "🛑 Yes" : "✅ No"],
    [
      "Periodic Saving",
      stats.isPeriodicSavingActive ? "✅ Active" : "❌ Inactive",
    ],
    ["Active Sessions", `${stats.activeSessions}`],
    ["Save Interval", `${stats.saveInterval} seconds`],
  ];

  const statusTable = formatDataTable(statusData, [18, 20]);

  embed.addFields([
    {
      name: createHeader("System Status", null, "🔧", "emphasis"),
      value: statusTable,
      inline: false,
    },
  ]);

  // How it works section
  const featuresData = [
    ["Auto-Save", "Sessions saved every 2 minutes"],
    ["Graceful Shutdown", "Proper shutdown handling"],
    ["Crash Recovery", "Recovery on startup"],
    ["Heartbeat Tracking", "Automatic session monitoring"],
  ];

  const featuresTable = formatDataTable(featuresData, [18, 30]);

  embed.addFields([
    {
      name: createHeader("Recovery Features", null, "💡", "emphasis"),
      value: featuresTable,
      inline: false,
    },
  ]);

  embed.setFooter({
    text: "Session data is protected against crashes and server restarts",
  });

  await interaction.editReply({ embeds: [embed] });
}

async function save(interaction: ChatInputCommandInteraction) {
  await sessionRecovery.forceSave();

  const embed = new EmbedBuilder()
    .setTitle("💾 Force Save Completed")
    .setDescription(
      "All active session states have been saved to the database"
    )
    .setColor(0x57f287)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });

}

export default {
  data: new SlashCommandBuilder()
    .setName("recovery")
    .setDescription("View session recovery system status and force operations")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("status")
        .setDescription("View session recovery system status")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("save")
        .setDescription("Force save current session states")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      // Immediately defer to prevent timeout
      const deferred = await safeDeferReply(interaction);
      if (!deferred) {
        console.warn("Failed to defer recovery interaction");
        return;
      }

      const subcommand = interaction.options.getSubcommand();
      switch (subcommand) {
        case "status":
          await status(interaction);
          break;
        case "save":
          await save(interaction);
          break;
        default:
          throw Error("unknown subcommand: " + subcommand)
      }
    } catch (error) {
      console.error("💥 Error in /recovery command:", {
        error: error.message,
        stack: error.stack,
        user: interaction.user.tag,
        subcommand: interaction.options.getSubcommand(),
        timestamp: new Date().toISOString(),
      });

      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ Error")
        .setDescription(
          "An error occurred while accessing the session recovery system"
        )
        .setColor(0xed4245);

      try {
        if (interaction.deferred) {
          await interaction.editReply({ embeds: [errorEmbed] });
        } else if (!interaction.replied) {
          await interaction.reply({
            embeds: [errorEmbed],
            flags: [MessageFlags.Ephemeral],
          });
        }
      } catch (replyError) {
        console.error(
          "🔥 Error sending recovery error reply:",
          replyError.message
        );
      }
    }
  },
};
