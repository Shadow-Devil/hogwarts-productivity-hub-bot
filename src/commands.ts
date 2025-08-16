import {
  Collection,
} from "discord.js";
import tasks from "./commands/tasks.ts";

import debug from "./commands/admin/debug.ts";
import voicescan from "./commands/admin/voicescan.ts";

import housepoints from "./commands/stats/housepoints.ts";
import leaderboard from "./commands/stats/leaderboard.ts";
import timer from "./commands/timer.ts";
import timezoneCommand from "./commands/timezone.ts";
import stats from "./commands/stats/stats.ts";
import logs from "./commands/admin/logs.ts";
import type { Command } from "./types.ts";

export const commands = new Collection<string, Command>();

commands.set(timezoneCommand.data.name, timezoneCommand);
commands.set(tasks.data.name, tasks);
commands.set(timer.data.name, timer);

// Admin commands
commands.set(debug.data.name, debug);
commands.set(voicescan.data.name, voicescan);
commands.set(logs.data.name, logs);

// Stats commands
commands.set(housepoints.data.name, housepoints);
commands.set(leaderboard.data.name, leaderboard);
commands.set(stats.data.name, stats);
