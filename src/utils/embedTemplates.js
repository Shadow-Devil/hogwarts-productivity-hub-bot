// Enhanced Embed Templates for Consistent Bot Responses
// Provides pre-built templates for common response types

const { EmbedBuilder } = require('discord.js');
const {
    BotColors,
    StatusEmojis,
    createHeader,
    createProgressBar,
    formatDataGrid,
    formatDataTable,
    formatCenteredDataTable,
    createStatsSection,
    createCenteredLayout,
    createStatsCard,
    createInfoSection,
    createProgressSection,
    createStyledEmbed
} = require('./visualHelpers');

// 📊 Enhanced Statistics Dashboard Template
function createStatsTemplate(user, stats, options = {}) {
    const {
        showThumbnail = true,
        includeFooter = true,
        style = 'comprehensive',
        useEnhancedLayout = true
    } = options;

    const embed = createStyledEmbed('info');

    if (useEnhancedLayout) {
        embed.setTitle('📊 Personal Productivity Dashboard')
            .setDescription(createHeader('Statistics Overview', `Performance metrics for **${user.username}**`, '📈', 'emphasis'));
    } else {
        embed.setTitle('📊 Personal Productivity Dashboard')
            .setDescription(createHeader('Statistics Overview', `Data for **${user.username}**`, '📈'));
    }

    if (showThumbnail) {
        embed.setThumbnail(user.displayAvatarURL());
    }

    if (includeFooter) {
        embed.setFooter({
            text: 'Stay consistent to build your streak • Complete tasks for bonus points!'
        });
    }

    return embed;
}

