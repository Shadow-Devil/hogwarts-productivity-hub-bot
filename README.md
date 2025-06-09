# Discord Productivity Bot

A modular, performance-oriented Discord bot designed to boost productivity through task management, Pomodoro timers, and a gamified house points system. Transform your Discord server into a productivity hub with comprehensive tracking and engaging competition features.

## 🌟 Features

### ✅ Task Management
- **Personal To-Do Lists**: Add, view, complete, and remove tasks
- **Points Reward**: Earn 2 points for each completed task
- **Persistent Storage**: All tasks saved to PostgreSQL database
- **User-Specific**: Each user maintains their own task list

### ⏲️ Pomodoro Timer System
- **Customizable Sessions**: Set custom study and break durations
- **Shared Experience**: One timer per voice channel for group productivity
- **Smart Notifications**: DM alerts for session start/end
- **Automatic Cycling**: Seamlessly loops between study and break periods

### 🏆 House Points & Competition
- **Voice Chat Rewards**: Earn 2 points per hour in voice channels
- **House System**: Users assigned to houses (Ravenclaw, Hufflepuff, etc.)
- **Live Leaderboards**: Real-time house standings and user statistics
- **Performance Tracking**: Detailed stats and time tracking

### 📊 Analytics & Monitoring
- **Performance Metrics**: Built-in performance monitoring and optimization
- **Debug Tools**: Comprehensive debugging and system information
- **Usage Statistics**: Track bot usage and user engagement
- **Monthly Resets**: Automatic point resets with historical preservation

---

## 🚀 Installation

### Prerequisites

- **Node.js**: v18.0.0 or higher
- **PostgreSQL**: v12.0 or higher
- **Discord Application**: Bot token and application ID
- **Git**: For cloning the repository

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/discord-productivity-bot.git
cd discord-productivity-bot
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Database Setup

#### Install PostgreSQL (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

#### Create Database and User
```bash
sudo -u postgres psql

-- In PostgreSQL shell:
CREATE DATABASE botd_production;
CREATE USER botd_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE botd_production TO botd_user;
\q
```

#### Initialize Database Schema
The bot will automatically create required tables on first run, including:
- `users` - User profiles and points
- `tasks` - Personal task lists
- `vc_sessions` - Voice chat tracking
- `houses` - House points and leaderboards
- `timers` - Active Pomodoro sessions

### 4. Discord Bot Setup

#### Create Discord Application
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and name your bot
3. Navigate to "Bot" section
4. Click "Add Bot" and copy the token
5. Enable required intents:
   - **Presence Intent**
   - **Server Members Intent**
   - **Message Content Intent**

#### Invite Bot to Server
1. Go to "OAuth2 > URL Generator"
2. Select scopes: `bot` and `applications.commands`
3. Select permissions:
   - Send Messages
   - Use Slash Commands
   - Connect to Voice Channels
   - View Channels
   - Read Message History
4. Copy generated URL and invite bot to your server

### 5. Environment Configuration

Create a `.env` file in the project root:

```env
# Discord Configuration
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_application_id_here
GUILD_ID=your_server_id_here

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=botd_production
DB_USER=botd_user
DB_PASSWORD=your_secure_password

# Optional: Performance Monitoring
ENABLE_PERFORMANCE_MONITORING=true
LOG_LEVEL=info
```

### 6. Register Slash Commands

```bash
npm run register
```

### 7. Start the Bot

#### Production Mode
```bash
npm start
```

#### Development Mode (with auto-reload)
```bash
npm run dev
```

---

## 📖 Usage Guide

### Task Management Commands

#### `/addtask <description>`
Add a new task to your personal to-do list.
```
/addtask Complete project documentation
```

#### `/viewtasks`
Display all your current tasks with their IDs and status.

#### `/completetask <task_id>`
Mark a task as complete and earn 2 points.
```
/completetask 5
```

#### `/removetask <task_id>`
Remove a task from your list (no points awarded).
```
/removetask 3
```

### Timer Commands

#### `/timer <study_minutes> [break_minutes]`
Start a Pomodoro timer in the current voice channel.
```
/timer 25 5          # 25min study, 5min break
/timer 45            # 45min study, default 5min break
```

#### `/stoptimer`
Stop the active timer in your voice channel.

#### `/time`
Check remaining time in current Pomodoro session.

### Points & Statistics

#### `/stats`
View your personal statistics:
- Total points earned
- Tasks completed
- Voice chat time
- Current house ranking

#### `/housepoints`
Display current house standings and total points.

#### `/leaderboard`
Show top users by points in your house.

