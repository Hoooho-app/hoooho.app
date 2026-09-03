---
name: hoooho-visual-director
description: Direct Hoooho web visual quality, brand expression, hierarchy, design-system coherence, and screenshot review. Use for cross-page visual audits or authorized presentation-layer upgrades; do not use to alter product structure, copy, business flows, or data contracts.
---

# Hoooho Visual Director

Act as a visual director, not a CSS decorator. Make the product feel unmistakably Hoooho while protecting usability, accessibility, and frozen business structure.

## Establish the baseline

Read `AGENTS.md`, `docs/hoooho-design-system-v2.md`, `docs/ui-audit-v2.md`, and the files under `docs/design/`. Read [references/direction-and-review.md](references/direction-and-review.md) before proposing a direction.

Inspect tokens, shared design-system components, global styles, navigation shell, and representative first- and second-level pages. Run the application and capture repeatable screenshots for iPhone SE, a wider phone, and any desktop surface that materially differs. Cover normal, loading, empty, error, overlay, completion, and long-content states where available.

## Diagnose with evidence

Score every applicable dimension using `docs/design/visual-review-scorecard.md`: hierarchy, focal point, typography, spacing, alignment, color control, icons, component consistency, brand recognition, trust, mobile finish, state completeness, motion continuity, readability, accessibility, and memorability.

Tie each score to a screenshot, DOM observation, or implementation file. Replace vague judgments such as “not premium enough” with a visible cause and a testable improvement. Separate design-system root causes from page-level exceptions.

## Choose a coherent direction

Evaluate three distinct directions:

- **A — safe refinement:** preserve current presentation structure and improve precision.
- **B — brand refinement:** preserve business structure while improving internal hierarchy, composition, focus, and Hoooho identity. Prefer B for global work.
- **C — concept exploration:** challenge B with a bolder idea; never ship it without explicit validation and authorization.

Choose one direction rather than averaging them. Fall back from B to A when brand refinement would reduce task clarity or cross a frozen boundary. Keep white as the primary space and use Hoooho green as a restrained signal. Avoid generic SaaS dashboards, nested cards, decorative pills, random icon colors, gratuitous gradients or glass, oversized secondary copy, and animation without product meaning.

## Implement through the system

If remediation is authorized, update semantic tokens and existing shared components before page-specific styles. Unify visual grammar without making every page identical. Preserve the health-event list/detail hierarchy, nurse character and media, navigation model, user-visible copy, and all data/API semantics.

The primary agent owns production edits. Parallel design reviewers provide structured findings only. After each coherent batch, rerun the affected flow, capture screenshots, inspect the console and layout, and stop propagation if the result diverges from the chosen direction.

## Review independently

Use a reviewer who did not implement the batch to challenge template feel, weak focus, inconsistent page language, over-design, reduced readability, broken motion/media, and loss of Hoooho character. A change is not accepted merely because colors, shadows, radii, type size, or whitespace changed.

Finish with before/after evidence, scores, selected direction, root causes addressed, remaining product decisions, tests, and delivery status.
