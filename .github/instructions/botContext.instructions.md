---
applyTo: '**'
---
Coding standards, domain knowledge, and preferences that AI should follow.
# Discord Productivity Bot

A modular, performance-oriented Discord bot focused on productivity using task management, Pomodoro timers, and a gamified points system. The bot will be released in **two phases**: a **Beta Version** (released next month) and **Version 1 (Winter Release)**. Designed to be extensible and resilient for future features.

---

## 🔧 Features (Beta)

### ✅ Task Management
- Add tasks to a personal to-do list.
- Remove tasks from the list.
- Mark tasks as complete.
  - Completing a task gives **2 points**.

### ⏲️ Pomodoro Timer
- Start a Pomodoro session with custom **study** and **break** durations.
- The timer loops between study and break until stopped.
- Bot sends DM/mentions to alert users when study/break phases begin/end.
- Only **one active timer per voice channel** at a time (shared experience).

### 🎯 Points System
- Earn **2 points/hour** spent in voice chat.
- Earn **2 points/task** completed.
- When a user leaves the voice chat:
  - Total session points are calculated.
  - User's house (e.g., Ravenclaw, Hufflepuff) is identified.
  - Points are added to the house's leaderboard total.

---

## 🧩 High-Level Design Goals

- Modular file structure for easy scalability.
- Database designed to support future features.
- Performance-oriented operations to handle large user bases.
- Code resilience and future-proofing.

---

## 📦 Version 1 Features (Planned)

### 👤 User Profile
- View weekly, monthly, and all-time points.
  - **Weekly**: Resets every Sunday.
  - **Monthly**: Resets monthly, total is added to all-time points.

### 🛡 Admin/Moderator Controls
- Ability to remove users from their houses.
- Deduct their contributions from the **house points** and update the leaderboard.
- Primarily affects the **monthly leaderboard**.

---

## 🧱 Database Design Considerations

- Bot is designed to operate in **one server only**.
- Primary database: **PostgreSQL**
- Collections/tables (example schema):
  - `users`: id, discord_id, house, total_points, weekly_points, monthly_points
  - `tasks`: id, user_id, title, is_complete, created_at
  - `vc_sessions`: user_id, joined_at, left_at, duration
  - `houses`: name, total_points
  - `timers`: voice_channel_id, study_duration, break_duration, state, last_ping

---

## 💻 Environment

- **OS**: Ubuntu 22
- **Runtime**: Node.js v22
- **Database**: PostgreSQL (accessed via `pg` package, GUI via pgAdmin 4 v9.3)
- **Editor**: VS Code with GitHub Copilot
- **Libraries**:
  - `discord.js`: for Discord bot integration
  - `pg`: for PostgreSQL client
  - `dotenv`: for managing secrets
  - `nodemon` (dev): for auto-reloading during development
  - `dayjs`: for date manipulation (timers, leaderboards)

---

## 🚀 Future Goals
- Include personal productivity stats dashboards.
- Auto-adjust Pomodoro behavior based on user activity.
- Introduce streak tracking, badges, and event-based boosts.
- Web-based leaderboard frontend.

---

## 🤖 Bot Status

| Phase      | Status         | Release Date |
|------------|----------------|--------------|
| Beta       | 🚧 In Progress | July 2025    |
| Version 1  | 🧊 Planned      | Winter 2025  |

---

## 📂 Project Structure (WIP)

src/
├── models/
│ └── db.js
├── services/
│ ├── taskService.js
│ └── timerService.js
├── commands/
│ ├── addtask.js
│ ├── removetask.js
│ ├── markcomplete.js
├── utils/
│ └── timeUtils.js
├── events/
│ └── voiceStateUpdate.js
├── index.js