### Administrative Commands

#### `/performance`
View bot performance metrics (admin only):
- Memory usage
- Database query times
- Active connections
- System health

#### `/debug`
Display detailed system information for troubleshooting.

---

## 🏗️ Project Structure

```
discord-productivity-bot/
├── src/
│   ├── commands/           # Slash command implementations
│   │   ├── addtask.js
│   │   ├── completetask.js
│   │   ├── viewtasks.js
│   │   ├── removetask.js
│   │   ├── timer.js
│   │   ├── stoptimer.js
│   │   ├── time.js
│   │   ├── stats.js
│   │   ├── housepoints.js
│   │   ├── leaderboard.js
│   │   ├── performance.js
│   │   └── debug.js
│   ├── events/             # Discord event handlers
│   │   └── voiceStateUpdate.js
│   ├── models/             # Database models
│   │   └── db.js
│   ├── services/           # Business logic
│   │   ├── taskService.js
│   │   └── voiceService.js
│   ├── utils/              # Utility functions
│   │   ├── databaseOptimizer.js
│   │   ├── monthlyReset.js
│   │   ├── performanceBenchmark.js
│   │   ├── performanceMonitor.js
│   │   └── voiceUtils.js
│   ├── index.js            # Main bot entry point
│   └── register-commands.js # Command registration
├── docs/                   # Documentation
├── package.json
├── .env.example
└── README.md
```

---

## 🔧 Configuration

### House System Setup

The bot automatically assigns users to houses. To customize houses, modify the database:

```sql
-- Example house setup
INSERT INTO houses (name, total_points) VALUES 
('Gryffindor', 0),
('Hufflepuff', 0),
('Ravenclaw', 0),
('Slytherin', 0);
```

### Performance Optimization

For large servers (500+ users), consider:

1. **Database Indexing**: The bot includes automatic index creation
2. **Connection Pooling**: Configured automatically via `pg` pool
3. **Query Optimization**: Built-in query optimization utilities
4. **Monitoring**: Enable performance monitoring in `.env`

### Automatic Maintenance

The bot includes automatic maintenance features:
- **Monthly Resets**: Points reset monthly with history preservation
- **Database Optimization**: Regular cleanup of old sessions
- **Performance Monitoring**: Real-time performance tracking

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

### Development Setup

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Install dependencies: `npm install`
4. Set up development environment with `.env`
5. Make your changes and test thoroughly
6. Submit a pull request

### Code Standards

- Use ESLint configuration provided
- Follow existing code style and patterns
- Add appropriate error handling
- Include JSDoc comments for new functions
- Write tests for new features

---

## 📋 Roadmap

### Current Version (Beta)
- ✅ Core task management
- ✅ Pomodoro timer system
- ✅ House points and leaderboards
- ✅ Voice chat tracking
- ✅ Performance monitoring

### Version 1.0 (Winter 2025)
- 🔄 User profiles with detailed statistics
- 🔄 Advanced admin controls
- 🔄 Streak tracking and badges
- 🔄 Web-based dashboard
- 🔄 Advanced analytics

### Future Enhancements
- Mobile companion app
- Integration with productivity tools
- Custom achievement system
- Advanced reporting features

---

## 🐛 Troubleshooting

### Common Issues

#### Bot Not Responding
1. Check bot token in `.env`
2. Verify bot has required permissions
3. Ensure slash commands are registered
4. Check console for error messages

#### Database Connection Errors
1. Verify PostgreSQL is running: `sudo systemctl status postgresql`
2. Check database credentials in `.env`
3. Ensure database and user exist
4. Test connection: `psql -h localhost -U botd_user -d botd_production`

#### Permission Errors
1. Verify bot has necessary Discord permissions
2. Check role hierarchy in Discord server
3. Ensure bot role is above users it needs to manage

### Getting Help

- Check the [Issues](https://github.com/yourusername/discord-productivity-bot/issues) page
- Join our [Discord Support Server](https://discord.gg/your-support-server)
- Read the [Documentation](docs/)

---

## 📄 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [discord.js](https://discord.js.org/) - Discord API wrapper
- [PostgreSQL](https://www.postgresql.org/) - Database system
- [Day.js](https://day.js.org/) - Date manipulation library
- Contributors and beta testers

---

## 📊 Status

| Component | Status | Version |
|-----------|--------|---------|
| Core Bot | ✅ Stable | 1.0.0 |
| Database | ✅ Stable | PostgreSQL 12+ |
| Commands | ✅ Complete | 12 commands |
| Documentation | ✅ Complete | Latest |

**Last Updated**: June 2025