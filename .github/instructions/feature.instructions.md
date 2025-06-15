---
mode: "agent"
tools: ["editFile","runInTerminal","fetch","mcp-postgres"]
description: "Implement a new feature"
---

1. Read database schema (if needed).
2. Outline the implementation plan.
3. Apply code changes and tests in relevant files.
4. Run `npm test && eslint . --max-warnings=0 && npm run build`.
5. Fix any errors or lint issues.
6. Commit changes using Conventional Commit.
7. Provide a summary: features added, checks passed, next actions, and caution notes.
