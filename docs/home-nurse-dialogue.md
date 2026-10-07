# Homepage nurse conversation entry — 2026-10-08

The service front page now offers a direct AI nurse conversation immediately below the current child's information and growth module. The existing symptom quick-note card, follow-up entry, six feature entries, nurse artwork and navigation remain available.

The new card uses the existing design-system card, typography, buttons and tokens. It has no icons. “和护士说” opens the existing nurse interview and attempts one explicit real-time voice connection after the owned draft is ready. “打字聊” opens that same interview with text focus and no microphone request. Voice uses the existing click-to-start/pause transport; the earlier prototype's held button only demonstrated preset utterances.

Both entries use the existing `/smart-record` symptom-case scope. Organization returns to the existing symptom form, including manual-field conflict review, notes, occurrence precision, attachments and explicit confirmation. The existing case-capture API and idempotent save remain authoritative. Opening the homepage or entering a conversation does not create a formal health record. This change adds no provider, model, production dependency, backend endpoint, database schema or automatic reconnect.

Entry intent is account/member-scoped and consumed from navigation state. A scope change revokes it, including when switching back. Closing/reopening the panel and refreshing the page do not restart voice automatically. The nurse's existing error, pending-text retry, draft recovery and microphone-stop lifecycle remain in effect. The previous symptom quick-note entry continues to open its existing form.

## Verification

- Typecheck and production build passed, including body/avatar assets, viewport, auth-build and install checks.
- Client suite: **585/585**, with `TZ=Asia/Shanghai`. The initial UTC run failed 12 date-dependent assertions; no application date logic was changed.
- Related nurse, journal and consultation server suite: **49/49**.
- New homepage browser cases: **16/16** across 320, 375, 390 and 430 pixels. They cover placement, old-entry retention, text-to-review-to-single-record save, denied-microphone recovery, one-time voice intent, reload, retained conversation and stale account/member intent.
- Existing nurse browser regressions: 11 passed initially; the five failed cases passed on rerun after fixing test timezone and sequencing the build before browser verification. The initial failures were four timezone assertions and one temporary missing build asset during overlapping build/test work.
- Browser and AI-provider test fixtures run only in the isolated test server. This change made **zero real inference requests**. The real-time supplier and physical iPhone Safari audio path were **not retested**.
- `git diff --check` passed.

Commands:

```sh
npm run build
TZ=Asia/Shanghai npm run test:client
node --test server/ai/nurse-service.test.mjs server/events/journal-metadata.test.mjs server/consultations/online-consultation-service.test.mjs
node node_modules/@playwright/test/cli.js test --config tests/ai-nurse/home-entry.config.ts
```

`HOOOHO_CHROMIUM_PATH` may point the homepage browser runner to an installed Chromium executable. The committed runner uses Asia/Shanghai explicitly.

## Screenshots

These are actual application captures using a fictional member and the isolated test provider, rather than production acceptance screenshots.

![Homepage, 390px](home-nurse-dialogue/screenshots/home-390.png)
![Existing nurse conversation, 390px](home-nurse-dialogue/screenshots/conversation-390.png)

## Release

Local implementation and verification are complete. Commit/push, main integration and the mandatory Staging/Production deployment checks must be recorded from their actual results; this document does not assert that the feature is live.

Before release, read-only checks found Production health and homepage HTTP 200. The Staging health request timed out; a successful existing Railway commit status is deployment metadata, not browser acceptance. Railway account access is not currently connected in this Work session.