// 📋 Enhanced Task Management Template
function createTaskTemplate(user, tasks, options = {}) {
    const {
        emptyState = false,
        emptyStateMessage = '',
        showProgress = false,
        includeRecentCompleted = false,
        maxRecentCompleted = 5,
        helpText = '',
        style = 'dashboard',
        useEnhancedLayout = true,
        useTableFormat = true,
        showDailyLimit = false
    } = options;

    const embed = createStyledEmbed('primary');

    if (useEnhancedLayout) {
        embed.setTitle('📋 Personal Task Dashboard')
            .setThumbnail(user.displayAvatarURL());
    } else {
        embed.setTitle('📋 Personal Task Dashboard')
            .setThumbnail(user.displayAvatarURL());
    }

    if (emptyState || (Array.isArray(tasks) && tasks.length === 0)) {
        embed.setDescription(
            'Ready to get productive?' +
            (emptyStateMessage ? `\n\n${emptyStateMessage}` : '\n\n### 💡 Getting Started\nUse `/addtask <description>` to create your first task!')
        );
        embed.setColor(BotColors.INFO);

        if (helpText) {
            embed.setFooter({ text: helpText });
        }

        return embed;
    }

    // Handle enhanced task data structure
    const incompleteTasks = tasks.incompleteTasks || tasks.filter?.(t => !t.is_complete) || [];
    const completedTasks = tasks.completedTasks || tasks.filter?.(t => t.is_complete) || [];
    const stats = tasks.stats || {};

    const statusText = `**${incompleteTasks.length}** pending • **${completedTasks.length}** completed`;
    embed.setDescription(createHeader('Task Overview', `Progress tracking for **${user.username}**`, '📋', 'emphasis'));

    // Add completion progress bar with enhanced layout
    if (showProgress && stats.completionRate !== undefined) {
        const progressSection = createProgressSection(
            'Overall Progress',
            stats.totalCompleted,
            stats.totalTasks,
            {
                emoji: '📊',
                style: 'detailed',
                showPercentage: true,
                showNumbers: true
            }
        );

        const extraInfo = `\n**Completion Rate:** ${stats.completionRate.toFixed(1)}% • **Points Earned:** ${stats.totalTaskPoints}`;

        embed.addFields([{
            name: '📊 Progress Tracking',
            value: progressSection + extraInfo,
            inline: false
        }]);
    }

    // Add daily limit information if requested
    if (showDailyLimit && tasks.dailyStats) {
        const dailyStats = tasks.dailyStats;
        const limitProgress = createProgressSection(
            'Daily Task Limit',
            dailyStats.total_task_actions,
            dailyStats.limit,
            {
                emoji: dailyStats.limitReached ? '🚫' : '📅',
                style: 'detailed',
                showPercentage: true,
                showNumbers: true,
                warningThreshold: 80, // Show warning at 8/10
                dangerThreshold: 95   // Show danger at 10/10
            }
        );

        const dayjs = require('dayjs');
        const resetTime = Math.floor(dayjs().add(1, 'day').startOf('day').valueOf() / 1000);
        const limitInfo = `\n**Actions Used:** ${dailyStats.total_task_actions}/${dailyStats.limit} • **Remaining:** ${dailyStats.remaining} • **Resets:** <t:${resetTime}:R>`;

        embed.addFields([{
            name: '📅 Daily Task Limit',
            value: limitProgress + limitInfo,
            inline: false
        }]);
    }

    // Add pending tasks with enhanced formatting
    if (incompleteTasks.length > 0) {
        const taskList = incompleteTasks.slice(0, 10).map((task, index) => {
            const taskNumber = index + 1;
            const createdDate = require('dayjs')(task.created_at).format('MMM DD');

            if (useTableFormat) {
                const numberPadded = taskNumber.toString().padStart(2, '0');
                return [`${numberPadded}. ${task.title}`, `📅 ${createdDate}`];
            } else {
                return `\`${taskNumber.toString().padStart(2, '0')}.\` ${task.title}\n     ┕ 📅 ${createdDate}`;
            }
        });

        let fieldValue;
        if (useTableFormat) {
            fieldValue = formatDataTable(taskList, [25, 15]);
        } else {
            const taskListString = taskList.join('\n\n');
            fieldValue = taskListString.length > 950 ?
                `\`\`\`md\n${taskListString.substring(0, 947)}...\n\`\`\`` :
                `\`\`\`md\n${taskListString}\n\`\`\``;
        }

        const fieldName = `📌 Pending Tasks • ${incompleteTasks.length} remaining`;

        embed.addFields([{
            name: fieldName,
            value: fieldValue,
            inline: false
        }]);
    }

    // Add recently completed tasks with enhanced formatting
    if (includeRecentCompleted && completedTasks.length > 0) {
        const recentCompleted = completedTasks
            .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))
            .slice(0, maxRecentCompleted);

        if (useTableFormat) {
            const completedList = recentCompleted.map(task => {
                const completedDate = require('dayjs')(task.completed_at).format('MMM DD');
                const points = task.points_awarded || 0;
                return [`✅ ${task.title}`, `${completedDate} (+${points} pts)`];
            });

            embed.addFields([{
                name: `✅ Recently Completed (${completedTasks.length} total)`,
                value: formatDataTable(completedList, [20, 15]),
                inline: false
            }]);
        } else {
            const completedList = recentCompleted.map(task => {
                const completedDate = require('dayjs')(task.completed_at).format('MMM DD');
                const points = task.points_awarded || 0;
                return `✅ ${task.title}\n*Completed: ${completedDate}* (+${points} pts)`;
            }).join('\n\n');

            embed.addFields([{
                name: `✅ Recently Completed (${completedTasks.length} total)`,
                value: completedList.length > 1024 ? completedList.substring(0, 1021) + '...' : completedList,
                inline: false
            }]);
        }
    }

    // Add task statistics with enhanced table format
    if (stats.totalTasks !== undefined) {
        const statsData = [
            ['Total Tasks', stats.totalTasks],
            ['Completed', stats.totalCompleted],
            ['Pending', stats.totalPending],
            ['Points Earned', stats.totalTaskPoints]
        ];

        const statsDisplay = useTableFormat ?
            formatDataTable(statsData, [15, 10]) :
            formatDataGrid(statsData, { useTable: true });

        embed.addFields([{
            name: '📊 Task Statistics',
            value: statsDisplay,
            inline: false
        }]);
    }

    // Add helpful footer
    embed.setFooter({
        text: helpText || 'Use /completetask <number> to complete tasks • /removetask <number> to remove tasks'
    });

    return embed;
}

