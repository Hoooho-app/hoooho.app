# Hoooho UI freeze

The current product UI is frozen at baseline commit `c5f1b91` (2026-08-09).

- Do not proactively change existing page structure, layout, colors, typography, spacing, card styling, or interaction patterns.
- A UI change is allowed only when the user explicitly names the page or component to modify.
- Backend, data, and AI work must reuse the existing UI and remain behind service/adaptor boundaries.
- When a requested feature needs new UI, make the smallest change within the explicitly named surface and leave every other frozen screen untouched.

See `docs/ui-freeze-v1.md` for the frozen scope and review checklist.
