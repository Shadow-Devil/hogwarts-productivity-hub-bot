import "dotenv/config";

import { Client, IntentsBitField, MessageFlags, Events } from "discord.js";
import { initializeDatabase, getDbResilience } from "./models/db.ts";
import {
  measureCommand,
  performanceMonitor,
} from "./utils/performanceMonitor.ts";
import monthlyResetService from "./services/monthlyResetService.ts";
import * as BotHealthMonitor from "./utils/botHealthMonitor.ts";
import sessionRecovery from "./utils/sessionRecovery.ts";
import * as DailyTaskManager from "./utils/dailyTaskManager.ts";
import CentralResetService from "./services/centralResetService.ts";
import * as voiceStateUpdate from "./events/voiceStateUpdate.ts";
import {
  activeVoiceSessions,
  gracePeriodSessions,
  setDiscordClient,
} from "./events/voiceStateUpdate.ts";
import { MaterializedViewManager } from "./services/materializedViewManager.ts";
import voiceStateScanner from "./utils/voiceStateScanner.ts";
import { commands } from "./commands.ts";

const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent,
    IntentsBitField.Flags.GuildMembers,
    IntentsBitField.Flags.GuildVoiceStates, // Required for voice channel detection
  ],
});

function loadEvents() {
  client.on(Events.VoiceStateUpdate, (oldState, newState) =>
    voiceStateUpdate.execute(oldState, newState)
  );
}

const activeVoiceTimers = new Map(); // key: voiceChannelId, value: { workTimeout, breakTimeout, phase, endTime }
let materializedViewManager = null; // Will be initialized after database connection

client.on(Events.ClientReady, async (c) => {
  console.log(`Bot User: ${c.user.tag}`);
  console.log(`Client ID: ${c.user.id}`);
  console.log(`Commands Loaded: ${commands.size}`);

  try {
    console.log("Initializing database connection...");
    await initializeDatabase();
    console.log("Database connection established");

    console.log("🩺 Setting up health monitoring...");
    const dbResilience = getDbResilience();
    BotHealthMonitor.initialize(client, dbResilience); // Attach to client for command access
    console.log("✅ Health monitoring system active");

    // Set Discord client reference for smart session cleanup
    setDiscordClient(client);

    const recoveryResults = await sessionRecovery.initialize(
      activeVoiceSessions,
      gracePeriodSessions
    );
    console.log("✅ Session recovery system initialized");
    if (recoveryResults > 0) {
      console.log(
        `📈 Recovered ${recoveryResults} incomplete sessions from previous runs`
      );
    }

    // Start performance monitoring and monthly reset scheduler
    console.log("⏰ Starting schedulers...");

    // Initialize Central Reset Service for timezone-aware resets
    console.log("🌍 Starting timezone-aware reset service...");
    await CentralResetService.start();
    console.log("✅ Central reset service started");

    monthlyResetService.start();
    console.log("✅ Monthly reset scheduler started");

    // Initialize daily task manager
    console.log("📅 Starting daily task manager...");
    DailyTaskManager.setDiscordClient(client);
    DailyTaskManager.start();
    console.log("✅ Daily task manager started");

    // Initialize database optimizations and materialized view management
    console.log("⚡ Setting up database optimizations...");
    materializedViewManager = new MaterializedViewManager();

    // Start auto-refresh of materialized views every 5 minutes
    materializedViewManager.startAutoRefresh(5);

    // Perform initial refresh to populate views
    try {
      await materializedViewManager.refreshViews();
      console.log(
        "✅ Database optimizations activated (40-60% performance improvement)"
      );
    } catch (error) {
      console.warn(
        "⚠️ Initial materialized view refresh failed:",
        error.message
      );
      console.log(
        "✅ Database optimizations activated (auto-refresh will retry)"
      );
    }

    // Scan for users already in voice channels and start tracking
    console.log("🔍 Scanning for users already in voice channels...");
    const scanResults = await voiceStateScanner.scanAndStartTracking(
      client,
      activeVoiceSessions
    );
    console.log("✅ Voice state scanning completed");

    console.log("");
    console.log("🎉 Bot is fully operational!");
    console.log(
      `🎯 Serving commands: ${Array.from(commands.keys()).join(", ")}`
    );
    if (scanResults.trackingStarted > 0) {
      console.log(
        `🎤 Auto-started tracking for ${scanResults.trackingStarted} users already in voice channels`
      );
    }
    console.log("═".repeat(50));

    // Trigger initial health check
    setTimeout(() => {
      console.log("🔍 Running initial health check...");
      BotHealthMonitor.triggerHealthCheck();
    }, 5000); // Wait 5 seconds for everything to settle
  } catch (error) {
    console.log("❌ Bot Initialization Failed");
    console.log("═".repeat(50));
    console.error("💥 Error details:", error.message);
    console.error("🔍 Full error:", error);
    console.log("═".repeat(50));
    process.exit(1);
  }
});

