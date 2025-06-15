// Visual Helper Utilities for Discord Bot
// Provides consistent visual formatting across all commands

const { EmbedBuilder } = require('discord.js');

// 🎨 Unified Color Palette
const BotColors = {
    PRIMARY: 0x5865F2,      // Discord Blurple
    SUCCESS: 0x57F287,      // Green
    WARNING: 0xFEE75C,      // Yellow
    ERROR: 0xED4245,        // Red
    INFO: 0x3498DB,         // Blue
    SECONDARY: 0x99AAB5,    // Gray
    PREMIUM: 0xFFD700,      // Gold
    HOUSE_GRYFFINDOR: 0x7C0A02,
    HOUSE_HUFFLEPUFF: 0xFFDB00,
    HOUSE_RAVENCLAW: 0x0E1A40,
    HOUSE_SLYTHERIN: 0x1A472A
};

// 🎯 Status Indicators
const StatusEmojis = {
    HEALTHY: '🟢',
    WARNING: '🟡',
    ERROR: '🔴',
    INFO: 'ℹ️',
    UNKNOWN: '⚪',
    COMPLETED: '✅',
    FAILED: '❌',
    IN_PROGRESS: '🔄',
    PAUSED: '⏸️',
    READY: '🚀'
};

// 📊 Progress Bar Generator
function createProgressBar(current, max, length = 10, fillChar = '▓', emptyChar = '░') {
    const percentage = Math.min(100, Math.max(0, (current / max) * 100));
    const filled = Math.round((percentage / 100) * length);
    const empty = length - filled;

    const bar = fillChar.repeat(filled) + emptyChar.repeat(empty);
    return {
        bar: `${bar} ${percentage.toFixed(1)}%`,
        percentage: percentage.toFixed(1)
    };
}

// 🎨 Status Color Helper
function getStatusColor(status) {
    const statusMap = {
        'healthy': BotColors.SUCCESS,
        'success': BotColors.SUCCESS,
        'good': BotColors.SUCCESS,
        'warning': BotColors.WARNING,
        'moderate': BotColors.WARNING,
        'caution': BotColors.WARNING,
        'error': BotColors.ERROR,
        'critical': BotColors.ERROR,
        'high': BotColors.ERROR,
        'info': BotColors.INFO,
        'primary': BotColors.PRIMARY,
        'premium': BotColors.PREMIUM
    };

    return statusMap[status.toLowerCase()] || BotColors.SECONDARY;
}

// 📋 Create Decorated Header with Enhanced Typography
function createHeader(title, subtitle = null, emoji = '🎯', style = 'default') {
    const styles = {
        default: {
            titleFormat: `${emoji} **${title}**`,
            separator: '═',
            spacing: '\n'
        },
        large: {
            titleFormat: `# ${emoji} ${title}`,
            separator: '═',
            spacing: '\n\n'
        },
        emphasis: {
            titleFormat: `## ${emoji} **${title}**`,
            separator: '▬',
            spacing: '\n'
        }
    };

    const currentStyle = styles[style] || styles.default;
    let header = currentStyle.titleFormat;

    if (subtitle) {
        const separatorLength = Math.min(40, title.length + 4);
        header += `${currentStyle.spacing}${currentStyle.separator.repeat(separatorLength)}${currentStyle.spacing}${subtitle}`;
    }

    return header;
}

// 📦 Create Info Box
function createInfoBox(title, content, style = 'default') {
    const styles = {
        default: { top: '┌', bottom: '└', side: '│', corner: '─' },
        success: { top: '┏', bottom: '┗', side: '┃', corner: '━' },
        warning: { top: '╔', bottom: '╚', side: '║', corner: '═' },
        error: { top: '╔', bottom: '╚', side: '║', corner: '═' }
    };

    const s = styles[style] || styles.default;
    const width = Math.max(title.length + 4, 25);
    const padding = Math.max(0, width - title.length - 4);

    return [
        `${s.top}${s.corner.repeat(width)}${s.top === '┌' ? '┐' : s.top === '┏' ? '┓' : '╗'}`,
        `${s.side} ${title}${' '.repeat(padding)} ${s.side}`,
        `${s.bottom}${s.corner.repeat(width)}${s.bottom === '└' ? '┘' : s.bottom === '┗' ? '┛' : '╝'}`,
        '',
        content
    ].join('\n');
}

