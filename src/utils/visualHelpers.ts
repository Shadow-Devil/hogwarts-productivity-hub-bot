// Visual Helper Utilities for Discord Bot
// Provides consistent visual formatting across all commands

import { EmbedBuilder } from "discord.js";
import { BotColors } from "./constants.ts";
import assert from "node:assert/strict";

// 📊 Progress Bar Generator
function createProgressBar(
  current: number,
  max: number,
  length = 10,
  fillChar = "▓",
  emptyChar = "░",
) {
  const percentage = Math.min(100, Math.max(0, (current / max) * 100));
  const filled = Math.round((percentage / 100) * length);
  const empty = length - filled;

  const bar = fillChar.repeat(filled) + emptyChar.repeat(empty);
  return {
    bar: `${bar} ${percentage.toFixed(1)}%`,
    percentage: percentage.toFixed(1),
  };
}

// 📋 Create Decorated Header with Enhanced Typography
function createHeader(title: string, subtitle: string | null = null, emoji = "🎯", style: "default" | "large" | "emphasis" = "default") {
  const styles = {
    default: {
      titleFormat: `${emoji} **${title}**`,
      separator: "═",
      spacing: "\n",
    },
    large: {
      titleFormat: `# ${emoji} ${title}`,
      separator: "═",
      spacing: "\n\n",
    },
    emphasis: {
      titleFormat: `## ${emoji} **${title}**`,
      separator: "▬",
      spacing: "\n",
    },
  };

  const currentStyle = styles[style];
  let header = currentStyle.titleFormat;

  if (subtitle) {
    const separatorLength = Math.min(40, title.length + 4);
    header += `${currentStyle.spacing}${currentStyle.separator.repeat(separatorLength)}${currentStyle.spacing}${subtitle}`;
  }

  return header;
}

// 📊 Enhanced Data Grid with Table-Like Structure
function formatDataGrid(
  data: Record<string, string | number> | (string | [string, string | number])[],
  {
    columns = 2,
    separator = " • ",
    prefix = "├─",
    spacing = true,
    style = "compact",
    useTable = false,
  } = {},
) {
  const items = Array.isArray(data)
    ? data
    : Object.entries(data).map(([k, v]) => `${k}: ${v}`);

  if (useTable && columns === 2) {
    return formatDataTable(items);
  }

  const result = [];

  for (let i = 0; i < items.length; i += columns) {
    const row = items.slice(i, i + columns);

    if (style === "spacious") {
      result.push(""); // Add spacing between rows
    }

    if (spacing && prefix) {
      result.push(`${prefix} ${row.join(separator)}`);
    } else {
      result.push(row.join(separator));
    }
  }

  return result.join("\n");
}

// 📊 Create Table-Like Structure for Better Space Utilization
function formatDataTable(data: (string | [string, string | number])[]) {
  if (!Array.isArray(data) || data.length === 0) return "";

  // Convert array items to key-value pairs if needed
  const pairs: [string, string | number][] = data.map((item) => {
    if (Array.isArray(item)) {
      return [item[0], item[1]];
    } else if (typeof item === "string" && item.includes(":")) {
      const [key, ...valueParts] = item.split(":");
      assert(key, `Invalid item format: ${item}`);
      return [key.trim(), valueParts.join(":").trim()];
    }
    return [item, ""];
  });

  // Calculate column widths for alignment
  const maxKeyLength = Math.max(...pairs.map(([key]) => key.length));
  const keyWidth = Math.min(maxKeyLength + 2, 20);

  const tableRows = pairs.map(([key, value]) => {
    const paddedKey = key.padEnd(keyWidth, " ");
    return `${paddedKey} **${value}**`;
  });

  return tableRows.join("\n");
}

