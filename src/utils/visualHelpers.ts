// 📊 Create Table-Like Structure for Better Space Utilization
export function formatDataTable(pairs: [string, string | number][]) {
  if (pairs.length === 0) return "";

  // Calculate column widths for alignment
  const maxKeyLength = Math.max(...pairs.map(([key]) => key.length));
  const keyWidth = Math.min(maxKeyLength + 2, 20);

  const tableRows = pairs.map(([key, value]) => {
    const paddedKey = key.padEnd(keyWidth, " ");
    return `${paddedKey} **${value}**`;
  });

  return tableRows.join("\n");
}

// 📊 Create Stats Card with Enhanced Typography
export function createStatsCard(title: string, stats: Record<string, string>) {
  let card = `### 📊 ${title}\n` + "```\n";

  for (const [key, value] of Object.entries(stats)) {
    const formattedKey = key.padEnd(15, ".");
    card += `${formattedKey} ${value}\n`;
  }

  card += "```";
  return card;
}

// 📊 Progress Bar Generator
export function createProgressBar(current: number, max: number, length: number, fillChar = "▓", emptyChar = "░") {
  const percentage = Math.min(100, Math.max(0, (current / max) * 100));
  const filled = Math.round((percentage / 100) * length);
  const empty = length - filled;

  const bar = fillChar.repeat(filled) + emptyChar.repeat(empty);
  return {
    bar: `${bar} ${percentage.toFixed(1)}%`,
    percentage: percentage.toFixed(1),
  };
}

// 📊 Create Progress Section with Visual Enhancement
export function createProgressSection(current: number, max: number) {
  const progress = createProgressBar(current, max, 10);

  return `\`\`\`\n${progress.bar}\n\`\`\`\n**Progress:** ${current}/${max} (${progress.percentage}%)`;
}
