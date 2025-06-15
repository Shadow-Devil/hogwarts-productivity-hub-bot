---
mode: "agent"
tools: ["editFile","runInTerminal","fetch","pgsql"]
description: "Fix a bug"
---

1. Read the bug description and reproduction steps.
2. Outline diagnosis and fix plan.
3. Apply patch in code and tests.
4. Run `npm test && eslint . --max-warnings=0 && npm run build`.
5. Address failures or lint issues.
6. Commit using `fix:`.
7. Provide summary: fix applied, validation steps, and potential edge cases.
8. If applicable, update documentation or comments to reflect the fix.
9. Ensure the fix does not introduce new issues or regressions.
10. If the bug involves database changes, ensure the migration is handled correctly.
11. If the bug is related to a specific feature, ensure that feature's tests are updated or added.
