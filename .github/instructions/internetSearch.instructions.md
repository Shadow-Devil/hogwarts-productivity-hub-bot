---
applyTo: "**/*"
---
# 🌐 Always‑Online Documentation Rule

## When starting any task
1. **Identify package & version** from `package.json`.
2. **Fetch the latest official docs** before coding:
   - Use `#fetch <url>` or the *Fetch* tool in Agent Mode. :contentReference[oaicite:0]{index=0}
   - If a specific API page is unknown, run a `search_query` first. :contentReference[oaicite:1]{index=1}
3. **Summarise key APIs** in the plan section so reviewers see which docs were consulted.
4. **Import & use package functions directly**; never re‑implement a feature that an installed dependency already provides.

## Package‑specific URLs to fetch

| Package | Latest stable docs URL |
|---------|------------------------|
| **discord.js 14.19.3** | https://discord.js.org/docs/packages/discord.js/14.19.3 :contentReference[oaicite:2]{index=2} |
| **node-cron 3.x** | https://www.npmjs.com/package/node-cron :contentReference[oaicite:3]{index=3} |
| **pg 8.x** | https://node-postgres.com/ :contentReference[oaicite:4]{index=4} |
| **dotenv 16.x** | https://www.npmjs.com/package/dotenv :contentReference[oaicite:5]{index=5} |
| **moment‑timezone 0.5.x** | https://momentjs.com/timezone/docs/ :contentReference[oaicite:6]{index=6} |
| **winston 3.x** | https://github.com/winstonjs/winston :contentReference[oaicite:7]{index=7} |

*(If version changes, adjust URL to match the new tag.)*

## Coding rules after fetching
- **Use the fetched API**—e.g., `cron.schedule()` from *node‑cron*, `pg.Pool`
  for pooled queries, `moment.tz()` for per‑user offsets—rather than custom
  wrappers.
- **Cite the URL** in code comments where an unfamiliar API is used.
- **Add a Jest test** demonstrating the fetched API call succeeds.

## Red‑flags
- Writing homemade schedulers instead of `node-cron`.
- Manually parsing `.env` when `dotenv` is available.
- Custom datetime math instead of `moment‑timezone`.
- Re‑implementing logging instead of using `winston`.
Flag these in summaries with a suggestion to replace them.

*(Updated 2025‑06‑14)*
