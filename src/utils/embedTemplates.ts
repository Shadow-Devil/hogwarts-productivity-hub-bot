// Enhanced Embed Templates for Consistent Bot Responses
// Provides pre-built templates for common response types
import {
  createStyledEmbed,
  formatDataTable,
} from "./visualHelpers.ts";


// 🎯 Enhanced Achievement/Success Template
function createSuccessTemplate(
  title: string,
  message: string,
  {
    celebration = false,
    points = null,
    streak = null,
    includeEmoji = true,
    useEnhancedLayout = true,
    useTableFormat = true,
    showBigNumbers = false,
  }: {
    celebration?: boolean;
    points?: number | null;
    streak?: number | null;
    includeEmoji?: boolean;
    useEnhancedLayout?: boolean;
    useTableFormat?: boolean;
    showBigNumbers?: boolean;
  } = {}
) {
  const emoji = celebration ? "🎉" : "✅";
  const embed = createStyledEmbed("success");

  if (useEnhancedLayout) {
    embed
      .setTitle(`${includeEmoji ? emoji + " " : ""}${title}`)
      .setDescription(message);
  } else {
    embed
      .setTitle(`${includeEmoji ? emoji + " " : ""}${title}`)
      .setDescription(message);
  }

  if (points !== null || streak !== null) {
    const rewards = [];

    if (useTableFormat) {
      const rewardData: [string, string][] = [];
      if (points !== null) rewardData.push(["Points Earned", `+${points}`]);
      if (streak !== null)
        rewardData.push(["Current Streak", `${streak} days`]);

      embed.addFields([
        {
          name: celebration ? "🎁 Rewards Earned" : "📊 Progress Update",
          value: formatDataTable(rewardData, [15, 10]),
          inline: false,
        },
      ]);
    } else {
      if (points !== null) {
        if (showBigNumbers) {
          rewards.push(`# +${points}\n### 💰 Points`);
        } else {
          rewards.push(`💰 **+${points} points**`);
        }
      }
      if (streak !== null) {
        if (showBigNumbers) {
          rewards.push(`# ${streak}\n### 🔥 Day Streak`);
        } else {
          rewards.push(`🔥 **${streak} day streak**`);
        }
      }

      embed.addFields([
        {
          name: celebration ? "🎁 Rewards Earned" : "📊 Progress Update",
          value: rewards.join("\n"),
          inline: false,
        },
      ]);
    }
  }

  return embed;
}


function createErrorTemplate(
  title: string,
  ...messages: string[]
) {
  return createStyledEmbed("error")
    .setTitle(`❌ ${title}`)
    .setDescription(messages.join("\n"));
}

export {
  createSuccessTemplate,
  createErrorTemplate,
};
