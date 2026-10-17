# Care journey V6 implementation

Base: `4494a6b9c98db5bd2d8d71e084bde0aeb62c97f2`; branch `feat/care-journey-v6-20261018`; clean isolated worktree.

Authorization: user approved V6 execution after design pause, including pale green backgrounds for every sprout affordance added to existing pages. The canonical AGENTS delivery chain includes tests, commit/push/main, Staging and Production verification.

Acceptance checklist:
- [x] Icon-only home entry replaces former guarded-days location; days beside child name, numeral emphasized. Sidebar journey under Other above tools.
- [x] Account-isolated persisted wallet, atomic/idempotent care/task/achievement rewards, historical growth independent from spending.
- [x] Today's one task uses real saved records or explicit non-fabricating knowledge/profile review; future tasks hidden.
- [x] Journey, wallet, catalogue, plant growth and medal achievements use existing V2 primitives and real state.
- [x] Theme preview before 30 sprout collection, long-term ownership and server-persisted application; pale green sprout actions remain green in all themes.
- [x] Existing record/history/calendar/review/tool capabilities remain free until actual payment/migration readiness; no premature seven-day lock.
- [x] Review chart/comparison integrated, fixed snapshots, no charge for empty or failed output or already-included functionality.
- [x] Food/dietary/medication enhancements only sold after usable output; existing free paths remain.
- [x] Growth sources use actual licensed/verified data and age eligibility; unready datasets cannot be bought.
- [x] Regional vaccination shows actual program sources, original records and unknown status; incomplete information is free preview, no inferred catch-up prescription.
- [x] Family authorizations remain isolated and server-validated; real payment unavailable cannot pretend membership purchase; no unconsented cross-account data copying.
- [x] Ordinary feedback stays free; no paid bug handling or unvalidated reward promises.
- [x] Build/relevant automated tests and mobile browser checks.
- [x] Commit/main, Staging deployment/acceptance, Production deployment/acceptance.

Frozen: unrelated layouts, nurse assets, AI providers/models, health chronology and original records. Product-owner visual acceptance remains separate from automated verification; emulation does not equal physical iPhone Safari acceptance.

Known release dependencies from V6: actual subscription price/payment/restore, licensed China/UK/Japan/Fenton data, regional maintenance. Unsupported commercial goods must remain unavailable and must not deduct tree sprouts.


Validation before release:
- Production build passed (type checks, body/avatar/image assets, viewport, auth build and install manifest).
- New care/tools/family + existing feedback service: 85/85; child/account cleanup: 2/2. Guest/session/account regression: 21/21; member CRUD: 3/3.
- Full client suite under Asia/Shanghai: 738/739. The one existing terminology source guard flags two unchanged internal AI prompt/schema uses of “健康事件” in `server/ai/business/contract.mjs` and `service.mjs`; those exact strings are present on base4494a6b. Models/prompts are outside this feature and remain unchanged. The initial unscoped timezone run also exposed timezone-sensitive existing fixtures; the Shanghai run resolved those.
- Integrated real App mobile care/growth/vaccine flow: 74 direct API requests successful, no JS/browser API errors, 320/390 widths. Real controlled-day check-ins earned69, two30 collections left9 with history69 and level3 unchanged.
- Independent tool/journey browser acceptance:44 assertions, real HTTP/business/wallet; food supplier only replaced in isolated fixture. Task materials enforce3s on server; theme30, handoff10, templates20, food5; repeated result reads free, failed food releases funds.
- Review fixed result browser acceptance:12 assertions; current150mL saved, source later300mL, original snapshot and exported HTML remain150mL.
- Family:22 backend tests and real mobile two-account explicit snapshot publishing/revoke; original records retained. No claim of real-time synchronization across all existing business APIs.
- Physical iPhone/Safari is not verified.

Commercial release scope:
- Actual tree-sprout growth, theme collection, verified WHO/CDC comparison, tool enhancement outputs and fixed review/comparison are usable.
- Current review/month view/automatic settings are not prematurely paywalled. Subscription price, payment/restore and seven-day paid migration remain disabled until ready.
- Family workspace implementation is available only to server-allowlisted internal test accounts until membership authorization is ready; normal users see its truthful not-open state.
- Regional vaccination provides free program/source/record-check preview and user-confirmed local calendar export;20-sprout comprehensive regional service is not sold while local qualification validation is incomplete. Unlicensed/unintegrated growth references and paid co-creation are not sold.


Online release evidence — 2026-10-18:

- Implementation PR #472 merged as `2e5679e894c2b9b9de11bc0d5071fc6054e902d8`. The GitHub-published tree exactly matched the locally verified tree. The intervening symptom-action fix was preserved and the combined production build passed.
- Staging deployment `096533a2-3858-44b7-a106-fb75e9b4fa84` reached SUCCESS at `2e5679e`. Authenticated mobile smoke passed20 checks, including exact runtime SHA, real account/member APIs, idempotent check-in, server-backed task completion,13 routes, pale-green home entry and320/390 widths. No page JavaScript errors; the synthetic child was removed.
- Production deployment `5ddbd64c-c338-4d52-9fc8-4f99cb21912a` reached SUCCESS at `93d49cb7e6ecce4756fe7481ef8073eda4f3e456`. This commit contains the implementation with only a subsequent acceptance-document change. The same20 authenticated online smoke checks passed, with exact runtime SHA and synthetic-child cleanup. Later documentation-only commits do not change this application source.
- These online checks are smoke acceptance. Complete redemption, settlement, failure release, frozen snapshots and family revocation were validated by the local integrated service/browser checks listed above; no production AI-provider success or physical iPhone acceptance is claimed.
- The existing Production supplier quota issue documented in `docs/acceptance/qwen-latency-20261018.md` remains outside this change. No supplier, secret or quota setting was changed to bypass it; failed enhancement generation does not consume sprouts.
- Product-owner visual approval remains pending their review of the live application. Actual payment, full membership activation, regional clinical qualification and other unready datasets remain disabled as listed above.
