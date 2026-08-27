# Hoooho Design System V2

Hoooho V2 is quiet, trustworthy and information-first. Its distinctive motif is a restrained three-point continuous health trace, used in the logo and selected brand moments rather than repeated as decoration. It uses hierarchy, spacing, borders and restrained surfaces before effects.

## Foundations

- Brand: Hoooho Green `27 122 110` (`#1B7A6E`), Deep Teal `18 92 85`, Soft Mint `233 246 242`, Warm Clinical `245 248 246`, Ink `24 49 47` and Muted `82 105 102`.
- Surfaces: page, primary, subtle and elevated roles; ordinary content uses borders instead of ubiquitous shadows.
- Text: primary, secondary and readable tertiary roles. Error, warning, success and information colors are semantic and never the only carrier of meaning.
- Font: platform-first Chinese stack covering SF Pro Display, PingFang SC, Microsoft YaHei and Noto Sans CJK, with stable system fallbacks and tabular numeric data. Product headings use 600, labels use 500 and body copy uses 400; avoid synthetic extra-bold display text.
- Type: display, page, section, card, body, label, caption and data roles.
- Spacing: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40.
- Radius: 6px small, 12px controls, 16px cards, 26px overlays. Pills are reserved for true status capsules, segmented controls and circular controls.
- Elevation: card, floating and overlay. Ordinary grouped lists remain flat.
- Motion: 140ms feedback, 200ms ordinary transitions, 280ms complex transitions using standard and emphasized easing. `prefers-reduced-motion` removes decorative movement.
- Layout: responsive gutters, 680px compact content and 1120px application maximum.

## Component contracts

- `HohoButton`: primary, secondary, tertiary, ghost, danger and text levels; small/medium/large/icon sizes; disabled and loading states.
- `HohoInput`: label, hint, invalid state, associated message and screen-reader alert.
- `HealthCard`: quiet bordered surface; interaction adds a restrained state, not a stronger default shadow.
- `HealthTag`: compact semantic label; visible wording accompanies color.
- `HohoSurfaceRow`: consistent minimum target, title, description, value and action placement.
- `StatusNotice`: information, success, warning and error messaging with icon, text and optional action.
- `EmptyState`: compact message and one clear recovery action.
- `ListSkeleton`: reusable non-blocking loading placeholder with reduced-motion support.
- `BottomSheetSurface` and the main drawer: scroll containment, Escape, focus trap, focus restoration and safe-area padding.
- Grouped navigation and settings lists: one flat continuous surface with row dividers; do not wrap every row in an independent card.
- Record subject identity: one shared compact member surface; detail pages must not nest it inside a second card.

## Interaction hierarchy

- One primary action per view. Primary buttons may use the restrained Hoooho Green gradient; ordinary surfaces do not use large gradients.
- Top bars use explicit text for consequential actions such as “保存”; icon-only controls require familiar semantics and an accessible name.
- Bottom sheets use one clear close affordance, a compact handle and a single segmented navigation pattern when switching modes.
- Picker selection rows are flat and direct. Avoid dashed upload-style boxes for ordinary selection actions.
- Empty, loading, error, disabled and incomplete states include readable text and never depend on color alone.

## Accessibility

- All interactive controls target at least 44px unless a compact secondary action remains embedded in a larger target.
- Global `:focus-visible` remains visible independently of color.
- Current navigation uses `aria-current` plus a background and position marker.
- Tabs use tab roles and `aria-selected`.
- Form errors use `aria-invalid`, `aria-describedby`, live regions and alert roles.
- Motion is reduced to near-instant feedback when the user requests reduced motion.

## Brand naming

Visible product copy and generated share images use `Hoooho`. Persistence keys and protocol identifiers keep their existing spelling because changing them would be a data or API migration rather than a visual change.