// 🏆 Enhanced Leaderboard Template
function createLeaderboardTemplate(type, data, currentUser, options = {}) {
    const {
        maxEntries = 10,
        showUserPosition = true,
        includeMedals = true,
        includeStats = true,
        useEnhancedLayout = true,
        useTableFormat = true
    } = options;

    const isMonthly = type === 'monthly';
    const title = isMonthly ? '📅 Monthly Voice Leaderboard' : '🌟 All-Time Voice Leaderboard';
    const subtitle = isMonthly ?
        'Top performers by voice channel activity this month' :
        'All-time voice channel activity champions';

    const embed = createStyledEmbed('premium');

    if (useEnhancedLayout) {
        embed.setTitle(title)
            .setDescription(createHeader('Rankings', subtitle, '🏆', 'emphasis'));
    } else {
        embed.setTitle(title)
            .setDescription(createHeader('Rankings', subtitle, '🏆'));
    }

    // Get current user's position
    const userPosition = data.findIndex(entry => entry.discord_id === currentUser.id) + 1;

    // Add leaderboard entries with enhanced formatting
    const topEntries = data.slice(0, maxEntries);

    if (useTableFormat) {
        const leaderboardData = topEntries.map((entry, index) => {
            const position = index + 1;
            let positionDisplay = '';

            if (includeMedals) {
                positionDisplay = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : `#${position}`;
            } else {
                positionDisplay = `#${position}`;
            }

            const hours = entry.hours.toFixed(1);
            const points = entry.points;

            // Highlight current user
            const isCurrentUser = entry.discord_id === currentUser.id;
            const userDisplay = isCurrentUser ? `**${entry.username}** ⭐` : entry.username;

            return [
                `${positionDisplay} ${userDisplay}`,
                `${hours}h • ${points}pts`
            ];
        });

        embed.addFields([{
            name: '🏆 Top Rankings',
            value: formatDataTable(leaderboardData, [20, 15]) || 'No rankings available',
            inline: false
        }]);
    } else {
        let leaderboardText = '';
        topEntries.forEach((entry, index) => {
            const position = index + 1;
            let medal = '';

            if (includeMedals) {
                medal = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : `**${position}.**`;
            } else {
                medal = `**${position}.**`;
            }

            const hours = entry.hours.toFixed(1);
            const points = entry.points;

            // Highlight current user
            const isCurrentUser = entry.discord_id === currentUser.id;
            const userDisplay = isCurrentUser ? `**${entry.username}** ⭐` : entry.username;

            leaderboardText += `${medal} ${userDisplay}\n`;
            leaderboardText += `    🕒 ${hours}h • 💰 ${points} points\n\n`;
        });

        embed.addFields([{
            name: '🏆 Top Rankings',
            value: leaderboardText || 'No rankings available',
            inline: false
        }]);
    }

    // Add user's position with enhanced formatting
    if (showUserPosition) {
        if (userPosition > maxEntries && userPosition <= data.length) {
            const userEntry = data[userPosition - 1];
            const positionInfo = [
                ['Your Rank', `#${userPosition}`],
                ['Time Tracked', `${userEntry.hours.toFixed(1)}h`],
                ['Points Earned', userEntry.points]
            ];

            embed.addFields([{
                name: '📍 Your Position',
                value: useTableFormat ? formatDataTable(positionInfo, [12, 10]) : `**#${userPosition}** • 🕒 ${userEntry.hours.toFixed(1)}h • 💰 ${userEntry.points} points`,
                inline: false
            }]);
        } else if (userPosition > 0 && userPosition <= maxEntries) {
            embed.addFields([{
                name: '📍 Your Position',
                value: `### 🎉 Top Performer!\nYou're ranked **#${userPosition}** in the top ${maxEntries}!`,
                inline: false
            }]);
        } else if (userPosition === 0) {
            embed.addFields([{
                name: '📍 Your Position',
                value: '### 🚀 Get Started\nJoin a voice channel to appear on the leaderboard!',
                inline: false
            }]);
        }
    }

    // Add statistics with enhanced table format
    if (includeStats && data.length > 0) {
        const totalUsers = data.length;
        const totalHours = data.reduce((sum, entry) => sum + entry.hours, 0);
        const avgHours = totalUsers > 0 ? (totalHours / totalUsers).toFixed(1) : '0.0';

        const statsData = [
            ['Total Users', totalUsers],
            ['Total Hours', `${totalHours.toFixed(1)}h`],
            ['Average Hours', `${avgHours}h`]
        ];

        const statsDisplay = useTableFormat ?
            formatDataTable(statsData, [15, 12]) :
            formatDataGrid(statsData);

        embed.addFields([{
            name: '📊 Community Statistics',
            value: statsDisplay,
            inline: false
        }]);
    }

    embed.setFooter({
        text: isMonthly ?
            'Monthly rankings reset on the 1st of each month' :
            'All-time productivity champions'
    });

    return embed;
}

