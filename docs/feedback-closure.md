# Feedback closure operations

Feedback data is persisted under `DATA_DIRECTORY/feedback/records.json`. Private image files are stored under `DATA_DIRECTORY/feedback/attachments/`; JSON records contain metadata and storage keys only. The existing Railway persistent data directory must remain mounted for both records and images.

User and product-manager access use the existing bearer session. `/api/ops/feedback` additionally requires at least one explicit allowlist variable and defaults to deny when none is configured:

- `OPS_ALLOWED_ACCOUNT_IDS`
- `OPS_ALLOWED_EMAILS`
- `OPS_ALLOWED_PHONES`

Values are comma-separated. Do not expose these variables to the client. Authorized record/detail responses generate five-minute attachment URLs; the binary endpoint validates the signature and sends `Cache-Control: private, no-store`.

The browser re-encodes supported images to JPEG with a maximum edge near 2048px and a target below 2MB, which removes readable EXIF metadata. HEIC works when the browser can decode it (typically Safari); browsers without a HEIC decoder show a conversion instruction and preserve the rest of the draft. Speech uses the browser recognition capability only, releases microphone streams immediately, and never persists raw audio.

Images are written only with the final feedback submission, so abandoned drafts create no server-side temporary files. The owned-feedback deletion service removes the feedback, messages, status history, attachment metadata, and corresponding private files together.
