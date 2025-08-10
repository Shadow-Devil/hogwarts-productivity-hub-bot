import "dotenv/config";

import { REST, Routes } from "discord.js";
import { commands } from "./commands.ts";
import assert from "node:assert/strict";
import { db } from "./db/db.ts";

assert(process.env.CLIENT_ID)
assert(process.env.GUILD_ID)
assert(process.env.DISCORD_TOKEN)

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

console.log(`Registering ${commands.size} slash commands`);
await rest.put(
  Routes.applicationGuildCommands(
    process.env.CLIENT_ID,
    process.env.GUILD_ID
  ),
  { body: commands.map((command) => command.data.toJSON()) }
);

await db.$client.end();

console.log("Successfully registered all slash commands");
