import { client } from "./client.ts";
import * as sessionRecovery from "./utils/sessionRecovery.ts";
import * as CentralResetService from "./services/centralResetService.ts";
import * as DailyTaskManager from "./utils/dailyTaskManager.ts";

export function registerShutdownHandlers() {
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
}


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

        // Stop schedulers and optimizations
        console.log("⏰ [3/5] Stopping schedulers...");
        try {
            // Stop Central Reset Service first
            await CentralResetService.stop();
            console.log("✅ Central reset service stopped");

            DailyTaskManager.stop();
        } catch (error) {
            console.warn("⚠️  Scheduler shutdown error:", error);
        }
        console.log("✅ Schedulers stopped");

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
        console.error("🔍 Full error:", error);
        console.log("═".repeat(40));
        clearTimeout(forceExitTimeout);
        process.exit(1);
    }
}
