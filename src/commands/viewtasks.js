const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const taskService = require('../services/taskService');
const dayjs = require('dayjs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('viewtasks')
        .setDescription('View all your tasks with their numbers'),
    async execute(interaction) {
        try {
            await interaction.deferReply();

            const discordId = interaction.user.id;
            const tasks = await taskService.getUserTasks(discordId);

            if (tasks.length === 0) {
                return interaction.editReply({
                    content: `┌─────────────────────────┐
│ 📝 **NO TASKS FOUND**   │
└─────────────────────────┘

🌟 **Ready to get productive?**
Use \`/addtask <description>\` to create your first task!

💡 *Tip: Completing tasks earns you 2 points each!*`
                });
            }

            // Separate completed and incomplete tasks
            const incompleteTasks = tasks.filter(task => !task.is_complete);
            const completedTasks = tasks.filter(task => task.is_complete);

            const embed = new EmbedBuilder()
                .setTitle('📋 Your Personal Task Dashboard')
                .setDescription(`**${interaction.user.username}**'s productivity center`)
                .setColor(0x3498db)
                .setThumbnail(interaction.user.displayAvatarURL())
                .setTimestamp();

            // Add incomplete tasks
            if (incompleteTasks.length > 0) {
                const incompleteList = incompleteTasks.map((task, index) => {
                    const taskNumber = index + 1;
                    const createdDate = dayjs(task.created_at).format('MMM DD');
                    return `\`${taskNumber.toString().padStart(2, '0')}.\` ${task.title}\n     ┕ 📅 ${createdDate}`;
                }).join('\n\n');

                embed.addFields([{
                    name: `📌 Pending Tasks • ${incompleteTasks.length} remaining`,
                    value: `\`\`\`md\n${incompleteList.length > 950 ? incompleteList.substring(0, 947) + '...' : incompleteList}\n\`\`\``,
                    inline: false
                }]);
            }

            // Add completed tasks (show last 5)
            if (completedTasks.length > 0) {
                const recentCompleted = completedTasks
                    .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))
                    .slice(0, 5);
                
                const completedList = recentCompleted.map(task => {
                    const completedDate = dayjs(task.completed_at).format('MMM DD');
                    const points = task.points_awarded || 0;
                    return `✅ ${task.title}\n*Completed: ${completedDate}* (+${points} pts)`;
                }).join('\n\n');

                embed.addFields([{
                    name: `✅ Recently Completed (${completedTasks.length} total)`,
                    value: completedList.length > 1024 ? completedList.substring(0, 1021) + '...' : completedList,
                    inline: false
                }]);
            }

            // Add task statistics
            const totalTasks = tasks.length;
            const totalCompleted = completedTasks.length;
            const totalPending = incompleteTasks.length;
            const totalTaskPoints = tasks.reduce((sum, task) => sum + (task.points_awarded || 0), 0);

            embed.addFields([{
                name: '📊 Task Statistics',
                value: `**Total Tasks:** ${totalTasks}\n**Completed:** ${totalCompleted}\n**Pending:** ${totalPending}\n**Points Earned:** ${totalTaskPoints}`,
                inline: false
            }]);

            // Add helpful footer
            embed.setFooter({ 
                text: 'Use /completetask <number> to complete tasks • /removetask <number> to remove tasks' 
            });

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in /viewtasks:', error);
            
            const errorMessage = '❌ An error occurred while fetching your tasks. Please try again.';
            
            if (!interaction.replied && !interaction.deferred) {
                try {
                    await interaction.reply({
                        content: errorMessage,
                    });
                } catch (err) {
                    console.error('Error sending error reply:', err);
                }
            } else {
                try {
                    await interaction.editReply({
                        content: errorMessage,
                    });
                } catch (err) {
                    console.error('Error editing reply:', err);
                }
            }
        }
    }
};
