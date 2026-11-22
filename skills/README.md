# Skills (overlays / nakładki)

A skill is a Markdown file with a small header. Agents can wear any number of skills; their text is added to the agent's instructions on every run.

```markdown
---
name: Invoice chaser
description: Polite but firm payment reminders.
---
- Instructions, rules, examples…
```

Built-in skills live here. Your own go in `~/.alter/skills/` (a file with the same name overrides a built-in one).
