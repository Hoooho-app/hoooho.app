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

The first release contains **one** product-owner-approved sample: `positive-test-and-food-avoidance`. With one published article, the daily mechanism keeps offering that article. It does not invent new medical prose or claim to provide a fresh article every day until more approved content is added.

Content is maintained in `src/features/allergy-knowledge/articles.ts`. Each article has a stable ID, version, explicit publication status/date, sections and source references. `checkedAt` records source verification; it is not a clinician-review attestation. Do not show a clinical reviewer badge without an actual qualified reviewer and review record.

For each new article, prepare a draft, verify its medical claims and applicability, complete the agreed editorial/medical review, then explicitly publish it through the standard code release. A paused or withdrawn article is immediately excluded on the next app load; saved daily choices never override publication status.

When a regular editorial team needs self-service entry, extend the existing authenticated Ops area with content entry, mobile preview, reviewer identity/version, publish/unpublish and scheduling. Reuse the article format and publication boundary; do not treat generated prose as approved simply because generation succeeded.

Selections and bookmarks are local to the current browser/account. They are not synchronized to another device. No child health records are accessed for recommendations in this first release.
