---
name: hoooho-interaction-audit
description: Audit and safely repair Hoooho web interaction quality across routes, asynchronous states, mobile behavior, accessibility, and browser flows. Use for repository-wide frontend interaction audits or systematic P0-P2 remediation; do not use for visual redesigns or isolated feature implementation.
---

# Hoooho Interaction Audit

Run a reproducible evidence-first audit. Preserve the product; repair interaction defects without turning the task into a redesign.

## Load the governing context

1. Read every applicable `AGENTS.md` and the relevant product, design-system, UI-freeze, API, schema, and test documentation. Read `docs/codex-guidelines.md` when present.
2. Read [references/hoooho-frozen-decisions.md](references/hoooho-frozen-decisions.md) before classifying any proposed change.
3. Read [references/interaction-standards.md](references/interaction-standards.md) before auditing behavior.
4. Read [references/audit-report-schema.md](references/audit-report-schema.md) before recording findings.
5. Inspect Git status, the current branch/worktree, package scripts, router definitions, test configuration, and the real deployment path. Preserve unrelated user changes.

If the request is audit-only, stop after the report and verification baseline. Modify code only when the request authorizes remediation. Existing repository delivery rules govern commit, push, integration, and deployment.

## Phase A: read-only inventory

Run `node .agents/skills/hoooho-interaction-audit/scripts/inventory-interactions.mjs .` to seed—not replace—the inventory. Review its output against the actual router and source tree.

Build a route/action matrix containing route, entry point, element, action, expected result, implementation file, authentication/data prerequisites, and runtime coverage. Include pages, links, cards, buttons, forms, dialogs, drawers, sheets, media controls, and global navigation.

Start the real application and operate it in a browser. Static inspection alone cannot mark an interaction as passing. Exercise normal, empty, loading, disabled, success, failure, retry, repeated activation, refresh, and back/forward behavior when applicable. Capture console errors, failed requests, unhandled promises, screenshots, and reproducible steps.

Keep the visible Codex preview in iPhone SE portrait mode at 100%. Use Playwright or an independent background browser context for 375 px, 390 px, 430 px, tablet, or desktop checks; never change the user's visible iPhone SE preview for those checks.

## Parallel read-only review

When subagents are available and the invocation requests parallel review, assign independent read-only lanes:

- routes, entry points, and unreachable states;
- asynchronous state, failure recovery, and repeated submission;
- mobile keyboard, safe areas, scrolling, touch targets, motion, and media;
- accessibility, focus, semantics, and conventional interaction behavior.

Give every lane the frozen decisions and report schema. Subagents return findings and evidence only; they do not edit shared source files. The primary agent deduplicates findings, resolves conflicts, owns all production edits, and may request an independent post-fix verification pass.

## Phase B: classify findings

Use the schema and classify observed behavior, not preferences:

- **P0:** unusable function, wrong data, security/safety issue, or blocked critical flow.
- **P1:** severe task friction or a clear violation of established interaction behavior.
- **P2:** low-risk consistency, feedback, accessibility, or usability defect.
- **P3:** subjective design choice, product decision, or uncertain intent.

Each finding needs direct evidence and an `auto_fix` decision. Do not infer that a code smell is a user-visible defect.

## Phase C: decide remediation

- Fix P0 and P1 only inside the frozen product boundary.
- Fix P2 only when the remedy is unambiguous, local or shared-root, backward-compatible, and low risk.
- Record P3 without changing code.
- If product intent, data semantics, or a frozen boundary is uncertain, record the decision needed and skip that edit.

Prefer a shared root cause or existing foundation component over copied page patches. Do not install a production dependency. Add a test-only dependency only after documenting why existing browser/test tooling is insufficient and obtaining any approval required by the active rules.

## Phase D: implement centrally

The primary agent makes small, reviewable changes. Allowed targets include event bindings; loading, disabled, success, and failure feedback; duplicate-submit protection; retry and recovery; modal/drawer closure; focus and keyboard behavior; scroll locks; touch targets; safe-area handling; motion/media continuity; interaction semantics; and reusable behavior in existing shared components.

Do not alter layout hierarchy, navigation, information architecture, approved copy, business flows, APIs, schemas, brand direction, or unrelated animation/media. Do not combine unrelated cleanup or redesign work.

## Phase E: verify and deliver

For every fixed finding, rerun its exact reproduction steps and attach evidence. Also verify applicable normal/failure/retry/repeated-action/refresh/back paths, console and network health, iPhone SE plus a wider mobile viewport, screenshots before and after, existing unit/integration tests, TypeScript, lint, production build, and `git diff --check`.

Use the repository's existing browser tooling. If Playwright is absent, evaluate an available browser-control tool or existing test runner first. Clearly mark any flow that could not be exercised; never convert static reasoning into a browser PASS.

Finish with the report schema, listing fixed and unfixed findings, evidence paths, decisions needed, tests, branch, commit, push/integration status, and deployment status required by `AGENTS.md`.
