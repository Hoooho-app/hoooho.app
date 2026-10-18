# Daily allergy knowledge

## Scope and acceptance

Base: `origin/main` at `bb2cbbfc28e38bcb7f3d43443e5b72048beb6863`, clean isolated branch.

- The confirmed entrance replaces the welcome copy beside the existing nurse footage in the health journal card. Preserve nurse assets, record actions, symptom event and other home surfaces.
- Open a complete reading page for the approved short article. Remove the tomorrow teaser. Keep references accessible and use the existing V2 tokens/components.
- Automatically choose from explicitly published content at 06:00 in the device's local time. Retain the same article for the current edition, including across reloads and content additions. Re-evaluate on foreground/focus and the next edition boundary.
- Drafts, future releases, missing and withdrawn IDs never render as public articles. Storage failures do not block reading.
- Check build, daily-selection tests and the mobile home → reader → references/bookmark → back flow at 320×568, 375×667 and 393×852 before Staging and Production verification.
- No new AI request, clinical inference, backend, database migration or separate content administration system.

## Initial content and publication

The first release contains **one** product-owner-approved sample: `positive-test-and-food-avoidance`. With one published article, the daily mechanism keeps offering that article. It does not invent new medical prose or claim to provide a fresh article every day until more source-verified content is added.

Content is maintained in `src/features/allergy-knowledge/articles.ts`. Each article has a stable ID, version, explicit publication status/date, sections and source references. `checkedAt` records source verification; it is not a clinician-review attestation. Do not show a clinical reviewer badge without an actual qualified reviewer and review record.

The product owner replaced the per-article user/manual approval workflow on 2026-10-17: maintain and publish source-verified articles automatically, without a content administration UI or daily user approvals. For each article, open at least two authoritative original sources, verify claims, age/scope and source dates, write complete original prose, and pass the normal tests, Staging acceptance and Production release. Source verification is not medical review; never invent a clinical reviewer. If evidence or release checks fail, retain the last valid release. A paused or withdrawn article is immediately excluded on the next app load; saved daily choices never override publication status.

Do not build an Ops editor or approval system unless the owner requests it again. Keep article IDs and versions stable, retain archives/bookmarks and the nurse-side text entrance; do not add live AI calls, reminders, popups or tomorrow teasers.

Selections and bookmarks are local to the current browser/account. They are not synchronized to another device. No child health records are accessed for recommendations in this first release.

## Edition scheduling (2026-10-18)

New articles use `publishedAt` as the first eligible local reading edition (06:00 through 05:59 the next day). A valid saved selection wins for that edition. Without one, rotation is anchored to the latest release date, newest first; the release day always selects the newest article instead of using the absolute date modulo the changing pool size. Subsequent editions rotate through the published archive when there is no new release. Stable IDs break same-date ties deterministically. Drafts and future articles remain hidden from selection, direct reading and archives. Invalid/withdrawn saved IDs fall back to eligible articles.

The new `eczema-observation-beyond-redness` article is scheduled for **2026-10-19 at device-local 06:00**. The current 2026-10-18 edition stays unchanged. Sources were actually opened on 2026-10-18; details and release evidence are in `docs/acceptance/allergy-knowledge-20261018.md`.
