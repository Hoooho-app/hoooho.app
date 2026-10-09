# Feedback closure operations

Feedback data is persisted under `DATA_DIRECTORY/feedback/records.json`. Private image files are stored under `DATA_DIRECTORY/feedback/attachments/`; JSON records contain metadata and storage keys only. The existing Railway persistent data directory must remain mounted for both records and images.

User access uses the existing product bearer session. `/api/ops/feedback` uses the same strict owner authorization as every other `/api/ops/**` data endpoint: the signed token must contain an email that exactly matches the normalized server-only `OPS_OWNER_EMAIL`. Missing owner configuration fails closed. Legacy `OPS_ALLOWED_ACCOUNT_IDS`, `OPS_ALLOWED_EMAILS`, and `OPS_ALLOWED_PHONES` values never broaden Operations access. Do not expose the owner setting to the client. Authorized record/detail responses generate five-minute attachment URLs; the binary endpoint validates the signature and sends `Cache-Control: private, no-store`.

The browser re-encodes supported images to JPEG with a maximum edge near 2048px and a target below 2MB, which removes readable EXIF metadata. HEIC works when the browser can decode it (typically Safari); browsers without a HEIC decoder show a conversion instruction and preserve the rest of the draft. Speech uses the browser recognition capability only, releases microphone streams immediately, and never persists raw audio.

Images are written only with the final feedback submission, so abandoned drafts create no server-side temporary files. The owned-feedback deletion service removes the feedback, messages, status history, attachment metadata, and corresponding private files together.

## Current feedback entry

The feedback page temporarily restores the direct form: optional problem type, editable feedback text, browser speech input, image upload, and an explicit submit control. It uses the existing feedback creation endpoint with a stable idempotency key, and keeps text/images in memory on submission failure. “我的反馈”, private screenshots and operations processing keep their existing records and behavior.

The AI product-manager interview implementation remains available in source for future iteration, but is not mounted or requested by this page. Existing AI-generated feedback records remain readable.

Validation: `npm run test:help`, `node --import ./scripts/register-node-ts-loader.mjs --test src/pages/Feedback/Feedback.contract.test.ts`, `npm run build`, and `node tests/feedback-interview/browser-smoke.mjs` (legacy script location; now verifies the restored form, failure retention and actual local feedback persistence).
