// Enhanced Embed Templates for Consistent Bot Responses
// Provides pre-built templates for common response types

import type {User} from "discord.js";
import {BotColors} from "./constants.ts";
import {
    createHeader,
    createProgressBar,
    createProgressSection,
    createStatsCard,
    createStyledEmbed,
    formatDataGrid,
    formatDataTable,
} from "./visualHelpers.ts";
import dayjs from "dayjs";


// 📋 Enhanced Task Management Template
function createTaskTemplate(
  user: User,
  tasks: any,
  {
    emptyState = false,
    emptyStateMessage = "",
    showProgress = false,
    includeRecentCompleted = false,
    maxRecentCompleted = 5,
    helpText = "",
    useTableFormat = true,
    showDailyLimit = false,
  } = {}
) {
  const embed = createStyledEmbed("primary")
    .setTitle("📋 Personal Task Dashboard")
    .setThumbnail(user.displayAvatarURL());


  if (emptyState || (Array.isArray(tasks) && tasks.length === 0)) {
    embed.setDescription(
      "Ready to get productive?" +
      (emptyStateMessage
        ? `\n\n${emptyStateMessage}`
        : "\n\n### 💡 Getting Started\nUse `/addtask <description>` to create your first task!")
    );
    embed.setColor(BotColors.INFO);

    if (helpText) {
      embed.setFooter({ text: helpText });
    }

    return embed;
  }

  // Handle enhanced task data structure
  const incompleteTasks =
    tasks.incompleteTasks || tasks.filter?.((t: { is_complete: boolean }) => !t.is_complete) || [];
  const completedTasks =
    tasks.completedTasks || tasks.filter?.((t: { is_complete: boolean }) => t.is_complete) || [];
  const stats = tasks.stats || {};

  embed.setDescription(
    createHeader(
      "Task Overview",
      `Progress tracking for **${user.username}**`,
      "📋",
      "emphasis"
    )
  );

  // Add completion progress bar with enhanced layout
  if (showProgress && stats.completionRate !== undefined) {
    const progressSection = createProgressSection(
      "Overall Progress",
      stats.totalCompleted,
      stats.totalTasks,
      {
        emoji: "📊",
        style: "detailed",
        showPercentage: true,
        showNumbers: true,
      }
    );

    const extraInfo = `\n**Completion Rate:** ${stats.completionRate.toFixed(1)}% • **Points Earned:** ${stats.totalTaskPoints}`;

    embed.addFields([
      {
        name: "📊 Progress Tracking",
        value: progressSection + extraInfo,
        inline: false,
      },
    ]);
  }

  // Add daily limit information if requested
  if (showDailyLimit && tasks.dailyStats) {
    const dailyStats = tasks.dailyStats;
    const limitProgress = createProgressSection(
      "Daily Task Limit",
      dailyStats.total_task_actions,
      dailyStats.limit,
      {
        emoji: dailyStats.limitReached ? "🚫" : "📅",
        style: "detailed",
        showPercentage: true,
        showNumbers: true,
      }
    );

    const resetTime = Math.floor(
      dayjs().add(1, "day").startOf("day").valueOf() / 1000
    );
    const limitInfo = `\n**Actions Used:** ${dailyStats.total_task_actions}/${dailyStats.limit} • **Remaining:** ${dailyStats.remaining} • **Resets:** <t:${resetTime}:R>`;

    embed.addFields([
      {
        name: "📅 Daily Task Limit",
        value: limitProgress + limitInfo,
        inline: false,
      },
    ]);
  }

  // Add pending tasks with enhanced formatting
  if (incompleteTasks.length > 0) {
    const taskList = incompleteTasks.slice(0, 10).map((task: { created_at: number, title: string }, index: number) => {
      const taskNumber = index + 1;
      const createdDate = dayjs(task.created_at).format("MMM DD");

      if (useTableFormat) {
        const numberPadded = taskNumber.toString().padStart(2, "0");
        return [`${numberPadded}. ${task.title}`, `📅 ${createdDate}`];
      } else {
        return `\`${taskNumber.toString().padStart(2, "0")}.\` ${task.title}\n     ┕ 📅 ${createdDate}`;
      }
    });

    let fieldValue;
    if (useTableFormat) {
      fieldValue = formatDataTable(taskList, [25, 15]);
    } else {
      const taskListString = taskList.join("\n\n");
      fieldValue =
        taskListString.length > 950
          ? `\`\`\`md\n${taskListString.substring(0, 947)}...\n\`\`\``
          : `\`\`\`md\n${taskListString}\n\`\`\``;
    }

    const fieldName = `📌 Pending Tasks • ${incompleteTasks.length} remaining`;

    embed.addFields([
      {
        name: fieldName,
        value: fieldValue,
        inline: false,
      },
    ]);
  }

  // Add recently completed tasks with enhanced formatting
  if (includeRecentCompleted && completedTasks.length > 0) {
    const recentCompleted = completedTasks
      .sort(
        (a: any, b: any) =>
          new Date(b.completed_at).getTime() -
          new Date(a.completed_at).getTime()
      )
      .slice(0, maxRecentCompleted);

    if (useTableFormat) {
      const completedList = recentCompleted.map((task: { completed_at: number, points_awarded: number, title: string }) => {
        const completedDate = dayjs(task.completed_at).format("MMM DD");
        const points = task.points_awarded || 0;
        return [`✅ ${task.title}`, `${completedDate} (+${points} pts)`];
      });

      embed.addFields([
        {
          name: `✅ Recently Completed (${completedTasks.length} total)`,
          value: formatDataTable(completedList, [20, 15]),
          inline: false,
        },
      ]);
    } else {
      const completedList = recentCompleted
        .map((task: { completed_at: number, points_awarded: number, title: string }) => {
          const completedDate = dayjs(task.completed_at).format("MMM DD");
          const points = task.points_awarded || 0;
          return `✅ ${task.title}\n*Completed: ${completedDate}* (+${points} pts)`;
        })
        .join("\n\n");

      embed.addFields([
        {
          name: `✅ Recently Completed (${completedTasks.length} total)`,
          value:
            completedList.length > 1024
              ? completedList.substring(0, 1021) + "..."
              : completedList,
          inline: false,
        },
      ]);
    }
  }

  // Add task statistics with enhanced table format
  if (stats.totalTasks !== undefined) {
    const statsData = [
      ["Total Tasks", stats.totalTasks],
      ["Completed", stats.totalCompleted],
      ["Pending", stats.totalPending],
      ["Points Earned", stats.totalTaskPoints],
    ];

    const statsDisplay = useTableFormat
      ? formatDataTable(statsData, [15, 10])
      : formatDataGrid(statsData, { useTable: true });

    embed.addFields([
      {
        name: "📊 Task Statistics",
        value: statsDisplay,
        inline: false,
      },
    ]);
  }

  // Add helpful footer
  embed.setFooter({
    text:
      helpText ||
      "Use /task complete <number> to complete tasks • /task cancel <number> to remove tasks",
  });

  return embed;
}



