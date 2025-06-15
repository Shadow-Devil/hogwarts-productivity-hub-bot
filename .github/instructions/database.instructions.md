---
applyTo: '**/*.sql'
---

# Database Instructions

- Use VS Code Microsoft PostgreSQL extension to interact with the database.
- Agents may use `@pgsql` prefixed prompts in Copilot chat for editing or inspecting SQL.
- For schema introspection, rely on the extension's AI-powered features rather than MCP.
- Any migrations must be authored in SQL or via migration tools.
- Always execute migrations and test using `npm test` and verify with `pg_dump` backups manually, especially before deployment.
