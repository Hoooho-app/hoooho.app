# Hoooho initial interaction and visual quality audit

Date: 2026-09-03

Baseline commit: `eee76a659a37bf48d888a188e6a7823416a70858`

Direction: **B — brand upgrade**

Scope: presentation and interaction only; product structure, navigation, API, data semantics, confirmed copy, nurse characters, and media remain frozen.

## Coverage

- Static inventory: 336 source files, 38 literal routes, 812 interaction signals.
- Signal seed: 254 buttons, 6 links, 125 inputs, 21 forms, 345 click handlers, 23 submit handlers, 7 keyboard handlers, 3 custom button roles, 24 overlay references, and 4 media elements.
- Runtime evidence: 8 representative screens at iPhone SE (375×667), 430×932, and desktop 1280×800; 24 before screenshots and 42 after screenshots.
- Runtime flows: protected deep-link login; filter and delete-confirmation focus entry, bidirectional trap, Escape/cancel, and restoration; Feedback success/empty/error; reduced motion; route entry; horizontal overflow; console/page errors; and zoom policy.
- Full static matrix: [route-interaction-matrix.md](route-interaction-matrix.md). Machine-readable seed: [interaction-inventory.json](interaction-inventory.json).

The inventory is a discovery seed, not a claim that all 812 signals were individually browser-tested. Browser PASS is limited to the named flows and screenshots above.

## Baseline diagnosis

The application already had a credible V2 foundation. Its main problem was contract drift rather than absence of a system:

1. consumer desktop screens were still constrained to a 620px phone-like column even where the design specification declared a 1120px application width;
2. page CSS bypassed semantic tokens, especially Feedback, producing a parallel teal palette and undersized controls;
3. the three-point health trace existed as an isolated inline mark rather than a reusable brand primitive;
4. shared focus, scroll-lock, and modal patterns existed, but several custom overlays bypassed them;
5. authentication mixed successful session creation with a fallible member bootstrap, and discarded the requested deep link;
6. permanent deletion was exposed directly behind a swipe action without confirmation;
7. weak text contrast and several 34–36px controls fell below the mobile baseline.

## Direction decision

- **A — safe upgrade:** consistency-only. Rejected because it would leave the phone-column desktop composition and weak brand system intact.
- **B — brand upgrade:** selected. It preserves every business route and task while improving internal hierarchy, responsive composition, semantic foundations, and the Hoooho trace language.
- **C — concept upgrade:** rejected for production. A more theatrical nurse-led environment would risk over-design and reduced information efficiency.

B is applied selectively: the Guide becomes an editorial wide layout; Health Events gains a deliberate wide shell while retaining its calm central triage desk; compact task pages remain compact. This avoids turning the product into a dashboard or making every page the same card template.

## Interaction findings

| ID | Severity | Finding | Status | Evidence / verification |
| --- | --- | --- | --- | --- |
| HIA-001 | P1 | Permanent health-event deletion had no confirmation | Fixed | `HealthEventCard` now uses shared `ConfirmDialog`; browser cancel flow PASS |
| HIA-002 | P1 | Authentication lost pathname query and hash | Fixed | guard preserves full in-app target; browser deep-link flow PASS |
| HIA-003 | P1 | Successful login could be reported as failed when member bootstrap failed | Fixed | login commits session and navigates without fallible bootstrap; target owns loading |
| HIA-004 | P1 | Browser zoom was disabled | Fixed | viewport restriction removed; three projects assert policy |
| HIA-005 | P1 | Custom consumer dialogs bypassed focus/Escape/restore | Fixed | Filter, record editor, Coming Soon, Event Status, and photo lightbox reuse focus/scroll contracts; reachable filter and confirmation browser flows PASS |
| HIA-006 | P1 | Existing-symptom card was mouse-only | Fixed | native button semantics replace custom role button |
| HIA-007 | P1 | Dormant TemperatureChart points had tiny targets and no visible focus | Fixed statically | 44-unit hit circle, focus ring and keyboard activation contract; the component is intentionally not mounted by the current detail-page contract, so no browser PASS is claimed |
| HIA-008 | P2 | Shared small buttons, view switch, toggle, and feedback choices were undersized | Fixed at shared/high-frequency roots | 44px tokens and screenshot/browser coverage |
| HIA-009 | P2 | Destructive and filter actions had inverted/unclear hierarchy | Fixed | destructive dialog and primary Apply / secondary Reset |
| HIA-010 | P2 | Feedback used a parallel hard-coded teal system | Fixed for submission screen | semantic primary tokens replace hard-coded control colors |
| HIA-011 | P2 | Photo lightbox and Event Status had incomplete dialog focus behavior | Fixed | shared focus trap, focus restoration, Escape and page scroll lock |
| HIA-012 | P2 | Some Family, Feedback, and Health Profile error states lack in-page retry | Open | route-specific asynchronous-state batch |
| HIA-013 | P2 | Body location, tutorial media, profile record actions, and some attachment controls were below 44px | Fixed | shared Bottom Sheet controls, chips, segments, media, search clear, editor attachment and profile record actions use the 44px baseline |
| HIA-014 | P2 | Ops custom drawer/modal bypass shared focus governance | Open | internal-only; lower priority than consumer paths |
| HIA-015 | P3 | Login agreement and privacy labels had no confirmed destination but appeared interactive | Affordance fixed; destination open | rendered as honest static legal copy until approved routes or URLs exist |
| HIA-016 | P3 | Browser Back behavior for local bottom-sheet state is unspecified | Decision needed | product interaction contract required |
| HIA-017 | P3 | `/feedback/submitted` appears to be a legacy/orphan route | Decision needed | retained for compatibility |

