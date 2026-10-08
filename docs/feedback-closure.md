# Feedback closure operations

Feedback data is persisted under `DATA_DIRECTORY/feedback/records.json`. Private image files are stored under `DATA_DIRECTORY/feedback/attachments/`; JSON records contain metadata and storage keys only. The existing Railway persistent data directory must remain mounted for both records and images.

User access uses the existing product bearer session. `/api/ops/feedback` uses the same strict owner authorization as every other `/api/ops/**` data endpoint: the signed token must contain an email that exactly matches the normalized server-only `OPS_OWNER_EMAIL`. Missing owner configuration fails closed. Legacy `OPS_ALLOWED_ACCOUNT_IDS`, `OPS_ALLOWED_EMAILS`, and `OPS_ALLOWED_PHONES` values never broaden Operations access. Do not expose the owner setting to the client. Authorized record/detail responses generate five-minute attachment URLs; the binary endpoint validates the signature and sends `Cache-Control: private, no-store`.

The browser re-encodes supported images to JPEG with a maximum edge near 2048px and a target below 2MB, which removes readable EXIF metadata. HEIC works when the browser can decode it (typically Safari); browsers without a HEIC decoder show a conversion instruction and preserve the rest of the draft. Speech uses the browser recognition capability only, releases microphone streams immediately, and never persists raw audio.

Images are written only with the final feedback submission, so abandoned drafts create no server-side temporary files. The owned-feedback deletion service removes the feedback, messages, status history, attachment metadata, and corresponding private files together.

## AI product-manager interview

`POST /api/feedback/interview` requires the existing authenticated account session. It uses the configured AI provider and account call limiter, with no automatic retry, health-profile access or server-side draft persistence. The model asks at most one question per turn and assigns source quotes to page/function, actual issue or suggestion, desired improvement, impact, and reproduction/frequency. Every submitted quote must match a user turn; unknown fields remain unprovided. Screenshots are attachments only and are not sent to this text interview.

The client stores conversation text and edited review in account-scoped session storage. Images remain in memory. The user explicitly chooses organization, can edit the complete structured text and classification, and must press “确认并提交” before the existing feedback creation endpoint runs. The submission key remains stable through retries. Requests and failed submissions preserve content; AI failure exposes retry and manual review. “我的反馈”, private screenshot delivery and operations processing continue using the existing records. Browser speech support is unchanged.

Validation: `npm run test:help`, `node --import ./scripts/register-node-ts-loader.mjs --test src/pages/Feedback/Feedback.contract.test.ts`, `npm run build`, and `node tests/feedback-interview/browser-smoke.mjs` (launches a local fixture server; AI responses/failures mocked, final feedback persistence real).