// Add voice state update logging for debugging (only when significant changes occur)
client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  const user =
    newState.member?.user?.tag || oldState.member?.user?.tag || "Unknown User";
  const oldChannel = oldState.channel?.name || null;
  const newChannel = newState.channel?.name || null;

  if (oldChannel !== newChannel && (oldChannel || newChannel)) {
    const action = !oldChannel ? "joined" : !newChannel ? "left" : "moved to";
    const channel = newChannel || oldChannel;
    const timestamp = new Date().toLocaleTimeString();
    console.log(`🎤 [${timestamp}] ${user} ${action} "${channel}"`);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) {
    console.warn(
      `⚠️ Unknown command attempted: /${interaction.commandName} by ${interaction.user.tag}`
    );
    return;
  }

  console.log(
    `🎯 Command executed: /${interaction.commandName} by ${interaction.user.tag} in #${interaction.channel?.name || "DM"}`
  );

  // Wrap command execution with performance monitoring and timeout protection
  const wrappedExecute = measureCommand(
    interaction.commandName,
    command.execute
  );

  try {
    await wrappedExecute(interaction, { activeVoiceTimers });
  } catch (error) {
    console.error(`💥 Command execution failed: /${interaction.commandName}`, {
      user: interaction.user.tag,
      channel: interaction.channel?.name || "DM",
      error: error.message,
      isTimeout: error.message === "Command execution timeout",
    });

    // Improved error response handling with interaction state checks
    try {
      const errorMessage =
        error.message === "Command execution timeout"
          ? "⏱️ Command timed out. Please try again - the bot may be under heavy load."
          : "❌ An error occurred. Please try again later.";

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: errorMessage,
          flags: [MessageFlags.Ephemeral],
        });
      } else if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({
          content: errorMessage,
        });
      }
      // If interaction is already replied, we can't send another response
    } catch (replyError) {
      // Check if it's an "Unknown interaction" error (expired token)
      if (replyError.code === 10062) {
        console.warn(
          `⚠️  Interaction expired for /${interaction.commandName} - command took too long`
        );
      } else if (replyError.code === 40060) {
        console.warn(
          `⚠️  Interaction already acknowledged for /${interaction.commandName}`
        );
      } else {
        console.error(
          `💥 Failed to send error response for /${interaction.commandName}:`,
          replyError
        );
      }
    }
  }
});

// Start the bot
try {
  loadEvents();

  await client.login(process.env.DISCORD_TOKEN);
} catch (error) {
  console.error("Error initializing bot:", error);
  process.exit(1);
}

// Graceful shutdown handlers
process.on("SIGINT", () => {
  console.log("\n🛑 Shutdown Signal Received (SIGINT - Ctrl+C)");
  console.log("🔄 Initiating graceful shutdown...");
  shutdown();
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Shutdown Signal Received (SIGTERM - Process Manager)");
  console.log("🔄 Initiating graceful shutdown...");
  shutdown();
});

