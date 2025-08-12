import "dotenv/config";

import { REST, Routes } from "discord.js";
import { commands } from "./commands.ts";
import assert from "node:assert/strict";
import { db } from "./db/db.ts";

// We don't need the db connection so just close it directly
await db.$client.end();

assert(process.env.CLIENT_ID)
assert(process.env.GUILD_ID)
assert(process.env.DISCORD_TOKEN)

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

for (const guildId of process.env.GUILD_ID.split(",")) {

  console.log(`Registering ${commands.size} slash commands for guild: ${guildId}`);
  await rest.put(
    Routes.applicationGuildCommands(
      process.env.CLIENT_ID,
      guildId
    ),
    { body: commands.map((command) => command.data.toJSON()) }
  );
  console.log("Successfully registered all slash commands to guild:", guildId);
}