// 📊 Enhanced Centered Data Table with Better Spacing
function formatCenteredDataTable(
  data: [string, string][] | string[],
  {
    addPadding = true,
    useBoxFormat = false,
    centerAlign = true,
    spacing = "normal", // 'compact', 'normal', 'spacious'
  } = {},
) {
  if (!Array.isArray(data) || data.length === 0) return "";

  // Convert array items to key-value pairs if needed
  const pairs: [string, string][] = data.map((item) => {
    if (Array.isArray(item)) {
      return [item[0], item[1]];
    } else if (typeof item === "string" && item.includes(":")) {
      const [key, ...valueParts] = item.split(":");
      assert(key, `Invalid item format: ${item}`);
      return [key.trim(), valueParts.join(":").trim()];
    }
    return [item, ""];
  });

  // Calculate column widths for alignment
  const maxKeyLength = Math.max(...pairs.map(([key]) => key.length));
  const maxValueLength = Math.max(
    ...pairs.map(([, value]) => value.length),
  );

  const keyWidth = Math.min(maxKeyLength + 2, 16);
  const valueWidth = Math.min(maxValueLength + 2, 12);

  let tableRows: string[];

  if (useBoxFormat) {
    // Create box-style format with borders
    const totalWidth = keyWidth + valueWidth + 3;
    const topBorder = "┌" + "─".repeat(totalWidth) + "┐";
    const bottomBorder = "└" + "─".repeat(totalWidth) + "┘";
    const separator = "├" + "─".repeat(totalWidth) + "┤";

    tableRows = [topBorder];
    pairs.forEach(([key, value], index) => {
      const paddedKey = centerAlign
        ? key.padStart((keyWidth + key.length) / 2).padEnd(keyWidth)
        : key.padEnd(keyWidth);
      const paddedValue = centerAlign
        ? value
          .padStart((valueWidth + value.length) / 2)
            .padEnd(valueWidth)
        : value.padEnd(valueWidth);
      tableRows.push(`│ ${paddedKey} │ **${paddedValue}** │`);
      if (index < pairs.length - 1 && spacing === "spacious") {
        tableRows.push(separator);
      }
    });
    tableRows.push(bottomBorder);
  } else {
    // Standard format with improved spacing and alignment
    tableRows = pairs.map(([key, value]) => {
      const paddedKey = key.padEnd(keyWidth, " ");
      const formattedValue = `**${value}**`;

      if (addPadding) {
        return `\`  ${paddedKey}  \` ${formattedValue}`;
      } else {
        return `\`${paddedKey}\` ${formattedValue}`;
      }
    });
  }

  // Add spacing between rows based on spacing option
  if (spacing === "spacious" && !useBoxFormat) {
    return tableRows.join("\n\n");
  } else if (spacing === "compact") {
    return tableRows.join("\n");
  } else {
    return tableRows.join("\n");
  }
}

// 🎨 Enhanced Embed Builder
function createStyledEmbed(type = "default") {
  const embed = new EmbedBuilder().setTimestamp().setColor(BotColors.PRIMARY);

  // Set default styling based on type
  switch (type) {
    case "success":
      embed.setColor(BotColors.SUCCESS);
      break;
    case "warning":
      embed.setColor(BotColors.WARNING);
      break;
    case "error":
      embed.setColor(BotColors.ERROR);
      break;
    case "info":
      embed.setColor(BotColors.INFO);
      break;
    case "premium":
      embed.setColor(BotColors.PREMIUM);
      break;
  }

  return embed;
}

// 📊 Create Stats Card with Enhanced Typography
function createStatsCard(
  title: string,
  stats: Record<string, string> | [string, string][],
  {
    emoji = "📊",
    style = "card",
    highlightMain = false,
    emphasizeFirst = false,
  } = {}
) {
  let card = "";

  if (style === "card") {
    card += `### ${emoji} ${title}\n`;
    card += "```\n";

    if (Array.isArray(stats)) {
      // Handle array format
      stats.forEach(([key, value]) => {
        const formattedKey = key.padEnd(15, ".");
        card += `${formattedKey} ${value}\n`;
      });
    } else {
      // Handle object format
      Object.entries(stats).forEach(([key, value]) => {
        const formattedKey = key.padEnd(15, ".");
        card += `${formattedKey} ${value}\n`;
      });
    }

    card += "```";
  } else if (style === "modern") {
    card += `## ${emoji} **${title}**\n\n`;

    const entries = Array.isArray(stats) ? stats : Object.entries(stats);
    entries.forEach(([key, value], index) => {
      const isMainStat =
        highlightMain && (key.includes("Total") || key.includes("Points"));
      const isFirst = emphasizeFirst && index === 0;

      if (isMainStat || isFirst) {
        card += `**${key}:** # ${value}\n`;
      } else {
        card += `**${key}:** ${value}\n`;
      }
    });
  } else if (style === "inline") {
    // Compact inline format
    const entries = Array.isArray(stats) ? stats : Object.entries(stats);
    card = entries.map(([key, value]) => `**${key}:** ${value}`).join(" • ");
  } else if (style === "table") {
    // Table format using our enhanced data table
    const entries = Array.isArray(stats) ? stats : Object.entries(stats);
    card = formatCenteredDataTable(entries, {
      addPadding: true,
      spacing: "normal",
    });
  }

  return card;
}

// 📊 Create Progress Section with Visual Enhancement
function createProgressSection(
  title: string,
  current: number,
  max: number,
  {
    emoji = "📊",
    showPercentage = true,
    showNumbers = true,
    barLength = 12,
    style = "default",
  } = {}
) {
  const progress = createProgressBar(current, max, barLength);

  let section = `### ${emoji} **${title}**\n\n`;

  if (style === "detailed") {
    section += `\`\`\`\n${progress.bar}\n\`\`\`\n`;
    if (showNumbers) {
      section += `**Progress:** ${current}/${max}`;
    }
    if (showPercentage) {
      section += ` (${progress.percentage}%)`;
    }
  } else {
    section += progress.bar;
    if (showNumbers) {
      section += `\n**${current}** / **${max}**`;
    }
  }

  return section;
}

export {
  createProgressBar,
  createHeader,
  formatDataGrid,
  formatDataTable,
  createStatsCard,
  createProgressSection,
  createStyledEmbed,
};
