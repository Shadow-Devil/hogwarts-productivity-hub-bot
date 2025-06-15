---
applyTo: 'src/bot/**'
---

# Discord Bot Instructions

- Use discord.js v14 idiomatic patterns (slash commands, async error handling).
- Rate-limit: respect Discord rate limits; use built-in utilities.
- Validate and sanitize all user input before processing.
- Log key events and errors, avoid `console.log`.
- Include unit tests for any command handlers (mocking Discord.js).