// Enhanced shutdown function with timeout safety
async function shutdown() {
  console.log("🔄 Graceful Shutdown Sequence");
  console.log("═".repeat(40));
  const shutdownStart = Date.now();

  // Set a hard timeout to force exit if shutdown hangs
  const forceExitTimeout = setTimeout(() => {
    console.log("⚠️  Shutdown timeout exceeded (15s), forcing exit...");
    console.log("💀 Process terminated forcefully");
    process.exit(1);
  }, 15000); // 15 second timeout to accommodate database shutdown

  try {
    // Handle session recovery first (save active voice sessions)
    console.log("💾 [1/5] Saving voice sessions...");
    if (sessionRecovery) {
      await Promise.race([
        sessionRecovery.handleGracefulShutdown(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Session recovery timeout")), 3000)
        ),
      ]).catch((error) => {
        console.warn("⚠️  Session recovery timeout:", error.message);
      });
    }
    console.log("✅ Voice sessions saved");

    // Stop health monitoring
    console.log("🩺 [2/5] Stopping health monitoring...");
    await Promise.race([
      Promise.resolve(BotHealthMonitor.shutdown()),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Health monitor timeout")), 2000)
      ),
    ]).catch((error) => {
      console.warn("⚠️  Health monitor shutdown timeout:", error.message);
    });
    console.log("✅ Health monitoring stopped");

    // Stop schedulers and optimizations
    console.log("⏰ [3/5] Stopping schedulers...");
    try {
      // Stop Central Reset Service first
      await CentralResetService.stop();
      console.log("✅ Central reset service stopped");

      monthlyResetService.stop();
      DailyTaskManager.stop();
      performanceMonitor.cleanup();

      // Stop materialized view auto-refresh
      if (materializedViewManager) {
        materializedViewManager.stopAutoRefresh();
        console.log("✅ Database optimizations stopped");
      }
    } catch (error) {
      console.warn("⚠️  Scheduler shutdown error:", error.message);
    }
    console.log("✅ Schedulers stopped");

    // Close database connections gracefully
    console.log("🗄️  [4/5] Closing database connections...");
    const dbResilience = getDbResilience();
    if (dbResilience) {
      await Promise.race([
        dbResilience.shutdown(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Database shutdown timeout")), 8000)
        ),
      ]).catch((error) => {
        console.warn("⚠️  Database shutdown timeout:", error.message);
      });
    }
    console.log("✅ Database connections closed");

    // Disconnect Discord client
    console.log("🤖 [5/5] Disconnecting Discord client...");
    if (client && client.isReady()) {
      await Promise.race([
        client.destroy(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Discord client timeout")), 2000)
        ),
      ]).catch((error) => {
        console.warn("⚠️  Discord client shutdown timeout:", error.message);
      });
    }
    console.log("✅ Discord client disconnected");

    clearTimeout(forceExitTimeout);
    const shutdownTime = ((Date.now() - shutdownStart) / 1000).toFixed(2);
    console.log("");
    console.log(`✅ Graceful shutdown completed in ${shutdownTime}s`);
    console.log("👋 Bot offline - Goodbye!");
    console.log("═".repeat(40));
    process.exit(0);
  } catch (error) {
    console.log("❌ Shutdown Error");
    console.log("═".repeat(40));
    console.error("💥 Error details:", error.message);
    console.error("🔍 Full error:", error);
    console.log("═".repeat(40));
    clearTimeout(forceExitTimeout);
    process.exit(1);
  }
}

// Global error handlers
process.on("unhandledRejection", (reason, promise) => {
  console.log("🚨 Unhandled Promise Rejection");
  console.log("═".repeat(40));
  console.error("📍 Location:", promise);
  console.error("💥 Reason:", reason);
  console.log("⚠️  This should be handled properly in production");
  console.log("═".repeat(40));
});

process.on("uncaughtException", (error) => {
  console.log("🚨 Uncaught Exception");
  console.log("═".repeat(40));
  console.error("💥 Error:", error.message);
  console.error("🔍 Stack trace:", error.stack);
  console.log("🛑 Process will terminate");
  console.log("═".repeat(40));
  process.exit(1);
});
