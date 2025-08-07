import { Collection, SharedSlashCommand, type CustomInteraction } from "discord.js";
import addtask from "./commands/addtask.ts";
import completetask from "./commands/completetask.ts";
import debug from "./commands/debug.ts";
import graceperiod from "./commands/graceperiod.ts";
import housepoints from "./commands/housepoints.ts";
import leaderboard from "./commands/leaderboard.ts";
import performance from "./commands/performance.ts";
import recovery from "./commands/recovery.ts";
import removetask from "./commands/removetask.ts";
import stats from "./commands/stats.ts";
import stoptimer from "./commands/stoptimer.ts";
import time from "./commands/time.ts";
import timer from "./commands/timer.ts";
import timezoneCommand from "./commands/timezone.ts";
import viewtasks from "./commands/viewtasks.ts";
import voicescan from "./commands/voicescan.ts";

export type Command = {
    data: SharedSlashCommand;
    execute: (interaction: CustomInteraction, options?: any) => Promise<void>;
};

export const commands = new Collection<string, Command>();

commands.set(addtask.data.name, addtask);
commands.set(completetask.data.name, completetask);
commands.set(debug.data.name, debug);
commands.set(graceperiod.data.name, graceperiod);
commands.set(housepoints.data.name, housepoints);
commands.set(leaderboard.data.name, leaderboard);
commands.set(performance.data.name, performance);
commands.set(recovery.data.name, recovery);
commands.set(removetask.data.name, removetask);
commands.set(stats.data.name, stats);
commands.set(stoptimer.data.name, stoptimer);
commands.set(time.data.name, time);
commands.set(timer.data.name, timer);
commands.set(timezoneCommand.data.name, timezoneCommand);
commands.set(viewtasks.data.name, viewtasks);
commands.set(voicescan.data.name, voicescan);
