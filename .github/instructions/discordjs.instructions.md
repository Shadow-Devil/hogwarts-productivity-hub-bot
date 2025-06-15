---
applyTo: "src/**/*.js"
---
# discord.js v14 – Latest‑feature Playbook

## Use the v14 API Surface
- Import from **`discord.js` 14.19.3** only; avoid legacy `require('@discordjs/...')` shims.:contentReference[oaicite:0]{index=0}
- Prefer **ESM `import { Client, GatewayIntentBits } from 'discord.js'`**; no CommonJS wrappers.

## Slash Commands & Interactions
- Register slash commands with `SlashCommandBuilder`; always `await interaction.reply()` or `deferReply()` within **3 s** to satisfy Discord UX rules.:contentReference[oaicite:1]{index=1}
- Validate user options with built‑in **autocomplete / choice limits** instead of post‑hoc string parsing.:contentReference[oaicite:2]{index=2}

## Gateway Intents & Partials
- Enable only the intents you need via `new Client({ intents: [ … ] })`; reduces traffic & rate‑limit risk.:contentReference[oaicite:3]{index=3}
- Declare partials (e.g., `Message`, `Reaction`) when you truly need them; otherwise leave blank.

## Components V2 & Soundboard
- Use **Components V2** for advanced buttons & selects; flag messages with `flags: 1 << 15`.:contentReference[oaicite:4]{index=4}
- Leverage the new **Soundboard API** classes (e.g., `GuildSoundboardSoundManager`) instead of custom opus logic.:contentReference[oaicite:5]{index=5}

## Caching & Memory
- Customise sweeper settings (`client.options.sweepers`) and lifetime values to avoid unbounded caches.:contentReference[oaicite:6]{index=6}
- Batch heavy DB writes; consider Redis for hot data (leaderboards).

## Rate‑Limit Safety
- Rely on discord.js’s built‑in queue; listen for the `client.on('rateLimit', handler)` event and back‑off rather than spinning custom `setTimeout` loops.:contentReference[oaicite:7]{index=7}
- For global 50 req/s limits, shard or schedule calls when bursty actions (e.g., mass DM, bulk role updates).:contentReference[oaicite:8]{index=8}

## Modern Utilities to Prefer
| Need | Built‑in Utility |
|------|-----------------|
| Validation / Formatting | `@discordjs/builders` schema & `quote` utilities |
| REST calls | `REST` client from `@discordjs/rest` (handles retries) |
| Fetching audit logs, soundboards | New managers added in 14.19.0+ :contentReference[oaicite:9]{index=9} |

Avoid re‑writing helpers that already exist in these packages.

## Error Handling & Logging
- Distinguish **user‑facing** versus **system** errors; reply with friendly embeds, log stack traces via central logger.
- Use `DiscordAPIError` codes to branch logic instead of string matching.

## Tests & CI
- Mock Discord.js in Jest with **`vi.mock('discord.js', …)`** or **`@discordjs/testing`** helpers.
- Validate slash registration in tests by asserting JSON command data matches expected output.

(Updated 2025‑06‑14)
