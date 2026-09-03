# Rejected screen registry

## Known rejected patterns

- Source: `docs/ui-audit-v2.md` findings from the superseded baseline.
- Rejected: desktop constrained to a phone mock-up, generic teal template treatment, isolated rounded rows, nested identity cards, inconsistent sheet tabs, color-only navigation state, and mixed brand spelling.
- Reason: weak information hierarchy, generic SaaS feel, poor desktop use, and inconsistent interaction semantics.
- Reusable lesson: unify semantic foundations and task hierarchy before polishing surfaces.
- Do not infer: this registry does not reject mobile-first design, rounded controls, cards with product meaning, or Hoooho green itself.

No additional screen is marked rejected without explicit evidence or product review.

## Initial governance pass evidence

- Source: `docs/design/audit-reports/2026-09-03-initial/evidence/before/desktop-1280-guide.png` and `desktop-1280-health-events.png`.
- Rejected aspect: a 620px application shell on a 1280px screen made information pages read as a centered phone simulator and prevented their intended responsive composition.
- Reason: the treatment conflicted with the documented 1120px application width and created unused space without adding focus.
- Reusable lesson: opt suitable pages into an explicit wide composition; do not globally stretch compact forms or detail workflows.
- Do not infer: centered, narrow content remains correct for login, dialogs, and focused data-entry tasks.
