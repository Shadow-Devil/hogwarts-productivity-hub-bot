// Enhanced Embed Templates for Consistent Bot Responses
// Provides pre-built templates for common response types
import type { House } from "../types.ts";
import { BotColors } from "./constants.ts";
import {
    createHeader,
  createProgressBar,
    createStatsCard,
  createStyledEmbed,
    formatDataTable,
} from "./visualHelpers.ts";



// ⏱️ Enhanced Timer Status Template
// 🏠 Enhanced House Points Template
function createHouseTemplate(
  houses: Array<{ house: House; points: number, voiceTime: number }>,
  type: string,
) {
  const houseEmojis = {
    Gryffindor: "🦁",
    Hufflepuff: "🦡",
    Ravenclaw: "🦅",
    Slytherin: "🐍",
  };

  const title = type === "daily" ? "Daily House Points" :
    type === "monthly" ? "Monthly House Points"
    : "All-Time House Points";


  const embed = createStyledEmbed().setColor(BotColors.PRIMARY).setTitle(title);

  // Add house rankings with enhanced table format
  if (houses && houses.length > 0) {
      const houseData = houses.map((house, index) => {
        const position = index + 1;
        const emoji = houseEmojis[house.house];
        const medal =
          position === 1
            ? "🥇"
            : position === 2
              ? "🥈"
              : position === 3
                ? "🥉"
                : `#${position}`;

        return [`${medal} ${emoji} ${house.house}`, `${house.points} points`];
      });

      embed.addFields([
        {
          name: "House Rankings",
          value: formatDataTable(houseData, [18, 12]),
          inline: false,
        },
      ]);
  }

  return embed;
}

