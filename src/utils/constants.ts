/**
 * Centralized Constants for Bot Visual Elements
 * Consolidates commonly used visual elements to reduce import fragmentation
 */

// Bot Color Scheme - Consistent across all embeds
const BotColors = {
  PRIMARY: 0x4b82f3,
  SUCCESS: 0x00c853,
  WARNING: 0xff8f00,
  ERROR: 0xd84315,
  INFO: 0x2196f3,
  SECONDARY: 0x757575,
  HEALTHY: 0x4caf50,
  PREMIUM: 0x9c27b0,
  HOUSE_GRYFFINDOR: 0x7c0a02,
  HOUSE_HUFFLEPUFF: 0xffd700,
  HOUSE_RAVENCLAW: 0x0e1a40,
  HOUSE_SLYTHERIN: 0x1a472a,
};

// Status Emojis - Visual feedback for user actions
const StatusEmojis = {
  SUCCESS: "✅",
  ERROR: "❌",
  WARNING: "⚠️",
  INFO: "ℹ️",
  LOADING: "⏳",
  IN_PROGRESS: "🔄",
  COMPLETE: "✅",
  COMPLETED: "✅",
  CANCELLED: "❌",
  PENDING: "⏳",
  HEALTHY: "�",
  UNHEALTHY: "💔",
  MAINTENANCE: "🔧",
  TIMER_ACTIVE: "⏱️",
  TIMER_PAUSED: "⏸️",
  TIMER_STOPPED: "⏹️",
  HOUSE_GRYFFINDOR: "🦁",
  HOUSE_HUFFLEPUFF: "🦡",
  HOUSE_RAVENCLAW: "🦅",
  HOUSE_SLYTHERIN: "🐍",
  CLOCK: "🕰️",
  READY: "🚀",
  FAILED: "❌",
  PAUSED: "⏸️",
  UNKNOWN: "⚪",
};

// Common Visual Patterns
const VisualPatterns = {
  PROGRESS_BAR: {
    FILLED: "▓",
    EMPTY: "░",
    DEFAULT_LENGTH: 15,
  },
  SEPARATORS: {
    DASH: "─",
    DOT: "•",
    ARROW: "→",
    BULLET: "├─",
  },
  EMPHASIS: {
    BOLD: "**",
    ITALIC: "*",
    CODE: "`",
    BLOCK: "```",
  },
};

export { BotColors, StatusEmojis, VisualPatterns };
