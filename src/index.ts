import "dotenv/config";
import "./monitoring.ts";

import * as CentralResetService from "./scheduler/centralResetService.ts";
import { client } from "./client.ts";
import { Events, SlashCommandSubcommandBuilder, type Client } from "discord.js";
import * as VoiceStateUpdate from "./events/voiceStateUpdate.ts";
import * as ClientReady from "./events/clientReady.ts";
import * as InteractionCreate from "./events/interactionCreate.ts";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import relativeTime from "dayjs/plugin/relativeTime.js";
import { db, fetchOpenVoiceSessions } from "./db/db.ts";
import { endVoiceSession } from "./utils/voiceUtils.ts";
import { alertOwner } from "./utils/alerting.ts";
import { updateLogMessages } from "./utils/logs.ts";
import { interactionExecutionTimer, resetExecutionTimer, voiceSessionExecutionTimer } from "./monitoring.ts";
import { commands } from "./commands.ts";
import { userTable } from "./db/schema.ts";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);
dayjs.tz.setDefault("UTC");

// Start the bot
try {
  registerEvents(client);
  registerShutdownHandlers();
  await registerMonitoringEvents();

  await CentralResetService.start();
  await client.login(process.env.DISCORD_TOKEN);
} catch (error) {
  console.error("Error initializing bot:", error);
  process.exit(1);
}

function registerEvents(client: Client) {
  client.on(Events.ClientReady, ClientReady.execute);
  client.on(Events.InteractionCreate, InteractionCreate.execute);
  client.on(Events.VoiceStateUpdate, VoiceStateUpdate.execute);
}

function registerShutdownHandlers() {
  async function shutdown() {
    console.log("Closing any existing voice sessions");
    await db.transaction(async (db) => {
      const openVoiceSessions = await fetchOpenVoiceSessions(db);
      await Promise.all(openVoiceSessions.map(session => endVoiceSession(session, db)));
    });
    console.log("Bye");
    await updateLogMessages(true);
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  process.on('uncaughtException', async function (error) {
    await alertOwner(`Uncaught Exception: ${error}`);
  });
  process.on('unhandledRejection', async function (reason, promise) {
    await alertOwner(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
  });
}

async function registerMonitoringEvents() {
  commands.forEach((command) => {
    const subcommands = command.data.options.filter((option) => option instanceof SlashCommandSubcommandBuilder);
    if (subcommands.length > 0) {
      subcommands.forEach((subcommand) => {
        interactionExecutionTimer.zero({command: command.data.name, subcommand: subcommand.name, is_autocomplete: ""});
      });
    } else {
      interactionExecutionTimer.zero({command: command.data.name, subcommand: "", is_autocomplete: ""});
    }
  });

  voiceSessionExecutionTimer.zero({ event: "join" });
  voiceSessionExecutionTimer.zero({ event: "leave" });
  voiceSessionExecutionTimer.zero({ event: "switch" });

  resetExecutionTimer.zero({ action: "daily" });
  resetExecutionTimer.zero({ action: "monthly" });
}