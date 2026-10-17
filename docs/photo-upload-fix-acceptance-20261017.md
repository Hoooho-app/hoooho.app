# Photo upload and recognition remediation — 2026-10-17

Scope: the six findings in the photo audit, plus directly related original preview, draft restoration and record-detail labeling defects. Initial base was `702c7b6`; integrated the current main `59dc2a7` before final verification. Branch: `fix/photo-upload-analysis-20261017`.

| Finding | Resulting behavior |
| --- | --- |
| U01 Reminder photo picker | Selection prepares and displays the image, uploads to the existing member-scoped recognition API and shows sourced drug-name candidates. Explicit adoption is required; failure can be retried and removal cancels late results. |
| U02 Medication / visit / legacy vaccination | Replaced placeholder recognition notices with actual processing and sourced review. Adoption changes only the supported text fields, without inferring dose, dose sequence or occurrence time. Multiple candidates remain individually selectable. Partial recognition retains sourced candidates with an explicit warning about unfinished content and a retry action; it never marks the whole original complete. |
| U03 Long-term medication archive | Decode and compress before accepting an image. Invalid or pending image selections block save. Images support preview, removal and read-back after save/reload; older async preparation cannot overwrite a newer choice. Member changes remount the archive editor. The existing no-AI policy remains visible. |
| U04 Help chat | Successful sends clear only the image actually sent. Later text requests do not repeat it. Existing failure retention and request identity remain in place. |
| U05 Structured upload composer | Show individual filenames, image thumbnails, full original preview and removal before analysis; non-image files retain original links. |
| U06 Material return | Preview selected originals before save and retain saved-original reading. The shared continuation workspace uses the same preview component. |

Related repairs: bowel thumbnails open an original view; nested previews remain above forms; source changes update an open preview instead of unexpectedly closing it; restored ordinary photos can be recognized; medication draft associations migrate to stable photo IDs and survive reload/save; non-symptom details use the corresponding record label. No production dependencies or backend API/schema changes.

## Verification

- `npm run build`: PASS, including typecheck, asset checks, viewport, auth build and install configuration.
- `TZ=Asia/Shanghai npm run test:client`: 660 PASS. The timezone matches the existing local-date test contract.
- Recognition / business / image analysis / attachment / quick-photo / symptom media / original-image server suite: 148 PASS.
- `npx playwright test --config tests/photo-upload/playwright.config.ts`: 26 PASS at 375px and 430px, including partial-recognition warnings that remain visible after field adoption.
- Extended reminder and saved-medication round-trip recheck: 4 PASS. Includes explicit adoption, unchanged dose, reload/reanalysis, real save payload photo association, correct detail title, original retrieval and original image decoding.
- Legacy vaccination is exercised in a test-only StrictMode component harness; it is not presented as an active production navigation route.
- Synthetic geometric images and fake clinical text only in local tests. Provider success and failure are isolated fixtures. A separate production smoke uploaded and previewed a synthetic PNG through the normal smart-record UI; the real provider correctly read the drug name and strength and identified the document as a virtual software-test sample. The unsaved test draft was discarded.
- Physical iPhone camera, native Safari and platform-dependent HEIC conversion remain unverified. Unsupported browser decoding reports an explicit conversion/retry error.

## Release gate

Commit/push/main integration and Staging then Production verification follow the repository delivery chain. Deployment identities and online verification are recorded after release. Product-owner visual approval is separate from technical verification.

Initial release: main `f99b8f6926b9c379c0a85244c1697324ceba9911`; Staging `8c4176fe-339e-4c18-ad20-1982355a9edb` SUCCESS; Production `8208a584-2739-4a08-9d66-ccdebb966ee7` SUCCESS. Both live environments passed health/authentication, build-commit and changed-module checks. The Staging custom domain lacks DNS; verification used the existing Railway domain. Cloud Browser could not load that staging hostname. The existing production browser tab retained an older cached reminder client, so the new reminder controls are verified by local mobile operation and deployed assets; the general smart-record real-provider smoke is separate evidence. The partial-review follow-up follows the same release chain, with deployment identities retained in its PR.
