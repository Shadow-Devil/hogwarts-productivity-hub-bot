import "dotenv/config";

import * as CentralResetService from "./scheduler/centralResetService.ts";
import { client } from "./client.ts";
import { Events, type Client } from "discord.js";
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

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);
dayjs.tz.setDefault("UTC");

// Start the bot
try {
  registerEvents(client);
  registerShutdownHandlers();

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
  async function dbShutdown() {
    console.log("Closing any existing voice sessions...");
    await db.transaction(async (db) => {
      const openVoiceSessions = await fetchOpenVoiceSessions(db);
      await Promise.all(openVoiceSessions.map(session => endVoiceSession(session.discordId, session.username!)));
    });
    process.exit(0);

  }

  process.on("SIGINT", dbShutdown);
  process.on("SIGTERM", dbShutdown);

  process.on('uncaughtException', async function (error) {
    await alertOwner(`Uncaught Exception: ${error}`);
  });
  process.on('unhandledRejection', async function (reason, promise) {
    await alertOwner(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
  });
}