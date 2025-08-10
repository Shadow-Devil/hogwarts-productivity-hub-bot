import "dotenv/config";

import * as DailyTaskManager from "./utils/dailyTaskManager.ts";
import * as CentralResetService from "./services/centralResetService.ts";
import { client } from "./client.ts";
import { Events, type Client } from "discord.js";
import * as VoiceStateUpdate from "./events/voiceStateUpdate.ts";
import * as ClientReady from "./events/clientReady.ts";
import * as InteractionCreate from "./events/interactionCreate.ts";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import relativeTime from "dayjs/plugin/relativeTime.js";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);

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
