# Hoooho Design System V2

Hoooho V2 is quiet, trustworthy and information-first. It uses hierarchy, spacing, borders and restrained surfaces before decoration.

## Foundations

- Brand: teal `22 112 104`, with separate hover, active, subtle and border roles.
- Surfaces: page, primary, subtle and elevated roles; ordinary content uses borders instead of ubiquitous shadows.
- Text: primary, secondary and readable tertiary roles. Error, warning, success and information colors are semantic and never the only carrier of meaning.
- Font: platform-first Chinese stack covering PingFang SC, Microsoft YaHei and Noto Sans CJK, with stable system fallbacks and tabular numeric data.
- Type: display, page, section, card, body, label, caption and data roles.
- Spacing: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40.
- Radius: 6px small, 10px controls, 16px cards, 22px overlays. Pills are reserved for true status capsules and circular controls.
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

## Accessibility

- All interactive controls target at least 44px unless a compact secondary action remains embedded in a larger target.
- Global `:focus-visible` remains visible independently of color.
- Current navigation uses `aria-current` plus a background and position marker.
- Tabs use tab roles and `aria-selected`.
- Form errors use `aria-invalid`, `aria-describedby`, live regions and alert roles.
- Motion is reduced to near-instant feedback when the user requests reduced motion.

## Brand naming

Visible product copy and generated share images use `Hoooho`. Persistence keys and protocol identifiers keep their existing spelling because changing them would be a data or API migration rather than a visual change.
