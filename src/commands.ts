import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  Collection,
  SharedSlashCommand,
} from "discord.js";
import tasks from "./commands/tasks.ts";

import debug from "./commands/admin/debug.ts";
import graceperiod from "./commands/admin/graceperiod.ts";
import recovery from "./commands/admin/recovery.ts";
import voicescan from "./commands/admin/voicescan.ts";

import housepoints from "./commands/housepoints.ts";
import leaderboard from "./commands/leaderboard.ts";
import stats from "./commands/stats.ts";
import stoptimer from "./commands/stoptimer.ts";
import time from "./commands/time.ts";
import timer from "./commands/timer.ts";
import timezoneCommand from "./commands/timezone.ts";

export type Command = {
  data: SharedSlashCommand;
  execute: (
    interaction: ChatInputCommandInteraction,
    options?: any
  ) => Promise<void>;
  autocomplete?: (
    interaction: AutocompleteInteraction
  ) => Promise<void>;
};

export const commands = new Collection<string, Command>();

commands.set(tasks.data.name, tasks);

commands.set(debug.data.name, debug);
commands.set(graceperiod.data.name, graceperiod);
commands.set(recovery.data.name, recovery);
commands.set(voicescan.data.name, voicescan);

commands.set(housepoints.data.name, housepoints);
commands.set(leaderboard.data.name, leaderboard);
commands.set(stats.data.name, stats);
commands.set(stoptimer.data.name, stoptimer);
commands.set(time.data.name, time);
commands.set(timer.data.name, timer);
commands.set(timezoneCommand.data.name, timezoneCommand);
