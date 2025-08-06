/**
 * Centralized Constants for Bot Visual Elements
 * Consolidates commonly used visual elements to reduce import fragmentation
 */

// Bot Color Scheme - Consistent across all embeds
const BotColors = {
    PRIMARY: 0x4B82F3,
    SUCCESS: 0x00C853,
    WARNING: 0xFF8F00,
    ERROR: 0xD84315,
    INFO: 0x2196F3,
    SECONDARY: 0x757575,
    HEALTHY: 0x4CAF50,
    PREMIUM: 0x9C27B0,
    HOUSE_GRYFFINDOR: 0x7C0A02,
    HOUSE_HUFFLEPUFF: 0xFFD700,
    HOUSE_RAVENCLAW: 0x0E1A40,
    HOUSE_SLYTHERIN: 0x1A472A
};

// Status Emojis - Visual feedback for user actions
const StatusEmojis = {
    SUCCESS: '✅',
    ERROR: '❌',
    WARNING: '⚠️',
    INFO: 'ℹ️',
    LOADING: '⏳',
    IN_PROGRESS: '🔄',
    COMPLETE: '✅',
    COMPLETED: '✅',
    CANCELLED: '❌',
    PENDING: '⏳',
    HEALTHY: '�',
    UNHEALTHY: '💔',
    MAINTENANCE: '🔧',
    TIMER_ACTIVE: '⏱️',
    TIMER_PAUSED: '⏸️',
    TIMER_STOPPED: '⏹️',
    HOUSE_GRYFFINDOR: '🦁',
    HOUSE_HUFFLEPUFF: '🦡',
    HOUSE_RAVENCLAW: '🦅',
    HOUSE_SLYTHERIN: '🐍',
    CLOCK: '🕰️',
    READY: '🚀',
    FAILED: '❌',
    PAUSED: '⏸️',
    UNKNOWN: '⚪'
};

// Common Visual Patterns
const VisualPatterns = {
    PROGRESS_BAR: {
        FILLED: '▓',
        EMPTY: '░',
        DEFAULT_LENGTH: 15
    },
    SEPARATORS: {
        DASH: '─',
        DOT: '•',
        ARROW: '→',
        BULLET: '├─'
    },
    EMPHASIS: {
        BOLD: '**',
        ITALIC: '*',
        CODE: '`',
        BLOCK: '```'
    }
};

module.exports = {
    BotColors,
    StatusEmojis,
    VisualPatterns
};