Counts at discovery: P0 0; P1 7; P2 7; P3 3. All reachable confirmed P1 defects and every low-risk automatable P2 target identified in this pass were repaired. Dormant components are explicitly classified as static-only; route-level retry design, internal Ops overlays, and product-contract questions remain governed backlog rather than false browser PASS.

## Visual changes

- Added missing semantic danger, body-small, and spacing tokens; raised weak text from `117 135 131` to `87 108 104` for readable small text.
- Removed the default decorative gradient from primary actions and the next-step mark; green now functions as a clear signal rather than a wash.
- Created reusable `HealthTrace`; the established three-point mark is now a design-system primitive rather than page-local SVG.
- Added an explicit route/layout contract: Guide and Health Events list mode use the wide shell, Health Events triage remains a compact stage, task/form/detail pages remain compact, and wide headers retain a stable navigation anchor.
- Reworked Feedback spacing, semantic color use, choice targets, attachment delete hit area, and mobile wrapping without changing fields or submission flow.
- Replaced five cramped Feedback choices per row with three at 375/390/430; added the trace only to the real submission-success state.
- Reduced repetitive mint icon wells in Settings and Health Profile, and gave Family a deliberate compact composition and role-selection cue.
- Preserved white space, nurse assets, animation state machine, Lucide icons, side navigation, page names, and all business actions.

## Screenshots and scorecard

- Before: [`evidence/before/`](evidence/before/)
- After: [`evidence/after/`](evidence/after/) — default pages plus filter focus, delete confirmation, Feedback success/empty/error, and reduced-motion evidence.
- Viewports: iPhone SE 375×667, mobile 430×932, desktop 1280×800.

| Dimension | Before | After |
| --- | ---: | ---: |
| Information hierarchy | 3.4 | 4.3 |
| First visual focus | 3.2 | 4.2 |
| Typography | 3.2 | 4.1 |
| Spacing precision | 3.2 | 4.2 |
| Alignment | 3.4 | 4.3 |
| Color control | 3.2 | 4.3 |
| Icon unity | 3.8 | 4.4 |
| Component consistency | 2.8 | 4.3 |
| Brand recognition | 2.5 | 3.8 |
| Trust | 3.7 | 4.1 |
| Mobile completion | 3.2 | 4.4 |
| State completeness | 2.8 | 4.1 |
| Motion continuity | 3.0 | 4.1 |
| Readability | 3.4 | 4.3 |
| Accessibility | 3.1 | 4.5 |
| Memorability | 2.5 | 3.7 |

The initial independent review rejected the first implementation at 3.47/5 and triggered a second iteration. A second review rejected a contradictory Feedback success fixture. After the fixture returned the newly created record and success, empty, and error evidence was regenerated independently, the final visual review passed at **4.19/5**. Every release-critical dimension is at least 4.0, the lowest dimension is 3.7, and no self-authored score was treated as approval.

## Verification

- `npm run test:e2e:design-quality`: production build PASS; 36/36 browser checks PASS across iPhone SE, 430px mobile, and 1280px desktop.
- `npm run test:client`: 326/326 PASS.
- `npm run test:server`: 149/149 PASS.
- Independent interaction gate: PASS for every production-reachable surface; dormant legacy detail components remain explicitly static-only backlog.
- Independent visual gate: PASS at 4.19/5; Feedback success at `/feedback/mine` shows one created record, while empty and error evidence are distinct in all three viewports.
- Initial browser harness failure: Chrome iPhone preset launch instability and brittle text landmarks. The harness was corrected to the repository's established Chrome mobile profile and route-level assertions; no product defect was hidden.
- Right-side in-app preview: unavailable because the Codex browser kernel failed to start with the host sandbox refresh error. Independent Playwright performed the required 375/430/1280 browser verification. This limitation is not reported as a visible-preview PASS.

## Sample-library update

- Approved baseline: the post-pass Health Events mobile triage composition and Guide desktop editorial layout, as principles rather than pixel templates.
- Rejected pattern: 620px phone simulation for desktop information pages, parallel teal palettes, unbounded nested cards, universal pills, decorative green gradients, and modal implementations that bypass shared behavior.
- External references: none adopted. The library intentionally does not invent user taste or copy third-party brand assets.

## Remaining governance backlog

The next governance cycle should design route-level retry patterns, audit internal Ops overlays separately from consumer flows, add long-content and slow-network evidence, decide legal-document destinations and browser-Back behavior for local sheet state, and either remove or deliberately reactivate dormant legacy detail components. These items require product scope or separate internal-tool coverage and are not presented as browser-verified here.
