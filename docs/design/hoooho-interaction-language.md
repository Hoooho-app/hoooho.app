# Hoooho interaction language

## Core behavior

Hoooho supports gradual, imperfect health narration. Interactions should let users start with partial information, understand what happened, recover without losing work, and add detail later. Feedback is calm, explicit, and consistent with the action label.

## Action hierarchy

- One primary action per view; secondary and tertiary actions remain visible without competing.
- Links navigate; buttons act. Icon-only controls require familiar semantics, an accessible name, and an effective 44 px target.
- Repeated activation cannot create duplicate mutations. Mutations show progress, disable safely, then resolve to success or a recoverable error.

## State language

Loading, empty, partial, disabled, success, error, timeout, retry, and offline states are distinct and do not rely on color alone. Errors explain what failed and the next available action. Empty states invite the next useful step. No surface remains loading indefinitely.

## Navigation and overlays

Back, forward, refresh, direct entry, redirects, and route changes preserve the expected user state. Dialogs, drawers, and sheets expose one clear close path, contain scroll correctly, trap and restore focus when modal, support Escape where applicable, and account for safe areas.

## Input and mobile

Labels, hints, validation, and errors stay associated with fields. Mobile keyboards do not obscure the active field or primary action. Long content, long values, upload, speech, media, slow networks, failed requests, and interrupted flows receive deliberate handling.

## Motion and media

Animation communicates continuity rather than decoration. Video and nurse-state transitions stay synchronized with application state, recover from loading failure, and never falsely show success. Reduced-motion users receive near-instant, comprehensible state changes.
