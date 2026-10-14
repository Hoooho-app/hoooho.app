# Smart-record dialogue and review

The smart-record workspace uses the current paper background and white nurse/review surfaces. Opening text remains; speaker controls and all automatic/replay speech are removed from this workspace. Microphone recording, transcription, originals and failure recovery remain available.

Completed dialogue inputs automatically organize their exact current draft. Replies with useful items carry “核对 N 条记录” and “直接记录”; a zero-item reply has no record actions. Older replies retain their count but are disabled once a newer reply exists. Opening prompts to modify/reorganize older records and the separate organization buttons are removed. This change does not discard retained originals or alter the existing history ownership boundaries.

“核对 N 条记录” opens a full-page stage titled “核对记录”. Each item is a Design System HealthCard. Necessary factual fields and occurrence time have adjacent edit actions opening a focused sheet. A trash action removes the pending item, and “新增记录” adds a user-authored item through a short type/content/time form. These changes stay in the same draft until the single “保存” action succeeds. Future occurrence time remains rejected by the server; unknown time remains unknown.

Manual additions have stable identifiers and user source references. Their source text is the supplied manual original, not the preceding conversation. Delete/add/edit operations use the existing versioned draft API; the final save retains existing transaction and idempotency behavior. A failed final save retains local edits and recovers the exact remote draft version.

“直接记录” uses that same save path. A confirmed result ends the workspace input and displays only the newly saved destination guides. “查看” fetches the owned persisted record, selects month view and its actual occurrence date, and opens its detail immediately through the existing record deep link. Unknown dates are not represented as a factual calendar day.

## Validation

- Production build and typecheck.
- 102 business-draft regression tests; exact-scope front-desk tests and related client tests.
- Five mobile browser scenarios: automatic actions/direct save/calendar deep link, focused editing/new/delete, zero-item reply, manual-only save after deletion, and real browser recording with fixture transcription.
- Width checks at 320, 375 and 390 pixels and visual inspection of the paper review surface.

Provider responses in local acceptance are isolated test fixtures, not proof of live model availability. Release and environment verification are reported separately.