// 📊 Enhanced Data Grid with Table-Like Structure
function formatDataGrid(data, options = {}) {
    const {
        columns = 2,
        separator = ' • ',
        prefix = '├─',
        spacing = true,
        style = 'compact',
        useTable = false,
        columnWidths = null
    } = options;

    const items = Array.isArray(data) ? data : Object.entries(data).map(([k, v]) => `${k}: ${v}`);

    if (useTable && columns === 2) {
        return formatDataTable(items, columnWidths);
    }

    const result = [];

    for (let i = 0; i < items.length; i += columns) {
        const row = items.slice(i, i + columns);

        if (style === 'spacious') {
            result.push(''); // Add spacing between rows
        }

        if (spacing && prefix) {
            result.push(`${prefix} ${row.join(separator)}`);
        } else {
            result.push(row.join(separator));
        }
    }

    return result.join('\n');
}

// 📊 Create Table-Like Structure for Better Space Utilization
function formatDataTable(data, columnWidths = null) {
    if (!Array.isArray(data) || data.length === 0) return '';

    // Convert array items to key-value pairs if needed
    const pairs = data.map(item => {
        if (Array.isArray(item)) {
            return [item[0], item[1]];
        } else if (typeof item === 'string' && item.includes(':')) {
            const [key, ...valueParts] = item.split(':');
            return [key.trim(), valueParts.join(':').trim()];
        }
        return [item, ''];
    });

    // Calculate column widths for alignment
    const maxKeyLength = Math.max(...pairs.map(([key]) => key.length));
    const keyWidth = columnWidths ? columnWidths[0] : Math.min(maxKeyLength + 2, 20);

    const tableRows = pairs.map(([key, value]) => {
        const paddedKey = key.padEnd(keyWidth, ' ');
        return `\`${paddedKey}\` **${value}**`;
    });

    return tableRows.join('\n');
}

// 📊 Enhanced Centered Data Table with Better Spacing
function formatCenteredDataTable(data, options = {}) {
    const {
        columnWidths = null,
        addPadding = true,
        useBoxFormat = false,
        centerAlign = true,
        spacing = 'normal' // 'compact', 'normal', 'spacious'
    } = options;

    if (!Array.isArray(data) || data.length === 0) return '';

    // Convert array items to key-value pairs if needed
    const pairs = data.map(item => {
        if (Array.isArray(item)) {
            return [item[0], item[1]];
        } else if (typeof item === 'string' && item.includes(':')) {
            const [key, ...valueParts] = item.split(':');
            return [key.trim(), valueParts.join(':').trim()];
        }
        return [item, ''];
    });

    // Calculate column widths for alignment
    const maxKeyLength = Math.max(...pairs.map(([key]) => key.length));
    const maxValueLength = Math.max(...pairs.map(([, value]) => value.toString().length));

    const keyWidth = columnWidths ? columnWidths[0] : Math.min(maxKeyLength + 2, 16);
    const valueWidth = columnWidths ? columnWidths[1] : Math.min(maxValueLength + 2, 12);

    let tableRows;

    if (useBoxFormat) {
        // Create box-style format with borders
        const totalWidth = keyWidth + valueWidth + 3;
        const topBorder = '┌' + '─'.repeat(totalWidth) + '┐';
        const bottomBorder = '└' + '─'.repeat(totalWidth) + '┘';
        const separator = '├' + '─'.repeat(totalWidth) + '┤';

        tableRows = [topBorder];
        pairs.forEach(([key, value], index) => {
            const paddedKey = centerAlign ? key.padStart((keyWidth + key.length) / 2).padEnd(keyWidth) : key.padEnd(keyWidth);
            const paddedValue = centerAlign ? value.toString().padStart((valueWidth + value.toString().length) / 2).padEnd(valueWidth) : value.toString().padEnd(valueWidth);
            tableRows.push(`│ ${paddedKey} │ **${paddedValue}** │`);
            if (index < pairs.length - 1 && spacing === 'spacious') {
                tableRows.push(separator);
            }
        });
        tableRows.push(bottomBorder);
    } else {
        // Standard format with improved spacing and alignment
        tableRows = pairs.map(([key, value]) => {
            const paddedKey = key.padEnd(keyWidth, ' ');
            const formattedValue = `**${value}**`;

            if (addPadding) {
                return `\`  ${paddedKey}  \` ${formattedValue}`;
            } else {
                return `\`${paddedKey}\` ${formattedValue}`;
            }
        });
    }

    // Add spacing between rows based on spacing option
    if (spacing === 'spacious' && !useBoxFormat) {
        return tableRows.join('\n\n');
    } else if (spacing === 'compact') {
        return tableRows.join('\n');
    } else {
        return tableRows.join('\n');
    }
}