// ⏱️ Enhanced Timer Status Template
function createTimerTemplate(timerData, options = {}) {
    const {
        showProgress = true,
        animated = false,
        useEnhancedLayout = true,
        useTableFormat = true
    } = options;

    const { phase, timeRemaining, totalTime, isActive } = timerData;
    const isWorkPhase = phase === 'work' || phase === 'study';

    const phaseEmoji = isWorkPhase ? '📚' : '☕';
    const phaseText = isWorkPhase ? 'FOCUS TIME' : 'BREAK TIME';
    const statusColor = isWorkPhase ? BotColors.INFO : BotColors.SUCCESS;

    const embed = createStyledEmbed()
        .setColor(statusColor)
        .setTitle(`${phaseEmoji} ${phaseText}`);

    if (useEnhancedLayout) {
        embed.setDescription(createHeader('Timer Status', 'Stay focused and productive!', '⏰', 'emphasis'));
    } else {
        embed.setDescription(createHeader('Timer Status', 'Stay focused and productive!', '⏰'));
    }

    if (showProgress && totalTime > 0) {
        const progressSection = createProgressSection(
            'Session Progress',
            totalTime - timeRemaining,
            totalTime,
            {
                emoji: '📊',
                style: 'detailed',
                showPercentage: true,
                barLength: 15
            }
        );

        embed.addFields([{
            name: '📊 Progress Tracking',
            value: progressSection,
            inline: false
        }]);
    }

    // Add session details with table format
    if (useTableFormat) {
        const sessionDetails = [
            ['Phase', isWorkPhase ? 'Work Session' : 'Break Time'],
            ['Time Left', `${timeRemaining} minutes`],
            ['Status', isActive ? '🔴 Active' : '⏸️ Paused']
        ];

        embed.addFields([{
            name: '📋 Session Details',
            value: formatDataTable(sessionDetails, [12, 10]),
            inline: false
        }]);
    }

    embed.setFooter({
        text: isWorkPhase ?
            'Focus time! Minimize distractions and stay productive' :
            'Break time! Relax and recharge for the next session'
    });

    return embed;
}

// 🏠 Enhanced House Points Template
function createHouseTemplate(houses, type, options = {}) {
    const {
        showEmojis = true,
        includeStats = true,
        useEnhancedLayout = true,
        useTableFormat = true
    } = options;

    const houseEmojis = {
        'Gryffindor': '🦁',
        'Hufflepuff': '🦡',
        'Ravenclaw': '🦅',
        'Slytherin': '🐍'
    };

    const houseColors = {
        'Gryffindor': BotColors.HOUSE_GRYFFINDOR,
        'Hufflepuff': BotColors.HOUSE_HUFFLEPUFF,
        'Ravenclaw': BotColors.HOUSE_RAVENCLAW,
        'Slytherin': BotColors.HOUSE_SLYTHERIN
    };

    const isMonthly = type === 'monthly';
    const title = isMonthly ? '🏆 Monthly House Points' : '⭐ All-Time House Points';
    const subtitle = isMonthly ?
        'House competition rankings for this month' :
        'All-time house standings and legacy';

    // Use the leading house's color
    const topHouse = houses[0];
    const embedColor = topHouse ? (houseColors[topHouse.name] || BotColors.PRIMARY) : BotColors.PRIMARY;

    const embed = createStyledEmbed()
        .setColor(embedColor)
        .setTitle(title);

    if (useEnhancedLayout) {
        embed.setDescription(createHeader('House Competition', subtitle, '🏰', 'emphasis'));
    } else {
        embed.setDescription(createHeader('House Competition', subtitle, '🏰'));
    }

    // Add house rankings with enhanced table format
    if (houses && houses.length > 0) {
        if (useTableFormat) {
            const houseData = houses.map((house, index) => {
                const position = index + 1;
                const emoji = showEmojis ? houseEmojis[house.name] || '🏠' : '';
                const medal = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : `#${position}`;

                return [
                    `${medal} ${emoji} ${house.name}`,
                    `${house.points} points`
                ];
            });

            embed.addFields([{
                name: '🏆 House Rankings',
                value: formatDataTable(houseData, [18, 12]),
                inline: false
            }]);
        } else {
            const houseRankings = houses.map((house, index) => {
                const position = index + 1;
                const emoji = showEmojis ? houseEmojis[house.name] || '🏠' : '';
                const medal = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : `**${position}.**`;

                return `${medal} ${emoji} **${house.name}**\n    💰 ${house.points} points`;
            }).join('\n\n');

            embed.addFields([{
                name: '🏆 House Rankings',
                value: houseRankings,
                inline: false
            }]);
        }
    }

    // Add house statistics
    if (includeStats && houses && houses.length > 0) {
        const totalPoints = houses.reduce((sum, house) => sum + house.points, 0);
        const averagePoints = Math.round(totalPoints / houses.length);
        const leadingHouse = houses[0];

        const statsData = [
            ['Total Points', totalPoints],
            ['Average Points', averagePoints],
            ['Leading House', `${houseEmojis[leadingHouse.name]} ${leadingHouse.name}`],
            ['Point Spread', `${leadingHouse.points - houses[houses.length - 1].points}`]
        ];

        const statsDisplay = useTableFormat ?
            formatDataTable(statsData, [15, 12]) :
            formatDataGrid(statsData);

        embed.addFields([{
            name: '📊 Competition Statistics',
            value: statsDisplay,
            inline: false
        }]);
    }

    embed.setFooter({
        text: isMonthly ?
            'House points reset on the 1st of each month' :
            'House legacy and pride through the ages'
    });

    return embed;
}

