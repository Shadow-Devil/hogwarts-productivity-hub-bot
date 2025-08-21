import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
} from "discord.js";
import { BotColors } from "../utils/constants.ts";
import dayjs from "dayjs";
import { db, fetchUserTimezone } from "../db/db.ts";
import { userTable } from "../db/schema.ts";
import { eq } from "drizzle-orm";
import { replyError } from "../utils/utils.ts";

export default {
  data: new SlashCommandBuilder()
    .setName("timezone")
    .setDescription(
      "Manage your timezone settings for accurate daily/monthly resets"
    )
    .addStringOption(option =>
      option
        .setName("timezone")
        .setDescription(
          "Your timezone (e.g., America/New_York, Europe/London)"
        ).setAutocomplete(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const newTimezone = interaction.options.getString("timezone");
    const discordId = interaction.user.id;

    if (!newTimezone) {
      await viewTimezone(interaction, discordId);
    } else {
      await setTimezone(interaction, discordId, newTimezone);
    }
  },
  async autocomplete(interaction: AutocompleteInteraction) {
    const timezones = []
    const query = interaction.options.getFocused().toLowerCase();
    for (const timeZone of Intl.supportedValuesOf('timeZone')) {
      if (timeZone.toLowerCase().includes(query)) {
        timezones.push({
          name: `${timeZone} (Currently ${dayjs().tz(timeZone).format("HH:mm")})`,
          value: timeZone,
        });
      }
    }
    await interaction.respond(timezones.slice(0, 25));
  }
};

async function viewTimezone(interaction: ChatInputCommandInteraction, discordId: string) {
  const userTimezone = await fetchUserTimezone(discordId);
  const userLocalTime = dayjs()
    .tz(userTimezone)
    .format("HH:mm");

  await interaction.editReply({
    embeds: [new EmbedBuilder({
      color: BotColors.SUCCESS,
      description: `Your timezone is currently set to \`${userTimezone}\` (Currently ${userLocalTime})`
    })]
  });
}

async function setTimezone(interaction: ChatInputCommandInteraction, discordId: string, newTimezone: string) {
  // Validate timezone
  if (!dayjs().tz(newTimezone).isValid()) {
    return await replyError(
      interaction,
      'Invalid Timezone',
      `The timezone \`${newTimezone}\` is not valid.`,
      "Check [IANA timezone list](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)");
  }


  // Get current timezone for comparison
  const oldTimezone = await fetchUserTimezone(discordId);
  if (oldTimezone === newTimezone) {
    await interaction.editReply({
      embeds: [new EmbedBuilder({
        color: BotColors.WARNING,
        title: `ℹ️ No Change Needed`,
        description: `Your timezone is already set to \`${newTimezone}\`.`,
      })]
    });
    return;
  }

  // Update timezone in database
  const result = await db.update(userTable).set({
    timezone: newTimezone,
  }).where(eq(userTable.discordId, discordId));

  if (result.rowCount === 0) {
    return await replyError(interaction, `Timezone Update Failed`, `Failed to update your timezone. Please try again later.`);
  }

  const userLocalTime = dayjs()
    .tz(newTimezone)
    .format("dddd, MMMM D, YYYY [at] h:mm A");


  await interaction.editReply({
    embeds: [new EmbedBuilder({
      color: BotColors.SUCCESS,
      title: `Timezone Updated Successfully`,
      fields: [
        {
          name: "Change Summary",
          value: `From: \`${oldTimezone}\`\nTo: \`${newTimezone}\``,
          inline: false,
        },
        {
          name: "🕐 Your New Local Time",
          value: userLocalTime,
          inline: true,
        }
      ]
    })]
  });
}
