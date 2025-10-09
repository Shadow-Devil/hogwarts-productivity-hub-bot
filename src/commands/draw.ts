import {
  AttachmentBuilder,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import type { Command } from "../types.ts";
import { createCanvas, loadImage } from "@napi-rs/canvas";

export default {
  data: new SlashCommandBuilder().setName("draw"),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const canvas = createCanvas(700, 250);
    const context = canvas.getContext("2d");
    const background = await loadImage("./canvas.jpg");

    // This uses the canvas dimensions to stretch the image onto the entire canvas
    context.drawImage(background, 0, 0, canvas.width, canvas.height);

    // Use the helpful Attachment class structure to process the file for you
    const attachment = new AttachmentBuilder(await canvas.encode("png"), {
      name: "profile-image.png",
    });

    await interaction.reply({ files: [attachment] });
  },
} as Command;