// 🩺 Enhanced Health Report Template
function createHealthTemplate(title, healthData, options = {}) {
    const {
        showDetails = true,
        includeMetrics = true,
        useEnhancedLayout = true,
        useTableFormat = true,
        showBigNumbers = true,
        includeTimestamp = true
    } = options;

    // Handle both old and new parameter formats for backwards compatibility
    let data, type = 'overview';
    if (typeof title === 'string') {
        // New format: title, healthData, options
        data = healthData;
    } else {
        // Old format: healthData, type, options (fallback)
        data = title;
        type = healthData || 'overview';
        title = {
            overview: '🩺 Bot Health Overview',
            detailed: '🔍 Detailed Health Report',
            database: '🗄️ Database Health Report',
            performance: '⚡ Performance Health Report'
        }[type] || '🩺 Bot Health Overview';
    }

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
        checks,
        metrics,
        message,
        troubleshooting = [],
        initializationNote,
        estimatedWait
    } = data;

    // Determine status emoji and health state
    const finalStatusEmoji = statusEmoji || (
        status === 'healthy' ? StatusEmojis.HEALTHY :
            status === 'degraded' ? StatusEmojis.WARNING :
                status === 'unavailable' ? '⚠️' :
                    status === 'initializing' ? '🔄' :
                        StatusEmojis.ERROR
    );
    const isHealthy = systemHealth !== undefined ? systemHealth : status === 'healthy';

    const embed = createStyledEmbed()
        .setTitle(`🩺 ${title}`)
        .setColor(
            isHealthy ? BotColors.SUCCESS :
                status === 'degraded' ? BotColors.WARNING :
                    status === 'unavailable' ? BotColors.WARNING :
                        status === 'initializing' ? BotColors.INFO :
                            BotColors.ERROR
        );

    if (useEnhancedLayout) {
        embed.setDescription(`${finalStatusEmoji} ${status.toUpperCase()}`);
    } else {
        embed.setDescription(`**Status:** ${finalStatusEmoji} ${status.toUpperCase()}`);
    }

    // Add custom message for special statuses
    if (message) {
        embed.addFields([{
            name: '📝 Status Information',
            value: message,
            inline: false
        }]);
    }

    // Add initialization details if provided
    if (initializationNote || estimatedWait) {
        const initData = [];
        if (initializationNote) initData.push(['Current Step', initializationNote]);
        if (estimatedWait) initData.push(['Estimated Wait', estimatedWait]);

        embed.addFields([{
            name: '🔄 Initialization Progress',
            value: useTableFormat ? formatDataTable(initData, [15, 20]) : initData.map(([k, v]) => `**${k}:** ${v}`).join('\n'),
            inline: false
        }]);
    }

    // Add troubleshooting section if provided
    if (troubleshooting && troubleshooting.length > 0) {
        const troubleshootingList = troubleshooting.map(tip => `• ${tip}`).join('\n');

        embed.addFields([{
            name: '🔧 Troubleshooting Tips',
            value: troubleshootingList,
            inline: false
        }]);
    }

    if (includeTimestamp) {
        embed.setTimestamp();
    }

    // Create stats card with big numbers if enabled and data is available (but not for unavailable/initializing states)
    if (showBigNumbers && (uptime !== undefined || activeSessions !== undefined) && status !== 'unavailable' && status !== 'initializing') {
        const statsData = [];
        if (uptime !== undefined) {
            const uptimeDisplay = typeof uptime === 'object' ? uptime.percent : uptime;
            statsData.push(['Uptime Score', `${uptimeDisplay}%`]);
        }
        if (healthChecks) {
            statsData.push(['Health Checks', healthChecks]);
        }
        if (activeSessions !== undefined) {
            statsData.push(['Active Sessions', activeSessions.toString()]);
        }

        if (statsData.length > 0) {
            const statsCard = createStatsCard(
                'System Health Overview',
                statsData,
                {
                    showBigNumbers: true,
                    emphasizeFirst: true,
                    emoji: '📊'
                }
            );

            embed.addFields([{
                name: createHeader('Health Overview', null, '📊', 'emphasis'),
                value: statsCard,
                inline: false
            }]);
        }
    }

    // Add uptime metrics with enhanced formatting (but not for unavailable/initializing states)
    if (includeMetrics && uptime && status !== 'unavailable' && status !== 'initializing') {
        if (useTableFormat) {
            const uptimeData = [];

            // Handle both new format and old format
            if (systemHealth !== undefined) {
                // New format from health command
                uptimeData.push(['System Status', `${finalStatusEmoji} ${isHealthy ? 'All Operational' : 'Issues Detected'}`]);
                if (typeof uptime === 'number') {
                    uptimeData.push(['Uptime Score', `${uptime}%`]);
                }
                if (healthChecks) {
                    uptimeData.push(['Health Checks', healthChecks]);
                }
                if (recoveryStatus !== undefined) {
                    uptimeData.push(['Recovery Status', recoveryStatus ? '✅ Active' : '❌ Inactive']);
                }
                if (activeSessions !== undefined) {
                    uptimeData.push(['Active Sessions', activeSessions.toString()]);
                }
                if (autoSave !== undefined) {
                    uptimeData.push(['Auto-Save', autoSave ? '✅ Enabled' : '❌ Disabled']);
                }
                if (lastUpdate) {
                    uptimeData.push(['Last Update', `<t:${lastUpdate}:R>`]);
                }
            } else {
                // Old format fallback
                uptimeData.push(['System Availability', `${uptime.percent || uptime}%`]);
                uptimeData.push(['Health Checks Passed', `${uptime.healthy}/${uptime.total}`]);
                uptimeData.push(['Last Check', uptime.lastCheck || 'Just now']);
            }

            if (uptimeData.length > 0) {
                const tableText = formatDataTable(uptimeData, [20, 25]);
                embed.addFields([{
                    name: createHeader('System Metrics', null, '🔧', 'emphasis'),
                    value: tableText,
                    inline: false
                }]);
            }
        }
    }

    // Show issues if any exist
    if (issues && issues.length > 0) {
        const issuesList = issues.slice(0, 3).map(issue =>
            typeof issue === 'string' ? `• ${issue}` : `• **${issue.name}**: ${issue.error}`
        ).join('\n');

        embed.addFields([{
            name: createHeader('Issues Detected', null, '⚠️', 'emphasis'),
            value: issuesList,
            inline: false
        }]);

        if (issues.length > 3) {
            embed.addFields([{
                name: '📝 Additional Info',
                value: `... and ${issues.length - 3} more issues. Use \`/health detailed\` for full report.`,
                inline: false
            }]);
        }
    }

    // Add footer with helpful info
    embed.setFooter({
        text: isHealthy ?
            'All systems operational • Use /health detailed for comprehensive analysis' :
            'Issues detected • Use /health detailed for troubleshooting information'
    });

    return embed;
}

