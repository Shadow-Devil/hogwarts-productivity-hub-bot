---
applyTo: "**/*.js"
---
# 🛠️ Cron, PostgreSQL & Logging Practices

- Use `node-cron` to schedule timezone-aware jobs, running in UTC and converting per user. :contentReference[oaicite:19]{index=19}
- Use `pg` with prepared statements and connection pooling (PgBouncer) for all DB interactions.
- Use `winston` for structured logs, including timezone via custom timestamp formatter:
  ```js
  const logger = winston.createLogger({
    format: format.combine(
      format.timestamp({ format: () => new Date().toLocaleString('…', { timeZone: '…' }) }),
      format.json()
    ),
    transports: [new winston.transports.Console()]
  });
  ``` :contentReference[oaicite:20]{index=20}