// 🩺 Enhanced Health Report Template
function createHealthTemplate(
  title: string,
  healthData: any,
  {
    includeMetrics = true,
    useEnhancedLayout = true,
    useTableFormat = true,
    showBigNumbers = true,
    includeTimestamp = true,
  } = {}
) {
    const {
    status,
    statusEmoji,
    systemHealth,
    uptime,
    healthChecks,
    lastUpdate,
    recoveryStatus,
    activeSessions,
    autoSave,
    issues = [],
    message,
    troubleshooting = [],
    initializationNote,
    estimatedWait,
  } = healthData;

  // Determine status emoji and health state
  const finalStatusEmoji =
    statusEmoji ||
    (status === "healthy"
      ? "�"
      : status === "degraded"
        ? "⚠️"
        : status === "unavailable"
          ? "⚠️"
          : status === "initializing"
            ? "🔄"
            : "❌");
  const isHealthy =
    systemHealth !== undefined ? systemHealth : status === "healthy";

  const embed = createStyledEmbed()
    .setTitle(`🩺 ${title}`)
    .setColor(
      isHealthy
        ? BotColors.SUCCESS
        : status === "degraded"
          ? BotColors.WARNING
          : status === "unavailable"
            ? BotColors.WARNING
            : status === "initializing"
              ? BotColors.INFO
              : BotColors.ERROR
    );

  if (useEnhancedLayout) {
    embed.setDescription(`${finalStatusEmoji} ${status.toUpperCase()}`);
  } else {
    embed.setDescription(
      `**Status:** ${finalStatusEmoji} ${status.toUpperCase()}`
    );
  }

  // Add custom message for special statuses
  if (message) {
    embed.addFields([
      {
        name: "📝 Status Information",
        value: message,
        inline: false,
      },
    ]);
  }

  // Add initialization details if provided
  if (initializationNote || estimatedWait) {
    const initData = [];
    if (initializationNote) initData.push(["Current Step", initializationNote]);
    if (estimatedWait) initData.push(["Estimated Wait", estimatedWait]);

    embed.addFields([
      {
        name: "🔄 Initialization Progress",
        value: useTableFormat
          ? formatDataTable(initData, [15, 20])
          : initData.map(([k, v]) => `**${k}:** ${v}`).join("\n"),
        inline: false,
      },
    ]);
  }

  // Add troubleshooting section if provided
  if (troubleshooting && troubleshooting.length > 0) {
    const troubleshootingList = troubleshooting
      .map((tip: any) => `• ${tip}`)
      .join("\n");

    embed.addFields([
      {
        name: "🔧 Troubleshooting Tips",
        value: troubleshootingList,
        inline: false,
      },
    ]);
  }

  if (includeTimestamp) {
    embed.setTimestamp();
  }

  // Create stats card with big numbers if enabled and data is available (but not for unavailable/initializing states)
  if (
    showBigNumbers &&
    (uptime !== undefined || activeSessions !== undefined) &&
    status !== "unavailable" &&
    status !== "initializing"
  ) {
    const statsData = [];
    if (uptime !== undefined) {
      const uptimeDisplay =
        typeof uptime === "object" ? uptime.percent : uptime;
      statsData.push(["Uptime Score", `${uptimeDisplay}%`]);
    }
    if (healthChecks) {
      statsData.push(["Health Checks", healthChecks]);
    }
    if (activeSessions !== undefined) {
      statsData.push(["Active Sessions", activeSessions.toString()]);
    }

    if (statsData.length > 0) {
      const statsCard = createStatsCard("System Health Overview", statsData, {
        emphasizeFirst: true,
        emoji: "📊",
      });

      embed.addFields([
        {
          name: createHeader("Health Overview", null, "📊", "emphasis"),
          value: statsCard,
          inline: false,
        },
      ]);
    }
  }

  // Add uptime metrics with enhanced formatting (but not for unavailable/initializing states)
  if (
    includeMetrics &&
    uptime &&
    status !== "unavailable" &&
    status !== "initializing"
  ) {
    if (useTableFormat) {
      const uptimeData = [];

      // Handle both new format and old format
      if (systemHealth !== undefined) {
        // New format from health command
        uptimeData.push([
          "System Status",
          `${finalStatusEmoji} ${isHealthy ? "All Operational" : "Issues Detected"}`,
        ]);
        if (typeof uptime === "number") {
          uptimeData.push(["Uptime Score", `${uptime}%`]);
        }
        if (healthChecks) {
          uptimeData.push(["Health Checks", healthChecks]);
        }
        if (recoveryStatus !== undefined) {
          uptimeData.push([
            "Recovery Status",
            recoveryStatus ? "✅ Active" : "❌ Inactive",
          ]);
        }
        if (activeSessions !== undefined) {
          uptimeData.push(["Active Sessions", activeSessions.toString()]);
        }
        if (autoSave !== undefined) {
          uptimeData.push([
            "Auto-Save",
            autoSave ? "✅ Enabled" : "❌ Disabled",
          ]);
        }
        if (lastUpdate) {
          uptimeData.push(["Last Update", `<t:${lastUpdate}:R>`]);
        }
      } else {
        // Old format fallback
        uptimeData.push([
          "System Availability",
          `${uptime.percent || uptime}%`,
        ]);
        uptimeData.push([
          "Health Checks Passed",
          `${uptime.healthy}/${uptime.total}`,
        ]);
        uptimeData.push(["Last Check", uptime.lastCheck || "Just now"]);
      }

      if (uptimeData.length > 0) {
        const tableText = formatDataTable(uptimeData, [20, 25]);
        embed.addFields([
          {
            name: createHeader("System Metrics", null, "🔧", "emphasis"),
            value: tableText,
            inline: false,
          },
        ]);
      }
    }
  }

  // Show issues if any exist
  if (issues && issues.length > 0) {
    const issuesList = issues
      .slice(0, 3)
      .map((issue: any) =>
        typeof issue === "string"
          ? `• ${issue}`
          : `• **${issue.name}**: ${issue.error}`
      )
      .join("\n");

    embed.addFields([
      {
        name: createHeader("Issues Detected", null, "⚠️", "emphasis"),
        value: issuesList,
        inline: false,
      },
    ]);

    if (issues.length > 3) {
      embed.addFields([
        {
          name: "📝 Additional Info",
          value: `... and ${issues.length - 3} more issues. Use \`/health detailed\` for full report.`,
          inline: false,
        },
      ]);
    }
  }

  // Add footer with helpful info
  embed.setFooter({
    text: isHealthy
      ? "All systems operational • Use /health detailed for comprehensive analysis"
      : "Issues detected • Use /health detailed for troubleshooting information",
  });

  return embed;
}

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
      const rewardData = [];
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


