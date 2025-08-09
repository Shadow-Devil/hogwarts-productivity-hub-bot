import "dotenv/config";

import * as DailyTaskManager from "./utils/dailyTaskManager.ts";
import CentralResetService from "./services/centralResetService.ts";
import { client } from "./client.ts";
import { Events, type Client } from "discord.js";
import * as VoiceStateUpdate from "./events/voiceStateUpdate.ts";
import * as ClientReady from "./events/clientReady.ts";
import * as InteractionCreate from "./events/interactionCreate.ts";

function registerEvents(client: Client) {
  client.on(Events.ClientReady, ClientReady.execute);
  client.on(Events.InteractionCreate, InteractionCreate.execute);
  client.on(Events.VoiceStateUpdate, VoiceStateUpdate.execute);
}

// Start the bot
try {
  registerEvents(client);
  await CentralResetService.start();
  DailyTaskManager.start();

  await client.login(process.env.DISCORD_TOKEN);
} catch (error) {
  console.error("Error initializing bot:", error);
  process.exit(1);
}
