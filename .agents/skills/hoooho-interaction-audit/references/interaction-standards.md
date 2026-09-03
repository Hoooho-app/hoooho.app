# Interaction standards

Use this checklist to decide what to exercise and what evidence to collect. It is a defect standard, not permission to restyle the product.

## Entry points and navigation

- Every visible control has an operable target and an observable result.
- Links use link semantics; actions use button semantics. Disabled controls cannot activate.
- Browser back/forward and in-product back controls preserve the expected route and state.
- Refresh, direct URL entry, authentication redirects, and unknown routes recover predictably.
- Cards or icons that appear actionable expose an accessible name and a consistent activation area.

## Forms and asynchronous work

- Labels, constraints, validation timing, and error recovery are understandable without relying on color alone.
- Submission exposes progress, blocks accidental duplicates, and reaches a clear success or recoverable error state.
- Slow, aborted, failed, retried, and out-of-order requests do not leave stale or contradictory UI.
- Empty, loading, error, partial-data, and success states are distinguishable and do not cause destructive surprises.
- Destructive or irreversible actions use the repository's established confirmation and recovery pattern.

## Overlays, focus, keyboard, and scroll

- Dialogs, drawers, sheets, menus, and popovers open once, close by their documented paths, and restore focus.
- Escape, outside click, explicit close, cancel, route change, and browser back are checked when applicable.
- Focus stays within modal content where required and is visible during keyboard operation.
- Background scroll is locked only while necessary and restored after every close path.
- Mobile keyboards do not hide the active field or primary action; validation does not unexpectedly move focus.

## Mobile and embedded browsers

- Verify iPhone SE portrait in the visible preview; test at least one wider mobile viewport independently.
- Check safe-area insets, fixed headers/footers, viewport-height behavior, orientation assumptions, overscroll, and keyboard resizing.
- Primary targets should normally provide an effective 44 by 44 CSS pixel touch area unless an established component standard safely provides an equivalent target.
- Check rapid taps, double taps, press feedback, scroll-vs-tap ambiguity, and controls near screen edges.
- For WeChat or other embedded-browser-sensitive flows, inspect capability detection, media/autoplay rules, file/camera inputs, history behavior, and documented fallbacks. Mark untested host-specific behavior explicitly.

## Motion, media, and layout stability

- State transitions do not flash stale content, replay unexpectedly, or shift nearby controls enough to cause mis-taps.
- Loading placeholders reserve suitable space for important content.
- Video/audio controls remain synchronized with actual playback, handle interruption, and recover from load failure.
- Respect reduced-motion preferences for non-essential motion; do not remove approved media or harmless animation.

## Accessibility

- Interactive elements have correct native semantics or complete keyboard-equivalent behavior.
- Icon-only controls have accessible names. Dynamic status and errors are announced when needed.
- Logical tab order, visible focus, programmatic labels, dialog naming, and error association are present.
- Do not infer accessibility from markup alone: keyboard-operate the critical flow and inspect the accessibility representation when tooling permits.

## Evidence threshold

A PASS requires the observed action, expected result, environment, and evidence location. A finding requires deterministic reproduction or strong captured evidence. A suspected issue without runtime confirmation remains `needs_verification`, not P0-P2.