// 🎯 Enhanced Achievement/Success Template
function createSuccessTemplate(title, message, options = {}) {
    const {
        celebration = false,
        points = null,
        streak = null,
        includeEmoji = true,
        useEnhancedLayout = true,
        useTableFormat = true,
        showBigNumbers = false
    } = options;

    const emoji = celebration ? '🎉' : '✅';
    const embed = createStyledEmbed('success');

    if (useEnhancedLayout) {
        embed.setTitle(`${includeEmoji ? emoji + ' ' : ''}${title}`)
            .setDescription(message);
    } else {
        embed.setTitle(`${includeEmoji ? emoji + ' ' : ''}${title}`)
            .setDescription(message);
    }

    if (points !== null || streak !== null) {
        const rewards = [];

        if (useTableFormat) {
            const rewardData = [];
            if (points !== null) rewardData.push(['Points Earned', `+${points}`]);
            if (streak !== null) rewardData.push(['Current Streak', `${streak} days`]);

            embed.addFields([{
                name: celebration ? '🎁 Rewards Earned' : '📊 Progress Update',
                value: formatDataTable(rewardData, [15, 10]),
                inline: false
            }]);
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

            embed.addFields([{
                name: celebration ? '🎁 Rewards Earned' : '📊 Progress Update',
                value: rewards.join('\n'),
                inline: false
            }]);
        }
    }

    return embed;
}

