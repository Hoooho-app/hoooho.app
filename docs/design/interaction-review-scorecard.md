# Interaction review scorecard

Use `PASS`, `FAIL`, `BLOCKED`, or `NOT_RUN` for every applicable state. A PASS requires an observed action, expected result, environment, and evidence reference.

| Area | Required checks |
| --- | --- |
| Entry and navigation | Direct entry, visible controls, back/forward, refresh, redirects, unknown routes. |
| Forms | Input, validation, submit, cancellation, long values, keyboard, focus, recovery. |
| Async state | Slow request, loading, success, failure, timeout, retry, stale response, abort. |
| Mutation safety | Repeated click, disabled recovery, idempotency, success/error truthfulness. |
| Overlays | Open once, close/cancel/Escape/back, focus trap/restore, scroll lock, safe area. |
| Mobile | iPhone SE plus wider phone, 44 px targets, keyboard obstruction, overflow, edge controls. |
| Content states | Empty, partial, long content, missing media, malformed or absent optional data. |
| Motion and media | Transition continuity, autoplay/load failure, interruption, reduced motion, layout stability. |
| Accessibility | Native semantics, names, tab order, visible focus, live status, error association. |
| Runtime health | Console errors, React warnings, unhandled promises, request loops, asset failures. |

Classify confirmed findings as P0-P3 using the interaction-audit Skill. Static suspicions remain `needs_verification` until reproduced.
