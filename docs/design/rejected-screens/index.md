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

## Brand breakthrough rejected directions

- Source: `docs/design/audit-reports/2026-09-03-brand-breakthrough/audit-report.md` and its before/after evidence.
- Rejected: keeping HealthTrace only inside a small action button; stacking isolated rounded event cards; leading health profile with a utility search; presenting family as an equal-weight account switcher.
- Rejected: large gradients, glass layers, decorative shadow stacks, generic medical-dashboard grids, health “risk” colors without data meaning, ECG wallpaper, family orbits/trees, and a HealthTrace stamp on every module.
- Reason: these treatments are either generic template styling, invent medical or relationship semantics, or turn the brand asset into decoration.
- Reusable lesson: a brand asset must control a meaningful page relationship—continuity, chronology, dossier structure, or care relationship—while mature controls remain conventional.
- Do not infer: flat cards, focused columns, neutral Settings pages, or restrained rounded controls are not rejected when they serve the task.
