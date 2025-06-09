const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const voiceService = require('../services/voiceService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('housepoints')
        .setDescription('View house point leaderboards and champions')
        .addStringOption(option =>
            option
                .setName('type')
                .setDescription('Choose leaderboard type')
                .setRequired(true)
                .addChoices(
                    { name: '🏆 Monthly House Rankings', value: 'monthly' },
                    { name: '⭐ All Time House Rankings', value: 'alltime' },
                    { name: '👑 House Champions', value: 'housechampion' }
                )),
    async execute(interaction) {
        try {
            await interaction.deferReply();

            const leaderboardType = interaction.options.getString('type');
            
            if (leaderboardType === 'housechampion') {
                await showHouseChampions(interaction);
            } else {
                await showHouseLeaderboard(interaction, leaderboardType);
            }

        } catch (error) {
            console.error('Error in housepoints command:', error);
            const errorMessage = '❌ An error occurred while fetching house leaderboard data. Please try again later.';
            
            try {
                if (interaction.deferred) {
                    await interaction.editReply({ content: errorMessage });
                } else if (!interaction.replied) {
                    await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
                }
            } catch (replyError) {
                console.error('Error sending error reply:', replyError);
            }
        }
    }
};

async function showHouseLeaderboard(interaction, type) {
    const houseLeaderboard = await voiceService.getHouseLeaderboard(type);

    if (!houseLeaderboard || houseLeaderboard.length === 0) {
        return interaction.editReply({
            content: '🏠 No house data available yet. Houses need to earn points first!',
        });
    }

    // House emojis for visual appeal
    const houseEmojis = {
        'Gryffindor': '🦁',
        'Hufflepuff': '🦡',
        'Ravenclaw': '🦅',
        'Slytherin': '🐍'
    };

    // House colors
    const houseColors = {
        'Gryffindor': 0x7C0A02,   // Dark red
        'Hufflepuff': 0xFFDB00,   // Yellow
        'Ravenclaw': 0x0E1A40,    // Dark blue
        'Slytherin': 0x1A472A     // Dark green
    };

    const isMonthly = type === 'monthly';
    const title = isMonthly ? '🏆 Monthly House Points' : '⭐ All-Time House Points';
    const description = isMonthly 
        ? 'House rankings for this month'
        : 'All-time house rankings';

    // Create main embed with top house color
    const topHouse = houseLeaderboard[0];
    const embedColor = houseColors[topHouse.name] || 0x5865F2;

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(embedColor)
        .setTimestamp()
        .setFooter({ 
            text: isMonthly ? 'House points reset on the 1st of each month' : 'All-time house standings'
        });

    // Format house rankings
    let leaderboardText = '';
    const medals = ['🥇', '🥈', '🥉', '4️⃣'];
    
    houseLeaderboard.forEach((house, index) => {
        const position = index + 1;
        const medal = medals[index] || `${position}️⃣`;
        const emoji = houseEmojis[house.name] || '🏠';
        const points = house.points || 0;
        
        leaderboardText += `${medal} ${emoji} **${house.name}**\n`;
        leaderboardText += `   ${points.toLocaleString()} points\n\n`;
    });

    embed.addFields([
        { 
            name: '🏠 House Rankings', 
            value: leaderboardText || 'No houses have earned points yet.', 
            inline: false 
        }
    ]);

    // Add statistics
    const totalPoints = houseLeaderboard.reduce((sum, house) => sum + (house.points || 0), 0);
    const topHousePoints = topHouse.points || 0;
    const averagePoints = Math.round(totalPoints / houseLeaderboard.length);

    embed.addFields([
        { 
            name: '📊 Statistics', 
            value: `**Total Points Awarded:** ${totalPoints.toLocaleString()}\n` +
                   `**Leading House:** ${houseEmojis[topHouse.name]} ${topHouse.name} (${topHousePoints.toLocaleString()} pts)\n` +
                   `**Average House Points:** ${averagePoints.toLocaleString()}`,
            inline: false 
        }
    ]);

    await interaction.editReply({ embeds: [embed] });
}

async function showHouseChampions(interaction) {
    const monthlyChampions = await voiceService.getHouseChampions('monthly');
    const allTimeChampions = await voiceService.getHouseChampions('alltime');

    if ((!monthlyChampions || monthlyChampions.length === 0) && 
        (!allTimeChampions || allTimeChampions.length === 0)) {
        return interaction.editReply({
            content: '👑 No house champions data available yet. Users need to earn points first!',
        });
    }

    // House emojis and colors
    const houseEmojis = {
        'Gryffindor': '🦁',
        'Hufflepuff': '🦡',
        'Ravenclaw': '🦅',
        'Slytherin': '🐍'
    };

    const embed = new EmbedBuilder()
        .setTitle('👑 House Champions')
        .setDescription('Top contributing members from each house')
        .setColor(0xFFD700) // Gold color for champions
        .setTimestamp()
        .setFooter({ 
            text: 'House champions are the highest point earners in each house'
        });

    // Monthly champions
    if (monthlyChampions && monthlyChampions.length > 0) {
        let monthlyText = '';
        monthlyChampions.forEach(champion => {
            const emoji = houseEmojis[champion.house] || '🏠';
            monthlyText += `${emoji} **${champion.house}**: ${champion.username}\n`;
            monthlyText += `   ${champion.points.toLocaleString()} points\n\n`;
        });

        embed.addFields([
            { 
                name: '🗓️ Monthly Champions', 
                value: monthlyText || 'No monthly champions yet.', 
                inline: true 
            }
        ]);
    }

    // All-time champions
    if (allTimeChampions && allTimeChampions.length > 0) {
        let allTimeText = '';
        allTimeChampions.forEach(champion => {
            const emoji = houseEmojis[champion.house] || '🏠';
            allTimeText += `${emoji} **${champion.house}**: ${champion.username}\n`;
            allTimeText += `   ${champion.points.toLocaleString()} points\n\n`;
        });

        embed.addFields([
            { 
                name: '⭐ All-Time Champions', 
                value: allTimeText || 'No all-time champions yet.', 
                inline: true 
            }
        ]);
    }

    // Get current user's house and position
    const currentUserId = interaction.user.id;
    const userMember = await interaction.guild.members.fetch(currentUserId).catch(() => null);
    
    if (userMember) {
        const { getUserHouse } = require('../models/db');
        const userHouse = await getUserHouse(userMember);
        
        if (userHouse) {
            embed.addFields([
                { 
                    name: '🏠 Your House', 
                    value: `${houseEmojis[userHouse]} **${userHouse}**`, 
                    inline: false 
                }
            ]);
        }
    }

    await interaction.editReply({ embeds: [embed] });
}