// ⏱️ Timer Template
function createTimerTemplate(
  action: "start" | "work_complete" | "break_complete" | "status" | "no_timer",
  data: any,
  { showProgress = true, includeMotivation = true } = {}
) {

  let embed;

  switch (action) {
    case "start": {

      embed = createStyledEmbed("primary")
        .setTitle("⏱️ Pomodoro Timer Started")
        .setDescription(
          createHeader(
            "Focus Session Active",
            "Time to boost your productivity!",
            "🎯"
          )
        );

      // Add timer configuration
      const configFields = [
        `🕒 **Work Time:** ${data.workTime} minutes`,
        data.breakTime > 0 ? `☕ **Break Time:** ${data.breakTime} minutes` : null,
        `📍 **Location:** <#${data.voiceChannel.id}>`,
      ].filter(Boolean);

      embed.addFields([
        {
          name: "📋 Session Configuration",
          value: configFields.join("\n"),
          inline: false,
        },
      ]);

      if (showProgress) {
        const progressBar = createProgressBar(0, data.workTime, 15, "▓", "░");
        embed.addFields([
          {
            name: "📊 Progress Tracker",
            value: `${progressBar.bar}\n**Phase:** Work Session • **Status:** 🔄 Active`,
            inline: false,
          },
        ]);
      }

      if (includeMotivation) {
        embed.addFields([
          {
            name: "💪 Stay Focused!",
            value:
              "Focus time! Good luck with your session!\nRemember: great achievements require focused effort.",
            inline: false,
          },
        ]);
      }

      embed.setFooter({
        text: "Use /stoptimer if you need to stop early • /time to check remaining time",
      });
      break;
    }

    case "work_complete":
      embed = createStyledEmbed("success")
        .setTitle("🔔 Work Session Complete!")
        .setDescription(
          createHeader(
            "Great Work!",
            "You've successfully completed your focus session",
            "🎉"
          )
        );

      if (data.breakTime > 0) {
        embed.addFields([
          {
            name: "☕ Break Time!",
            value: `Take a well-deserved **${data.breakTime}-minute break**.\n🔔 I'll notify you when it's time to get back to work.`,
            inline: false,
          },
        ]);
      } else {
        embed.addFields([
          {
            name: "🎯 Session Finished!",
            value:
              "Great job staying focused! You've completed your productivity session.",
            inline: false,
          },
        ]);
      }
      break;

    case "break_complete":
      embed = createStyledEmbed("info")
        .setTitle("🕒 Break Time Is Over!")
        .setDescription(
          createHeader(
            "Back to Work!",
            "Time to get back to your productive flow",
            "💪"
          )
        );

      embed.addFields([
        {
          name: "🎯 Ready to Focus",
          value:
            "Break's over! Time to get back to work.\nYou've got this! Stay focused and productive!",
          inline: false,
        },
      ]);
      break;

    case "status": {
      const isBreak = data.phase === "break";
      embed = createStyledEmbed(isBreak ? "warning" : "primary")
        .setTitle(
          `⏰ Timer Status - ${data.phase.charAt(0).toUpperCase() + data.phase.slice(1)} Phase`
        )
        .setDescription(
          createHeader(
            "Active Session",
            `Currently in ${data.phase} phase`,
            isBreak ? "☕" : "🎯"
          )
        );

      if (showProgress && data.timeRemaining !== undefined) {
        const totalTime = isBreak ? data.breakTime : data.workTime;
        const elapsed = totalTime - data.timeRemaining;
        const progressBar = createProgressBar(elapsed, totalTime, 15);

        embed.addFields([
          {
            name: "📊 Progress",
            value: `${progressBar.bar}\n**Time Remaining:** ${data.timeRemaining} minutes • **Status:** 🔄 Active`,
            inline: false,
          },
        ]);
      }

      embed.addFields([
        {
          name: "📍 Session Info",
          value: `**Location:** <#${data.voiceChannel.id}>\n**Phase:** ${data.phase.charAt(0).toUpperCase() + data.phase.slice(1)}`,
          inline: false,
        },
      ]);
      break;
    }

    case "no_timer":
      embed = createStyledEmbed("secondary")
        .setTitle("⏰ Timer Status")
        .setDescription(
          createHeader(
            "No Active Timer",
            `No Pomodoro timer is currently running in <#${data.voiceChannel.id}>`,
            "💤"
          )
        );

      embed.addFields([
        {
          name: "💡 Get Started",
          value:
            "Use `/timer <work_minutes>` to start a new Pomodoro session!\nRecommended: `/timer 25 5` for a classic 25-minute work session with 5-minute break.",
          inline: false,
        },
      ]);

      if (includeMotivation) {
        embed.addFields([
          {
            name: "🎯 Productivity Tips",
            value:
              "• Choose focused work periods (20-50 minutes)\n• Take regular breaks to maintain concentration\n• Stay in your voice channel during sessions",
            inline: false,
          },
        ]);
      }
      break;
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
  createTimerTemplate,
  createHouseTemplate,
  createHealthTemplate,
  createSuccessTemplate,
  createErrorTemplate,
};