// 📋 Create Stats Section with Enhanced Layout and Padding
function createStatsSection(title, data, options = {}) {
    const {
        emoji = '📊',
        useTable = true,
        addSpacing = true,
        centerContent = true,
        style = 'enhanced', // 'basic', 'enhanced', 'premium'
        columnWidths = null
    } = options;

    let content = '';

    if (style === 'premium') {
        const header = `✨ **${title}** ✨\n${'═'.repeat(Math.min(title.length + 8, 25))}\n`;
        content = header;
    } else if (style === 'enhanced') {
        const header = `${emoji} **${title}**\n${'▬'.repeat(Math.min(title.length + 2, 20))}\n`;
        content = header;
    } else {
        content = `${emoji} **${title}**\n`;
    }

    if (useTable) {
        const tableOptions = {
            columnWidths,
            addPadding: true,
            centerAlign: centerContent,
            spacing: addSpacing ? 'normal' : 'compact'
        };
        content += formatCenteredDataTable(data, tableOptions);
    } else {
        // Simple list format
        const items = Array.isArray(data) ? data : Object.entries(data);
        content += items.map(([key, value]) => `• **${key}:** ${value}`).join('\n');
    }

    return content;
}

// 🎯 Create Centered Field Layout for Discord Embeds
function createCenteredLayout(sections, options = {}) {
    const {
        maxColumnsPerRow = 3,
        addSpacers = true,
        spacerValue = '\u200b'
    } = options;

    const fields = [];

    // Process sections into fields with proper inline configuration
    sections.forEach((section, _index) => {
        fields.push({
            name: section.name,
            value: section.value,
            inline: true
        });
    });

    // Add spacer fields to balance the layout if needed
    if (addSpacers) {
        const remainder = fields.length % maxColumnsPerRow;
        if (remainder !== 0) {
            const spacersNeeded = maxColumnsPerRow - remainder;
            for (let i = 0; i < spacersNeeded; i++) {
                fields.push({
                    name: spacerValue,
                    value: spacerValue,
                    inline: true
                });
            }
        }
    }

    return fields;
}

// 🎨 Enhanced Embed Builder
function createStyledEmbed(type = 'default') {
    const embed = new EmbedBuilder()
        .setTimestamp()
        .setColor(BotColors.PRIMARY);

    // Set default styling based on type
    switch (type) {
    case 'success':
        embed.setColor(BotColors.SUCCESS);
        break;
    case 'warning':
        embed.setColor(BotColors.WARNING);
        break;
    case 'error':
        embed.setColor(BotColors.ERROR);
        break;
    case 'info':
        embed.setColor(BotColors.INFO);
        break;
    case 'premium':
        embed.setColor(BotColors.PREMIUM);
        break;
    }

    return embed;
}

// 💫 Loading Animation Text
function getLoadingText(step = 0) {
    const animations = ['⏳', '🔄', '⚡', '✨'];
    const messages = [
        'Processing request...',
        'Gathering data...',
        'Calculating results...',
        'Finalizing response...'
    ];

    const emoji = animations[step % animations.length];
    const message = messages[step % messages.length];

    return `${emoji} ${message}`;
}

// 🎯 User Status Formatter
function formatUserStatus(user, status = {}) {
    const {
        points = 0,
        streak = 0,
        house = null
    } = status;

    const houseEmojis = {
        'Gryffindor': '🦁',
        'Hufflepuff': '🦡',
        'Ravenclaw': '🦅',
        'Slytherin': '🐍'
    };

    let statusText = `👤 **${user.username}**`;
    if (house) {
        statusText += ` • ${houseEmojis[house] || '🏠'} ${house}`;
    }
    statusText += `\n💰 ${points.toLocaleString()} points`;
    if (streak > 0) {
        statusText += ` • 🔥 ${streak} day streak`;
    }

    return statusText;
}

