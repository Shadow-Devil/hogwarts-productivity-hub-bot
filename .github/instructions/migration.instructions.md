---
mode: "agent"
tools: ["editFile","runInTerminal","fetch","pgsql"]
description: "Apply a database migration"
---

1. Inspect current schema using @pgsql for schema exploration.
2. Outline schema migration plan.
3. Write migration SQL or script files.
4. Run `pg_dump` for backup and save versioned dump.
5. Apply migration in your local dev environment.
6. Run tests and lint with `npm test && eslint . --max-warnings=0 && npm run build`.
7. Commit with a Conventional Commit: `feat: db migration – <summary>`.
8. Summarize changes, backup location, test results, and caution notes before deployment.
9. If applicable, update documentation or comments to reflect the migration.
10. Ensure the migration does not introduce new issues or regressions.
11. If the migration involves complex changes, consider writing additional tests to validate the new schema.
12. If the migration is related to a specific feature, ensure that feature's tests are updated or added.
13. If the migration requires data transformation, ensure that the transformation logic is well-tested and documented.
14. If the migration involves changes to indexes or constraints, ensure that these changes are optimized for performance.
15. If the migration is part of a larger feature, ensure that the feature's implementation is consistent with the new schema.
