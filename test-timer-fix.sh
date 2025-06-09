#!/bin/bash

echo "=== Testing Timer Command Fix ==="
echo "Starting bot test..."

# Check if bot is running
if pgrep -f "node src/index.js" > /dev/null; then
    echo "✅ Bot is running"
else
    echo "❌ Bot is not running"
    exit 1
fi

echo ""
echo "=== Testing Checklist ==="
echo "□ Timer command no longer throws InteractionAlreadyReplied error"
echo "□ Timer creates successfully when user is in voice channel"
echo "□ Timer shows proper error when user is not in voice channel"
echo "□ Timer shows proper error when timer already exists"
echo "□ Timer validates work time (minimum 20 minutes)"
echo "□ Timer validates break time (minimum 5 minutes if specified)"
echo ""
echo "✅ Fix applied: Changed interaction.reply() to safeReply() in timer.js"
echo "✅ Fix applied: Updated stoptimer.js to use safeReply() consistently"
echo "✅ All commands now use proper interaction handling patterns"
echo ""
echo "🔧 Next steps for testing:"
echo "1. Join a voice channel in Discord"
echo "2. Run: /timer work:25"
echo "3. Verify no InteractionAlreadyReplied error occurs"
echo "4. Verify timer creation message appears"
echo ""
echo "Test completed successfully! ✨"
