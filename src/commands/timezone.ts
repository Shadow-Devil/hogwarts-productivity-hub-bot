import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  MessageFlags,
} from "discord.js";
import { BotColors } from "../utils/constants.ts";
import dayjs from "dayjs";
import { db, fetchUserTimezone } from "../db/db.ts";
import { userTable } from "../db/schema.ts";
import { eq } from "drizzle-orm";

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
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const newTimezone = interaction.options.getString("timezone");
    const discordId = interaction.user.id;

    if (!newTimezone) {
      await viewTimezone(interaction, discordId);
    } else {
      await setTimezone(interaction, discordId, newTimezone);
    }
  },
  async autocomplete(interaction: AutocompleteInteraction) {
    const results = []
    const query = interaction.options.getFocused()?.toLowerCase();
    for (const timeZone of Intl.supportedValuesOf('timeZone')) {
      if (timeZone.toLowerCase().includes(query)) {
        results.push({
          name: `${timeZone} (Currently ${dayjs().tz(timeZone).format("HH:mm")})`,
          value: timeZone,
        });
      }
    }
    await interaction.respond(results.slice(0, 25));
  }
};

async function viewTimezone(interaction: ChatInputCommandInteraction, discordId: string) {
  const userTimezone = await fetchUserTimezone(discordId);
  const userLocalTime = dayjs()
    .tz(userTimezone)
    .format("HH:mm");

  await interaction.editReply({
    embeds: [(new EmbedBuilder()
      .setColor(BotColors.SUCCESS)
      .setDescription(`Your timezone is currently set to \`${userTimezone}\` (Currently ${userLocalTime})`))]
  });
}

async function setTimezone(interaction: ChatInputCommandInteraction, discordId: string, newTimezone: string) {
  // Validate timezone
if (!dayjs().tz(newTimezone).isValid()) {
    await interaction.editReply({
        embeds: [(new EmbedBuilder()
            .setColor(BotColors.ERROR)
            .setTitle(`❌ Invalid Timezone`)
            .setDescription(`The timezone \`${newTimezone}\` is not valid.`)
            .addFields({
                name: "💡 Tips",
                value: [
                    "• Check [IANA timezone list](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)",
                    "• Format: `Continent/City` (e.g., `America/New_York`)",
                ].join("\n"),
            }))]
    });
    return;
}


  // Get current timezone for comparison
  const oldTimezone = await fetchUserTimezone(discordId);
  if (oldTimezone === newTimezone) {
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(BotColors.WARNING)
        .setTitle(`ℹ️ No Change Needed`)
        .setDescription(`Your timezone is already set to \`${newTimezone}\`.`)
      ]
    });
    return;
  }

  // Update timezone in database
  const result = await db.update(userTable).set({
    timezone: newTimezone,
  }).where(eq(userTable.discordId, discordId));

  if (result.rowCount === 0) {
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(BotColors.ERROR)
        .setTitle(`❌ Timezone Update Failed`)
        .setDescription(`Failed to update your timezone. Please try again later.`)]
    });
    return;
  }

  const userLocalTime = dayjs()
    .tz(newTimezone)
    .format("dddd, MMMM D, YYYY [at] h:mm A");


  await interaction.editReply({
    embeds: [(createTimezoneChangeEmbed(
      oldTimezone,
      newTimezone,
      userLocalTime,
    ))]
  });
}

function createTimezoneChangeEmbed(
  oldTimezone: string,
  newTimezone: string,
  userLocalTime: string,
) {
  const embed = new EmbedBuilder()
    .setColor(BotColors.SUCCESS)
    .setTitle(`✅ Timezone Updated Successfully`)
    .addFields(
      {
        name: "🔄 Change Summary",
        value: `**From:** \`${oldTimezone}\`\n**To:** \`${newTimezone}\``,
        inline: false,
      },
      {
        name: "🕐 Your New Local Time",
        value: userLocalTime,
        inline: true,
      }
    );

  embed.addFields({
    name: "✅ What This Affects",
    value: [
      "• Daily reset times (streaks, voice limits)",
      "• Task deadline calculations",
    ].join("\n"),
    inline: false,
  }).setFooter({
    text: "Your stats and streaks have been preserved during this timezone change",
  });

  return embed;
}


