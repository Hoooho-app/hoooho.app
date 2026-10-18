# Daily allergy knowledge — 2026-10-18

Base: canonical `Hoooho-app/hoooho.app` main `e224119348dc2c372a02266adc1cea98aead5a06`, clean isolated branch `content/allergy-20261018`. Other worktrees are untouched.

Acceptance scope:

- One complete original 600–900 Chinese-character short article for parents of children aged 0–7 with diagnosed eczema; no diagnostic inference or individual drug/reintroduction advice.
- Keep today's selection and stable archive/bookmark URLs. Release the new article in the next reading edition, 2026-10-19 at device-local 06:00, through the existing schema.
- Fix absolute-ordinal modulo selection with a release-date anchor. Preserve publication/future gating, retained same-day selection, missing/withdrawn fallback, storage failure resilience and local calendar/DST arithmetic.
- Preserve all UI, nurse assets, child data, records, backend, database, model requests and notification behavior. No admin/approval UI.
- Source checks, relevant unit tests, production build, mobile browser acceptance at 320/375/393, commit/push/main, isolated Staging SUCCESS + online acceptance, then Production SUCCESS + online acceptance. Browser emulation is not physical iPhone/Safari acceptance.

## Editorial source verification

Title: **湿疹反复，除了红不红，还该记录什么？** Stable ID `eczema-observation-beyond-redness`, version 1. About 690 Chinese characters in sections (title excluded); reading estimate 3 minutes. Distinct from the seed article's diagnostic-test/food-avoidance theme: emphasis is skin-barrier understanding, itching/sleep, communicating changes and infection escalation. Recording/photo prompts are editorial communication suggestions, not a validated diagnostic instrument.

All three original pages below were opened and read on **2026-10-18**. There is no clinician review claim.

| Original source | Source date shown | Scope and supported claims |
| --- | --- | --- |
| [AAP: Eczema in Babies and Children](https://www.healthychildren.org/English/health-issues/conditions/skin/Pages/Eczema.aspx) | Updated 2025-05-19 | Babies and children: barrier dysfunction, fluctuating rash, dry/itchy skin, disturbed sleep and infection signs. |
| [AAP: How to Treat & Control Eczema Rashes in Children](https://www.healthychildren.org/English/health-issues/conditions/skin/Pages/how-to-treat-and-control-eczema-rashes-in-children.aspx) | Updated 2025-05-14 | Children: gentle cleansing, moisturizing after bathing and during remission, heat/sweat/product triggers, prescribed treatment, flare-ups despite good care. Do not make restrictive diet changes without clinician discussion. Drug/bleach-bath instructions in the original are deliberately not reproduced. |
| [NHS: Atopic eczema](https://www.nhs.uk/conditions/atopic-eczema/) | Reviewed 2024-09-06; next review due 2027-09-06 | All ages, especially young children: variable triggers, continued moisturizer after improvement, avoid self-directed dietary change; sudden worsening, blistering/pus/oozing, pain and fever/unwellness require urgent assessment. UK service routing is not copied into Chinese/global advice. |

No new study is converted into universal advice. NICE CG57 was attempted but returned HTTP 403; it is not cited as a checked source. The independently accessible AAP/NHS sources agree on the claims used. Existing article/source dates remain unchanged.

## Validation and release

Local validation passed:

- 17 relevant unit/contract assertions (9 daily-selection/content, 8 existing nurse-station contracts); `TZ=Asia/Shanghai`. The existing guarded-day test expects Shanghai calendar dates and fails under UTC; rerunning with the repository CI timezone passes without a product change.
- `npm run build`: PASS, including typechecking, asset, viewport, auth and install-app checks.
- Two mobile browser scenarios (2026-10-18 current edition and 2026-10-19 scheduled edition), each at 320×568, 375×667, 393×852: PASS. Entrance, complete prose, reference links, bookmark/header, archive, return and unavailable-ID fallback checked. 320px home/reader screenshots inspected.
- The initial new-article browser assertion assumed exactly one AAP link. The new article correctly has two AAP sources; the test now checks the first link's visibility and the full source count. No UI change was made to satisfy the assertion.

Staging/Production deployment results will be recorded after terminal SUCCESS and online acceptance; not yet claimed here. Physical iPhone/Safari: NOT_VERIFIED.
