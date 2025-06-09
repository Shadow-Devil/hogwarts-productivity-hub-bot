const { SlashCommandBuilder } = require('discord.js');
const taskService = require('../services/taskService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('removetask')
        .setDescription('Remove a task from your to-do list')
        .addIntegerOption(option =>
            option
                .setName('number')
                .setDescription('The task number to remove (use /viewtasks to see numbers)')
                .setRequired(true)
                .setMinValue(1)),
    async execute(interaction) {
        try {
            await interaction.deferReply();

            const discordId = interaction.user.id;
            const taskNumber = interaction.options.getInteger('number');

            const result = await taskService.removeTask(discordId, taskNumber);

            if (result.success) {
                return interaction.editReply({
                    content: `┌─────────────────────────────────┐
│ 🗑️ **TASK REMOVED SUCCESSFULLY** │
└─────────────────────────────────┘

✅ ${result.message}

💡 *Use \`/viewtasks\` to see your updated task list*`
                });
            } else {
                return interaction.editReply({
                    content: `┌──────────────────────────┐
│ ❌ **REMOVAL FAILED**    │
└──────────────────────────┘

${result.message}

💡 *Use \`/viewtasks\` to check your task numbers*`
                });
            }
        } catch (error) {
            console.error('Error in /removetask:', error);
            
            const errorMessage = '❌ An error occurred while removing the task. Please try again.';
            
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