// 📊 Create Stats Card with Enhanced Typography
function createStatsCard(title, stats, options = {}) {
    const {
        emoji = '📊',
        style = 'card',
        highlightMain = false,
        emphasizeFirst = false
    } = options;

    let card = '';

    if (style === 'card') {
        card += `### ${emoji} ${title}\n`;
        card += '```\n';

        if (Array.isArray(stats)) {
            // Handle array format
            stats.forEach(([key, value]) => {
                const formattedKey = key.padEnd(15, '.');
                card += `${formattedKey} ${value}\n`;
            });
        } else {
            // Handle object format
            Object.entries(stats).forEach(([key, value]) => {
                const formattedKey = key.padEnd(15, '.');
                card += `${formattedKey} ${value}\n`;
            });
        }

        card += '```';
    } else if (style === 'modern') {
        card += `## ${emoji} **${title}**\n\n`;

        const entries = Array.isArray(stats) ? stats : Object.entries(stats);
        entries.forEach(([key, value], index) => {
            const isMainStat = highlightMain && (key.includes('Total') || key.includes('Points'));
            const isFirst = emphasizeFirst && index === 0;

            if (isMainStat || isFirst) {
                card += `**${key}:** # ${value}\n`;
            } else {
                card += `**${key}:** ${value}\n`;
            }
        });
    } else if (style === 'inline') {
        // Compact inline format
        const entries = Array.isArray(stats) ? stats : Object.entries(stats);
        card = entries.map(([key, value]) => `**${key}:** ${value}`).join(' • ');
    } else if (style === 'table') {
        // Table format using our enhanced data table
        const entries = Array.isArray(stats) ? stats : Object.entries(stats);
        card = formatCenteredDataTable(entries, {
            addPadding: true,
            spacing: 'normal'
        });
    }

    return card;
}

// 🎖️ Create Achievement Badge with Enhanced Typography
function createAchievementBadge(title, value, emoji = '🏆', style = 'default') {
    const badges = {
        default: `${emoji} **${title}:** ${value}`,
        highlighted: `✨ ${emoji} **${title}:** ▓▓▓ ${value} ▓▓▓`,
        celebration: `🎉 ${emoji} **${title}:** 🌟 ${value} 🌟`,
        minimal: `${emoji} ${value}`,
        large: `# ${emoji} **${title}:** ${value}`,
        card: `\`\`\`\n${emoji} ${title}: ${value}\n\`\`\``
    };

    return badges[style] || badges.default;
}

// 📋 Create Info Section with Enhanced Layout
function createInfoSection(title, items, options = {}) {
    const {
        emoji = '📋',
        style = 'list',
        useTable = false,
        showNumbers = false,
        spacing = 'normal'
    } = options;

    let section = `### ${emoji} **${title}**\n`;

    if (spacing === 'spacious') {
        section += '\n';
    }

    if (useTable && Array.isArray(items)) {
        section += formatDataTable(items);
    } else if (style === 'list') {
        items.forEach((item, index) => {
            const prefix = showNumbers ? `${index + 1}.` : '•';
            section += `${prefix} ${item}\n`;
        });
    } else if (style === 'grid') {
        section += formatDataGrid(items, { useTable: true });
    }

    return section;
}

// 📊 Create Progress Section with Visual Enhancement
function createProgressSection(title, current, max, options = {}) {
    const {
        emoji = '📊',
        showPercentage = true,
        showNumbers = true,
        barLength = 12,
        style = 'default'
    } = options;

    const progress = createProgressBar(current, max, barLength);

    let section = `### ${emoji} **${title}**\n\n`;

    if (style === 'detailed') {
        section += `\`\`\`\n${progress.bar}\n\`\`\`\n`;
        if (showNumbers) {
            section += `**Progress:** ${current}/${max}`;
        }
        if (showPercentage) {
            section += ` (${progress.percentage}%)`;
        }
    } else {
        section += `${progress.bar}`;
        if (showNumbers) {
            section += `\n**${current}** / **${max}**`;
        }
    }

    return section;
}

// 📈 Trend Indicators
function getTrendEmoji(trend) {
    const trends = {
        'up': '📈',
        'increasing': '📈',
        'improving': '📈',
        'rising': '📈',
        'down': '📉',
        'decreasing': '📉',
        'declining': '📉',
        'falling': '📉',
        'stable': '➡️',
        'steady': '➡️',
        'unchanged': '➡️'
    };

    return trends[trend.toLowerCase()] || '➡️';
}

module.exports = {
    BotColors,
    StatusEmojis,
    createProgressBar,
    getStatusColor,
    createHeader,
    createInfoBox,
    formatDataGrid,
    formatDataTable,
    createStatsCard,
    createInfoSection,
    createProgressSection,
    createAchievementBadge,
    getTrendEmoji,
    createStyledEmbed,
    getLoadingText,
    formatUserStatus,
    formatCenteredDataTable,
    createStatsSection,
    createCenteredLayout
};
