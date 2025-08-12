import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  Collection,
  SharedSlashCommand,
} from "discord.js";
import tasks from "./commands/tasks.ts";

import debug from "./commands/admin/debug.ts";
import voicescan from "./commands/admin/voicescan.ts";

import housepoints from "./commands/stats/housepoints.ts";
import leaderboard from "./commands/stats/leaderboard.ts";
import stoptimer from "./commands/timer/stoptimer.ts";
import time from "./commands/timer/time.ts";
import timer from "./commands/timer/timer.ts";
import timezoneCommand from "./commands/timezone.ts";
import stats from "./commands/stats/stats.ts";
import logs from "./commands/admin/logs.ts";

export type Command = {
  data: SharedSlashCommand;
  execute: (
    interaction: ChatInputCommandInteraction,
    options: { activeVoiceTimers: Map<string, { endTime: Date; phase: "work" | "break"; startTime: number; workTimeout?: NodeJS.Timeout; breakTimeout?: NodeJS.Timeout }>; }
  ) => Promise<void>;
  autocomplete?: (
    interaction: AutocompleteInteraction
  ) => Promise<void>;
};

export const commands = new Collection<string, Command>();

commands.set(tasks.data.name, tasks);

commands.set(debug.data.name, debug);
commands.set(voicescan.data.name, voicescan);

commands.set(housepoints.data.name, housepoints);
commands.set(leaderboard.data.name, leaderboard);
commands.set(stats.data.name, stats);
commands.set(logs.data.name, logs);

commands.set(stoptimer.data.name, stoptimer);
commands.set(time.data.name, time);
commands.set(timer.data.name, timer);

commands.set(timezoneCommand.data.name, timezoneCommand);
