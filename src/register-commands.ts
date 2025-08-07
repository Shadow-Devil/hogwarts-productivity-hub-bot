import "dotenv/config";

import { REST, Routes } from "discord.js";
import { commands } from "./commands.ts";

const commandsJSON = commands.map((command) => command.data.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

try {
  console.log(`Registering ${commandsJSON.length} slash commands`);
  await rest.put(
    Routes.applicationGuildCommands(
      process.env.CLIENT_ID,
      process.env.GUILD_ID
    ),
    { body: commandsJSON }
  );
  console.log("Successfully registered all slash commands");
} catch (error) {
  console.error("Error:", error);
  process.exit(1);
}
