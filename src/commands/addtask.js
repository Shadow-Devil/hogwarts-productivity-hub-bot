const { SlashCommandBuilder } = require('discord.js');
const taskService = require('../services/taskService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addtask')
        .setDescription('Add a new task to your personal to-do list')
        .addStringOption(option =>
            option
                .setName('title')
                .setDescription('The task description')
                .setRequired(true)
                .setMaxLength(500)),
    async execute(interaction) {
        try {
            await interaction.deferReply();

            const discordId = interaction.user.id;
            const title = interaction.options.getString('title');

            // Validate title length and content
            if (title.trim().length === 0) {
                return interaction.editReply({
                    content: '❌ Task title cannot be empty.',
                });
            }

            if (title.length > 500) {
                return interaction.editReply({
                    content: '❌ Task title must be 500 characters or less.',
                });
            }

            // Add the task
            const task = await taskService.addTask(discordId, title.trim());

            return interaction.editReply({
                content: `┌─────────────────────┐\n│ ✅ **TASK ADDED**    │\n└─────────────────────┘\n\n📝 **Task:** ${task.title}\n\n💡 *Use \`/viewtasks\` to see all your tasks*`,
            });
        } catch (error) {
            console.error('Error in /addtask:', error);
            if (!interaction.replied && !interaction.deferred) {
                try {
                    await interaction.reply({
                        content: '❌ An error occurred while adding your task. Please try again later.',
                    });
                } catch (err) {
                    console.error('Error sending fallback error reply:', err);
                }
            } else {
                try {
                    await interaction.editReply({
                        content: '❌ An error occurred while adding your task. Please try again later.',
                    });
                } catch (err) {
                    console.error('Error editing reply:', err);
                }
            }
        }
    }
};
