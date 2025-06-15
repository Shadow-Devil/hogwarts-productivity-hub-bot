---
applyTo: "**/*.js"
---
# Dependency Usage Guidelines

- Always inspect `package.json`. Prefer installed packages for functionality.
- Avoid writing custom utilities for features covered by popular libs (e.g., `node-cache`, `axios`, `date-fns`, `dotenv`).
- If you add a new dependency, ensure:
  - It’s well-maintained and trusted.
  - It has at least 1k weekly downloads or a solid GitHub repo.
  - You write a test demonstrating its use.
- In your summary, note usage and why custom code was avoided.
