import { Events, type Client } from "discord.js";
import * as voiceStateUpdate from "./events/voiceStateUpdate.ts";
import * as ClientReady from "./events/clientReady.ts";
import * as InteractionCreate from "./events/interactionCreate.ts";

export function registerEvents(client: Client) {
    client.on(Events.ClientReady, ClientReady.execute);
    client.on(Events.InteractionCreate, InteractionCreate.execute);
    client.on(Events.VoiceStateUpdate, voiceStateUpdate.execute);
}
