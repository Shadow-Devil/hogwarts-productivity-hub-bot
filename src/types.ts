import type { AutocompleteInteraction, ChatInputCommandInteraction, SharedSlashCommand } from "discord.js";

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

export type House = "Gryffindor" | "Hufflepuff" | "Ravenclaw" | "Slytherin";

export type VoiceSession = {
  username: string;
  discordId: string;
  channelId: string | null;
  channelName: string | null;
}
