# Hoooho brand breakthrough audit — 2026-09-03

## Scope and evidence

- Baseline commit: `7146d2c50383fc50f64df0667003bdb71a177872`, the Production `main` revision at the start of this pass.
- Sample pages: health-events triage home, health-events list, health profile, and family.
- Frozen: product structure, top-level routes, navigation, user copy, workflows, nurse role, API, persistence, and backend logic.
- Viewports: 375×667, 390×844, 430×932, and 1280×800.
- Before evidence: `evidence/before/`; after evidence: `evidence/after/`; anonymous review set: `evidence/blind-round-1/`.
- Browser limitation: the in-app signed-in browser could not start because the Windows browser sandbox helper failed. Baseline screenshots were therefore reproduced from the exact Production source revision with deterministic account, member, event, and record fixtures. They are not presented as a live authenticated Production capture.

## Visual-director decision

The shared syntax is **one continuous path with three meaningful moments**. HealthTrace is a controlled family of semantic roles, not a decorative wallpaper. Each sample page gets one dominant role and a different composition.

### Home / health-events triage

**A — baseline:** `evidence/before/*-home-triage.png`.

**B — why it looked ordinary:** the nurse, prompt, and record action were stacked in a centered mobile column even on desktop. The brand mark was confined to the small next-step button, so the page read as a tidy voice-input template rather than a Hoooho care hand-off.

**C — brand upgrade direction:** “Calm care desk” — keep the centered nurse stage and make HealthTrace a restrained supporting gesture around the working area.

**D — challenge direction:** “Care relay stage” — make person, nurse, and record action three anchors on one continuous path; on desktop use an asymmetric 5:7 stage instead of a phone column.

**E — selected:** **D, care relay stage.** The decision was not averaged with C. HealthTrace uses the `path` role; the small next-step mark becomes a conventional directional icon so the brand asset has one job.

### Health events list

**A — baseline:** `evidence/before/*-health-events-list.png`.

**B — why it looked ordinary:** every event was a separate rounded card with equal weight. The result was clean but resembled a generic CRUD feed, and chronology was expressed mainly by text rather than composition.

**C — brand upgrade direction:** “Editorial health log” — flatten card chrome and strengthen date-led bands.

**D — challenge direction:** “Continuous health narrative rail” — let dates become beats along a single open rail, with event bands attached to the timeline rather than floating cards.

**E — selected:** **D, continuous health narrative rail.** HealthTrace uses the `rail` role and carries order/focus only; it does not encode severity.

### Health profile

**A — baseline:** `evidence/before/*-health-profile.png`.

**B — why it looked ordinary:** search led the page, while important longitudinal facts and the directory were rendered as similarly weighted utility modules. It read as a generic searchable settings catalogue.

**C — brand upgrade direction:** “Personal health dossier” — lead with important facts, use one dossier spine, then separate priority and directory chapters.

**D — challenge direction:** “Living body atlas” — make the whole page a more spatial map with stronger visual segmentation and non-linear discovery.

**E — selected:** **C, personal health dossier.** The director rejected the atlas challenge because it risked changing the mature lookup model. HealthTrace uses the `spine` role; search remains available but secondary.

### Family

**A — baseline:** `evidence/before/*-family.png`.

**B — why it looked ordinary:** family members were equal rows with pill-like state controls. The currently cared-for person had no meaningful focal weight, so the screen resembled an account switcher.

**C — brand upgrade direction:** “Care relationship index” — establish the current person as the anchor, keep other people as open rows, and use one relationship knot.

**D — challenge direction:** “Family care constellation” — spatially arrange family members around the current person.

**E — selected:** **C, care relationship index.** The constellation was rejected because it could imply relationships the product does not know and would weaken scanability. HealthTrace uses the `bond` role.

Family was selected instead of Settings because people and care relationships are domain-specific Hoooho material. Settings remains intentionally neutral and tool-like.

## Implementation summary

- HealthTrace now exposes `mark`, `path`, `rail`, `spine`, and `bond` variants with the same three-moment grammar.
- Triage home uses a responsive care-relay stage.
- The event list uses open narrative bands on a continuous rail.
- Health profile becomes a dossier with important facts before the search tool and distinct priority/directory chapters.
- Family becomes a relationship index with a stronger current-person anchor.
- No new gradient, glass surface, card stack, business label, route, or server behavior was introduced.

## Blind review

The valid review used the 32 screenshots in `evidence/blind-round-2/`. A/B placement was independently randomized per page. The reviewer received only anonymous screenshot contact sheets and did not read the implementation notes or mapping.

- Home: selected the implementation candidate.
- Health-events list: selected the implementation candidate.
- Health profile: selected the implementation candidate.
- Family: selected the implementation candidate.
- Brand recognition: **4.5 / 5** (baseline 3.8).
- Visual memorability: **4.5 / 5** (baseline 3.7).
- Information hierarchy: **4.4 / 5**.
- Readability: **4.2 / 5**.
- Mobile completion: **4.4 / 5**.
- Result: **PASS — all five thresholds met.**

The reviewer judged the change to be more than color, radius, shadow, type-size, or spacing adjustments because it changed the event presentation model, section organization, visual path, action icon semantics, and cross-page brand grammar.

Observed but non-blocking boundaries:

- The list rail must not imply that separate events are one medical episode; chevrons and individual interactive rows remain necessary.
- On iPhone SE, the family bond sits close to the current-person row and must not be tightened further.
- Secondary text is at the readability threshold; do not reduce its size or contrast.
- Profile and family deliberately remain focused columns on desktop; the wide triage stage should not be copied onto them.

## Promotion decision

Promote the semantic HealthTrace family and the “one page, one role” rule to the visual language. Approve these four sample states as composition references, not pixel templates.

Do not mechanically roll the treatment across the remaining product. Settings, forms, detail workflows, authentication, consultation, feedback, guide, and Operations remain unpromoted. A future page may adopt a HealthTrace role only when it has a true continuity, chronology, dossier, or relationship meaning.
