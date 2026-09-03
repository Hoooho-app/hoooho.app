# Hoooho frozen product decisions

These boundaries apply to interaction audits and remediation unless the user explicitly changes them for the current task.

## Frozen

- First-level page structure, navigation, information architecture, and established business flow.
- Approved product copy, page/module names, and the name “健康随记”.
- Backend APIs, schemas, data semantics, and persisted-data contracts.
- Approved brand direction: calm, concise, professional, warm, and appropriate for a health product.
- Nurse characters, original video/media assets, and animations unrelated to a demonstrated defect.
- Any page, module, component, token, or decision explicitly frozen by product management, documentation, tests, API contracts, schemas, or design-system sources of truth.

## Not authorized by an interaction audit

- Adding or removing first-level capabilities.
- Merging, splitting, or renaming business modules.
- Rewriting copy or changing user journeys.
- Redesigning a page, changing visual hierarchy for taste, or replacing the design system.
- Changing API/data contracts or installing a production dependency.

## Authorized remediation categories

- Non-responsive controls and incorrect event binding.
- Missing loading, success, failure, disabled, retry, or duplicate-submission handling.
- Broken close, cancel, back, focus, keyboard, scroll-lock, and navigation behavior.
- Mobile keyboard, safe-area, obstruction, viewport, and touch-target defects.
- Demonstrated animation/media discontinuity, flicker, or layout shift.
- Clear cross-page interaction inconsistencies and necessary accessibility semantics.

When a potential fix crosses both lists, the frozen boundary wins. Record the finding and request the smallest product decision needed.
