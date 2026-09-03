# Audit report schema

Store the report and evidence in a task-specific artifact directory chosen before the audit. Keep generated screenshots and logs out of commits unless the repository explicitly tracks audit evidence.

## Summary

Record:

- audit scope and exclusions;
- repository, branch, base commit, app URL, build, browser, viewport, and authentication/data setup;
- route coverage count and untested routes with reasons;
- finding totals by severity and status;
- fixed, deferred, product-decision, and needs-verification counts.

## Route/action matrix

| Route | Entry point | Element | User action | Expected result | Implementation file | Preconditions | Runtime status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

Use `PASS`, `FAIL`, `BLOCKED`, or `NOT_RUN`. Do not use PASS for code inspection alone.

## Finding record

Use one record per independently verifiable issue:

```yaml
id: HIA-001
route: /example
element: Accessible control name or stable locator
summary: Concise observed defect
actual: What happened
expected: What should happen
reproduction:
  - Exact setup and action
severity: P0 | P1 | P2 | P3
status: open | fixed | deferred | needs_verification | blocked
evidence:
  - screenshot/log/trace/console/network reference
files:
  - path/to/file.tsx
recommendation: Smallest viable remedy
auto_fix: yes | no
auto_fix_reason: Boundary and risk rationale
verification:
  result: PASS | FAIL | NOT_RUN
  evidence:
    - post-fix evidence reference
decision_needed: null or the smallest unresolved product question
```

## Change and verification ledger

For each fixed ID, map the root cause, changed files, test or reproduction case, before/after evidence, and regression risk. List console errors, failed network requests, and unhandled promises separately, including whether they are relevant.

Finish with the repository-required delivery report: tests (`PASS`/`FAIL`/`N/A`), branch, commit, push, main integration, staging, production, residual risks, and one final status (`DONE`, `BLOCKED`, or `FAILED`).
