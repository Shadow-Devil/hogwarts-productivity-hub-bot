import "dotenv/config";

import * as DailyTaskManager from "./utils/dailyTaskManager.ts";
import CentralResetService from "./services/centralResetService.ts";
import * as voiceStateUpdate from "./events/voiceStateUpdate.ts";
import { client } from "./client.ts";
import { registerEvents } from "./events.ts";

// Start the bot
try {
  registerEvents(client);
  await CentralResetService.start();
  voiceStateUpdate.setClient(client);
  DailyTaskManager.setClient(client);
  DailyTaskManager.start();

  await client.login(process.env.DISCORD_TOKEN);
} catch (error) {
  console.error("Error initializing bot:", error);
  process.exit(1);
}