// ⏱️ Enhanced Timer Status Template
// 🏠 Enhanced House Points Template
function createHouseTemplate(
  houses: Array<{ house: "Gryffindor" | "Hufflepuff" | "Ravenclaw" | "Slytherin"; points: number, voiceTime: number }>,
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

// ❌ Error Template
function createErrorTemplate(
  title: string,
  message: string,
  {
    includeHelp = true,
    helpText = "Please try again or contact support if the issue persists.",
    additionalInfo = null,
    showEmoji = true,
  }: {
    includeHelp?: boolean;
    helpText?: string;
    additionalInfo?: string | null;
    showEmoji?: boolean;
  } = {}
) {
  const embed = createStyledEmbed("error")
    .setTitle(`${showEmoji ? "❌ " : ""}${title}`)
    .setDescription(message);

  if (includeHelp) {
    let helpValue = helpText;
    if (additionalInfo) {
      helpValue += `\n\n**Additional Info:** ${additionalInfo}`;
    }

    embed.addFields([
      {
        name: "💡 Need Help?",
        value: helpValue,
        inline: false,
      },
    ]);
  }

  return embed;
}

export {
  createTaskTemplate,
  createTimerTemplate,
  createHouseTemplate,
  createHealthTemplate,
  createSuccessTemplate,
  createErrorTemplate,
};
