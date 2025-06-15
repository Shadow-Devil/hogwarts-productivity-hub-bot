# Contributing to Discord Productivity Bot

We love your input! We want to make contributing to this project as easy and transparent as possible, whether it's:

- Reporting a bug
- Discussing the current state of the code
- Submitting a fix
- Proposing new features
- Becoming a maintainer

## Development Process

We use GitHub to host code, to track issues and feature requests, as well as accept pull requests.

### Pull Requests

1. Fork the repo and create your branch from `main`.
2. If you've added code that should be tested, add tests.
3. If you've changed APIs, update the documentation.
4. Ensure the test suite passes.
5. Make sure your code lints.
6. Issue that pull request!

## Development Setup

### Prerequisites
- Node.js v22+
- PostgreSQL v17.5+
- Discord Developer Account

### Local Development
```bash
# Clone your fork
git clone https://github.com/yourusername/discord-productivity-bot.git
cd discord-productivity-bot

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
# Set up your test Discord server and bot

# Register commands
npm run register

# Run tests and linting
npm run validate

# Start development server
npm run dev
```

## Code Style

### General Guidelines
- Use meaningful variable and function names
- Comment complex logic
- Follow existing code patterns
- Keep functions small and focused
- Handle errors appropriately

### JavaScript Style
- Use `const` for constants, `let` for variables
- Use template literals for string interpolation
- Use async/await instead of Promises where possible
- Use arrow functions for short callbacks

### File Organization
- Commands go in `src/commands/`
- Services contain business logic in `src/services/`
- Utilities go in `src/utils/`
- Database models in `src/models/`
- Event handlers in `src/events/`

## Adding New Commands

### Command Structure
```javascript
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('commandname')
        .setDescription('Description of what the command does'),
    async execute(interaction) {
        // Command logic here
        await interaction.reply('Response');
    },
};
```

### Best Practices
- Always use `interaction.reply()` or `interaction.followUp()`
- Handle errors gracefully with try/catch
- Validate user input
- Use appropriate response types (ephemeral for private responses)
- Include helpful error messages

## Database Guidelines

### Schema Changes
- Always use migrations for schema changes
- Test migrations thoroughly
- Document schema changes in commit messages

### Query Optimization
- Use prepared statements
- Add appropriate indexes
- Avoid N+1 queries
- Use transactions for multiple related operations

## Testing

### Manual Testing
- Test all command variations
- Test error conditions
- Test with different user permissions
- Test concurrent usage scenarios

### Areas to Test
- Command functionality
- Database operations
- Voice state tracking
- Timer functionality
- Points calculation

## Bug Reports

We use GitHub issues to track public bugs. Report a bug by [opening a new issue](https://github.com/yourusername/discord-productivity-bot/issues).

### Great Bug Reports Include:
- A quick summary and/or background
- Steps to reproduce
  - Be specific!
  - Give sample code if you can
- What you expected would happen
- What actually happens
- Notes (possibly including why you think this might be happening, or stuff you tried that didn't work)

## Feature Requests

We welcome feature requests! Please:
- Check if the feature already exists
- Describe your use case
- Explain why this feature would be useful
- Consider if this fits the project's scope

## Code Quality Standards

### Before Submitting
Always run the validation suite before creating a pull request:
```bash
npm run validate  # Runs linting and tests
```

### Code Style
- **Linting**: We use ESLint with 4-space indentation
- **Testing**: Jest for unit and integration tests
- **Coverage**: Aim for 90%+ test coverage on new code
- **Documentation**: JSDoc comments for all exported functions

### Development Scripts
```bash
npm run dev          # Development with nodemon
npm run test         # Run Jest tests
npm run test:watch   # Tests in watch mode
npm run test:coverage # Coverage report
npm run lint         # Check code style
npm run lint:fix     # Auto-fix linting issues
npm run validate     # Full validation (lint + test)
```

### Architecture Guidelines
- **Services**: Centralize cross-command logic in `/services`
- **Commands**: Keep command files focused on interaction handling
- **Utils**: Pure functions for reusable operations
- **Error Handling**: Distinguish user vs system errors
- **Logging**: Use structured logging with winston
- **Database**: Always use prepared statements and transactions

## Code of Conduct

### Our Pledge
We pledge to make participation in our project a harassment-free experience for everyone.

### Our Standards
- Using welcoming and inclusive language
- Being respectful of differing viewpoints
- Gracefully accepting constructive criticism
- Focusing on what is best for the community

### Enforcement
Instances of abusive, harassing, or otherwise unacceptable behavior may be reported by contacting the project team.

## License

By contributing, you agree that your contributions will be licensed under the same ISC License that covers the project.

## Questions?

Feel free to open an issue with the `question` label or join our Discord support server.

## Recognition

Contributors will be recognized in the README and release notes. Thank you for making this project better! 🎉
