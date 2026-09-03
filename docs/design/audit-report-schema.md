# Design-quality audit report schema

## Context

Record repository, base and working commit, branch/worktree, application URL, data/auth setup, browser, viewport, audit date, scope, and exclusions.

## Coverage

Include route/page/action counts and a route-action-state matrix with `PASS`, `FAIL`, `BLOCKED`, or `NOT_RUN`. List every untested route or state with a reason.

## Interaction findings

For each item record ID, route, element, actual and expected behavior, reproduction, P0-P3, evidence, files, root cause, remedy, automatic-fix permission, status, and post-fix verification.

## Visual findings

For each item record ID, route/state/viewport, affected scorecard dimensions, before evidence, visible cause, system or page-level root, A/B/C direction impact, remedy, boundary check, after evidence, and reviewer verdict.

## Direction and implementation

Document A/B/C, the selected direction and rationale, protected business structure, implementation batches, shared roots fixed, rejected proposals, and per-batch accept/revise decisions.

## Verification and delivery

List exact commands and results for unit, integration, TypeScript, lint, build, browser, mobile, console/network, screenshot review, and `git diff --check`. Finish with commits, push, main integration, staging, production, residual product decisions, technical debt, and `DONE`, `PARTIAL`, or `BLOCKED`.