// ⏱️ Timer Template
function createTimerTemplate(action, data, options = {}) {
    const {
        showProgress = true,
        includeMotivation = true,
        style = 'pomodoro'
    } = options;

    const { workTime, breakTime, voiceChannel, phase, timeRemaining } = data;

    let embed;

    switch (action) {
    case 'start':
        embed = createStyledEmbed('primary')
            .setTitle('⏱️ Pomodoro Timer Started')
            .setDescription(createHeader('Focus Session Active', 'Time to boost your productivity!', '🎯'));

        // Add timer configuration
        const configFields = [
            `🕒 **Work Time:** ${workTime} minutes`,
            breakTime > 0 ? `☕ **Break Time:** ${breakTime} minutes` : null,
            `📍 **Location:** <#${voiceChannel.id}>`
        ].filter(Boolean);

        embed.addFields([{
            name: '📋 Session Configuration',
            value: configFields.join('\n'),
            inline: false
        }]);

        if (showProgress) {
            const progressBar = createProgressBar(0, workTime, 15, '▓', '░');
            embed.addFields([{
                name: '📊 Progress Tracker',
                value: `${progressBar.bar}\n**Phase:** Work Session • **Status:** ${StatusEmojis.IN_PROGRESS} Active`,
                inline: false
            }]);
        }

        if (includeMotivation) {
            embed.addFields([{
                name: '💪 Stay Focused!',
                value: 'Focus time! Good luck with your session!\nRemember: great achievements require focused effort.',
                inline: false
            }]);
        }

        embed.setFooter({ text: 'Use /stoptimer if you need to stop early • /time to check remaining time' });
        break;

    case 'work_complete':
        embed = createStyledEmbed('success')
            .setTitle('🔔 Work Session Complete!')
            .setDescription(createHeader('Great Work!', 'You\'ve successfully completed your focus session', '🎉'));

        if (breakTime > 0) {
            embed.addFields([{
                name: '☕ Break Time!',
                value: `Take a well-deserved **${breakTime}-minute break**.\n🔔 I'll notify you when it's time to get back to work.`,
                inline: false
            }]);
        } else {
            embed.addFields([{
                name: '🎯 Session Finished!',
                value: 'Great job staying focused! You\'ve completed your productivity session.',
                inline: false
            }]);
        }
        break;

    case 'break_complete':
        embed = createStyledEmbed('info')
            .setTitle('🕒 Break Time Is Over!')
            .setDescription(createHeader('Back to Work!', 'Time to get back to your productive flow', '💪'));

        embed.addFields([{
            name: '🎯 Ready to Focus',
            value: 'Break\'s over! Time to get back to work.\nYou\'ve got this! Stay focused and productive!',
            inline: false
        }]);
        break;

    case 'status':
        const isBreak = phase === 'break';
        embed = createStyledEmbed(isBreak ? 'warning' : 'primary')
            .setTitle(`⏰ Timer Status - ${phase.charAt(0).toUpperCase() + phase.slice(1)} Phase`)
            .setDescription(createHeader('Active Session', `Currently in ${phase} phase`, isBreak ? '☕' : '🎯'));

        if (showProgress && timeRemaining !== undefined) {
            const totalTime = isBreak ? breakTime : workTime;
            const elapsed = totalTime - timeRemaining;
            const progressBar = createProgressBar(elapsed, totalTime, 15);

            embed.addFields([{
                name: '📊 Progress',
                value: `${progressBar.bar}\n**Time Remaining:** ${timeRemaining} minutes • **Status:** ${StatusEmojis.IN_PROGRESS} Active`,
                inline: false
            }]);
        }

        embed.addFields([{
            name: '📍 Session Info',
            value: `**Location:** <#${voiceChannel.id}>\n**Phase:** ${phase.charAt(0).toUpperCase() + phase.slice(1)}`,
            inline: false
        }]);
        break;

    case 'no_timer':
        embed = createStyledEmbed('secondary')
            .setTitle('⏰ Timer Status')
            .setDescription(createHeader('No Active Timer', `No Pomodoro timer is currently running in <#${voiceChannel.id}>`, '💤'));

        embed.addFields([{
            name: '💡 Get Started',
            value: 'Use `/timer <work_minutes>` to start a new Pomodoro session!\nRecommended: `/timer 25 5` for a classic 25-minute work session with 5-minute break.',
            inline: false
        }]);

        if (includeMotivation) {
            embed.addFields([{
                name: '🎯 Productivity Tips',
                value: '• Choose focused work periods (20-50 minutes)\n• Take regular breaks to maintain concentration\n• Stay in your voice channel during sessions',
                inline: false
            }]);
        }
        break;
    }

    return embed;
}

// ❌ Error Template
function createErrorTemplate(title, message, options = {}) {
    const {
        includeHelp = true,
        helpText = 'Please try again or contact support if the issue persists.',
        additionalInfo = null,
        showEmoji = true
    } = options;

    const embed = createStyledEmbed('error')
        .setTitle(`${showEmoji ? '❌ ' : ''}${title}`)
        .setDescription(message);

    if (includeHelp) {
        let helpValue = helpText;
        if (additionalInfo) {
            helpValue += `\n\n**Additional Info:** ${additionalInfo}`;
        }

        embed.addFields([{
            name: '💡 Need Help?',
            value: helpValue,
            inline: false
        }]);
    }

    return embed;
}

