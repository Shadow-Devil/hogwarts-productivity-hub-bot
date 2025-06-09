const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const taskService = require('../services/taskService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('completetask')
        .setDescription('Mark a task as complete and earn 2 points')
        .addIntegerOption(option =>
            option
                .setName('number')
                .setDescription('The task number to complete (use /viewtasks to see numbers)')
                .setRequired(true)
                .setMinValue(1)),
    async execute(interaction) {
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const discordId = interaction.user.id;
            const taskNumber = interaction.options.getInteger('number');
            const member = interaction.member;

            const result = await taskService.completeTask(discordId, taskNumber, member);

            if (result.success) {
                return interaction.editReply({
                    content: `┌─────────────────────────────────────┐
│ 🎉 **TASK COMPLETED SUCCESSFULLY!** │
└─────────────────────────────────────┘

✅ ${result.message}

🏆 *Great job! Keep up the momentum!*
💡 *Use \`/viewtasks\` to see your progress*`
                });
            } else {
                return interaction.editReply({
                    content: `┌─────────────────────────────┐
│ ❌ **COMPLETION FAILED**    │
└─────────────────────────────┘

${result.message}

💡 *Use \`/viewtasks\` to check your task numbers*`
                });
            }
        } catch (error) {
            console.error('Error in /completetask:', error);
            
            const errorMessage = '❌ An error occurred while completing the task. Please try again.';
            
            if (!interaction.replied && !interaction.deferred) {
                try {
                    await interaction.reply({
                        content: errorMessage,
                        flags: MessageFlags.Ephemeral,
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
