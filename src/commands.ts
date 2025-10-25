import { Collection } from "discord.js";
import timezoneCommand from "./commands/timezone.ts";
import stats from "./commands/stats/stats.ts";
import type { Command } from "./types.ts";
import draw from "./commands/draw.ts";
import submit from "./commands/submit.ts";
import admin from "./commands/admin.ts";
import housepoints from "./commands/stats/housepoints.ts";

export const commands = new Collection<string, Command>();

commands.set(timezoneCommand.data.name, timezoneCommand);
//commands.set(tasks.data.name, tasks);
//commands.set(timer.data.name, timer);

// Admin commands
//commands.set(debug.data.name, debug);
//commands.set(voicescan.data.name, voicescan);

// Stats commands
commands.set(housepoints.data.name, housepoints);
//commands.set(leaderboard.data.name, leaderboard);
commands.set(admin.data.name, admin);
commands.set(stats.data.name, stats);

commands.set(draw.data.name, draw);
commands.set(submit.data.name, submit);