// 👑 Enhanced House Champions Template
function createChampionTemplate(monthlyChampions, allTimeChampions, currentUser, options = {}) {
    const {
        useEnhancedLayout = true,
        useTableFormat = true,
        showUserInfo = true
    } = options;

    const houseEmojis = {
        'Gryffindor': '🦁',
        'Hufflepuff': '🦡',
        'Ravenclaw': '🦅',
        'Slytherin': '🐍'
    };

    const embed = createStyledEmbed()
        .setColor(BotColors.PREMIUM)
        .setTimestamp();

    if (useEnhancedLayout) {
        embed.setTitle('👑 House Champions')
            .setDescription('Top contributors from each house');
    } else {
        embed.setTitle('👑 House Champions')
            .setDescription('Top contributing members from each house');
    }

    // Define all houses for consistent display
    const allHouses = ['Gryffindor', 'Hufflepuff', 'Ravenclaw', 'Slytherin'];

    // Monthly champions section - always show all houses
    const monthlyChampionData = allHouses.map(house => {
        const emoji = houseEmojis[house] || '🏠';
        const champion = (monthlyChampions || []).find(c => c.house === house);
        if (champion) {
            return [
                `${emoji} ${house}`,
                `${champion.username} • ${champion.points.toLocaleString()} pts`
            ];
        } else {
            return [
                `${emoji} ${house}`,
                'No champion yet'
            ];
        }
    });

    if (useTableFormat) {
        embed.addFields([{
            name: createHeader('Monthly Champions', null, '🗓️', 'emphasis'),
            value: formatDataTable(monthlyChampionData, [18, 25]),
            inline: false
        }]);
    } else {
        let monthlyText = '';
        allHouses.forEach(house => {
            const emoji = houseEmojis[house] || '🏠';
            const champion = (monthlyChampions || []).find(c => c.house === house);
            if (champion) {
                monthlyText += `${emoji} **${house}**: ${champion.username}\n`;
                monthlyText += `   ${champion.points.toLocaleString()} points\n\n`;
            } else {
                monthlyText += `${emoji} **${house}**: No champion yet\n`;
                monthlyText += '   0 points\n\n';
            }
        });

        embed.addFields([{
            name: '🗓️ Monthly Champions',
            value: monthlyText,
            inline: true
        }]);
    }

    // All-time champions section - always show all houses
    const allTimeChampionData = allHouses.map(house => {
        const emoji = houseEmojis[house] || '🏠';
        const champion = (allTimeChampions || []).find(c => c.house === house);
        if (champion) {
            return [
                `${emoji} ${house}`,
                `${champion.username} • ${champion.points.toLocaleString()} pts`
            ];
        } else {
            return [
                `${emoji} ${house}`,
                'No champion yet'
            ];
        }
    });

    if (useTableFormat) {
        embed.addFields([{
            name: createHeader('All-Time Champions', null, '⭐', 'emphasis'),
            value: formatDataTable(allTimeChampionData, [18, 25]),
            inline: false
        }]);
    } else {
        let allTimeText = '';
        allHouses.forEach(house => {
            const emoji = houseEmojis[house] || '🏠';
            const champion = (allTimeChampions || []).find(c => c.house === house);
            if (champion) {
                allTimeText += `${emoji} **${house}**: ${champion.username}\n`;
                allTimeText += `   ${champion.points.toLocaleString()} points\n\n`;
            } else {
                allTimeText += `${emoji} **${house}**: No champion yet\n`;
                allTimeText += '   0 points\n\n';
            }
        });

        embed.addFields([{
            name: '⭐ All-Time Champions',
            value: allTimeText,
            inline: true
        }]);
    }

    // User's house information
    if (showUserInfo && currentUser && currentUser.house) {
        const emoji = houseEmojis[currentUser.house] || '🏠';
        embed.addFields([{
            name: createHeader('Your House', null, '🏠', 'emphasis'),
            value: `${emoji} **${currentUser.house}**`,
            inline: false
        }]);
    }

    // Champions statistics - always show
    const actualMonthlyChampions = (monthlyChampions || []).length;
    const actualAllTimeChampions = (allTimeChampions || []).length;
    const totalChampions = new Set([
        ...(monthlyChampions || []).map(c => c.house),
        ...(allTimeChampions || []).map(c => c.house)
    ]).size;

    const statsData = [
        ['Houses Represented', totalChampions || 0],
        ['Monthly Champions', actualMonthlyChampions],
        ['All-Time Champions', actualAllTimeChampions]
    ];

    const statsDisplay = useTableFormat ?
        formatDataTable(statsData, [18, 12]) :
        formatDataGrid(statsData);

    embed.addFields([{
        name: createHeader('Champion Statistics', null, '📊', 'emphasis'),
        value: statsDisplay,
        inline: false
    }]);

    embed.setFooter({
        text: 'House champions are the highest point earners in each house'
    });

    return embed;
}

module.exports = {
    createStatsTemplate,
    createTaskTemplate,
    createLeaderboardTemplate,
    createTimerTemplate,
    createHouseTemplate,
    createChampionTemplate,
    createHealthTemplate,
    createSuccessTemplate,
    createErrorTemplate
};
