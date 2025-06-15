---
applyTo: "**/*"
---

# Central Services Guidelines

- If functionality crosses multiple bot commands (e.g., timezone resets, stats fetch), centralize it:
  - **Query Service**: REST endpoints for stats, leaderboards, user data. Use PgBouncer for pooling.
  - **Timezone Scheduler**: Cron-run in UTC, mapping user timezones to daily reset jobs.
  - **Cache Layer**: Redis caching for leaderboard and frequent queries.
  - **Logging Service**: JSON logs shipped to central observability (ELK/Datadog), alert on failures.

## When creating or updating a feature:
1. Assess whether logic belongs in a service.
2. Scaffold/extend service in `/services`. Add interfaces in `@shared`.
3. Bot must call service; no duplicate DB logic.
4. Write tests: unit for service, integration for bot-service interaction.
5. Document API contracts in `/services/README.md`.

## Red flags to watch:
- Bot contains raw SQL repeated across commands.
- Local timezone cron logic.
- Multiple DB pools per shard.
- No cache invalidation strategy.
- Logs scattered without central ingestion.

Always follow: **"Centralise once, reuse everywhere—no copy–paste logic."**\

# Central Services Instructions
- **Centralize**: If functionality spans multiple commands, centralize it in a service.
- **Query Service**: Create REST endpoints for stats, leaderboards, and user data. Use PgBouncer for connection pooling.
- **Timezone Scheduler**: Implement a cron job in UTC that maps user timezones to daily reset jobs.
- **Cache Layer**: Use Redis for caching leaderboard and frequently accessed queries.
- **Logging Service**: Implement a JSON logging service that ships logs to a central observability platform (like ELK or Datadog) and sets up alerts for failures.
- **Feature Development**: When creating or updating a feature:
  1. Assess if the logic belongs in a service.
  2. Scaffold or extend the service in `/services` and add interfaces in `@shared`.
  3. Ensure the bot calls the service; avoid duplicate database logic.
  4. Write unit tests for the service and integration tests for bot-service interaction.
  5. Document API contracts in `/services/README.md`.
  
