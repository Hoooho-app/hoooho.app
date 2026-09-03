---
name: hoooho-design-quality
description: Orchestrate end-to-end Hoooho interaction and visual quality governance, from parallel evidence gathering through safe remediation, browser verification, independent review, and release. Use for global or multi-page design-quality cycles, not isolated cosmetic edits.
---

# Hoooho Design Quality

Coordinate `$hoooho-interaction-audit` and `$hoooho-visual-director` as the primary entry point for a full Hoooho design-quality cycle. Read [references/orchestration-contract.md](references/orchestration-contract.md) before execution.

## Phase 0: protect the repository

Confirm the canonical repository, branch, commit, worktree, existing changes, applicable rules, startup/test commands, browser tooling, and deployment path. Use an isolated branch/worktree when necessary. Do not overwrite user work, change the stack, or install a production dependency.

## Phase 1: read-only evidence

Run the interaction inventory and start the actual application. Keep the visible preview at iPhone SE portrait and use independent contexts for wider mobile and desktop checks.

When subagents are available and parallel review is requested, assign independent read-only lanes for routes/interactions, async/error recovery, mobile/accessibility/motion, visual hierarchy, brand expression, and design-system integrity. Subagents do not edit production files.

Capture route/action coverage, key states, console/network evidence, and a stable screenshot baseline before any source edit.

## Phase 2: one problem baseline

Deduplicate findings into interaction P0-P3, design-system root causes, page-level visual issues, product decisions, allowed automatic fixes, and forbidden changes. Connect repeated symptoms to shared roots instead of producing a flat cosmetic backlog.

## Phase 3: one visual direction

Have the visual-director lane compare A, B, and C and select one. Prefer B—brand refinement—unless it threatens task clarity or a frozen boundary. State why the current UI feels ordinary, which causes belong to tokens/components/hierarchy/brand, which pages are useful baselines, and how business structure stays unchanged.

## Phase 4: implement in coherent batches

The primary agent alone modifies source. Work from shared roots outward: tokens, interaction foundations, visual components, shell/navigation, high-frequency pages, important secondary pages, overlays/states, long-tail pages, motion/media, then responsive details.

After every batch, start or refresh the application, compare screenshots, exercise affected interactions, inspect console/network behavior, and run relevant tests. Correct a weak direction before propagating it. Fix P0/P1 and unambiguous low-risk P2 within the frozen boundary; record P3.

## Phase 5: independent rejection gate

Use reviewers who did not implement the code to assess the final screenshots and critical flows. Visual review may reject template feel, weak focus, inconsistent language, over-design, reduced readability, or damaged brand assets. Interaction review may reject broken controls, incomplete async states, duplicate submission, bad focus/scroll/history, mobile obstruction, media discontinuity, or regressions.

Iterate until the applicable acceptance gates pass or a real blocker is documented. Run the full repository test/build/diff checks and the release workflow required by `AGENTS.md`.

Deliver the report defined in `docs/design/audit-report-schema.md`, including Skill validation, design foundations, route and interaction counts, findings, implemented batches, selected direction, screenshots, browser evidence, commands/results, Git, deployment, and remaining product decisions.
