# Body locator browser verification

Current owner-approved graphical locator (2026-10-30):

```sh
npm run build
npx playwright test --config tests/body-locator/graphical.config.ts
```

Uses an isolated local account and temporary server data, without AI provider calls or Production writes. Covers four mobile widths, direct image targets, inline view controls, faint boundaries, model variants, retry/cancel, real local persistence, reopening/clearing and historical snapshot retention.

`body-locator.spec.ts` and `interaction.spec.ts` describe the superseded label/dictionary-drawer design. Their original configs remain historical; they are not the acceptance target for the approved graphical redesign. Frozen asset and dictionary integrity continue to run through `npm run build` and the client tests.

In the constrained executor only, `PLAYWRIGHT_CHROMIUM_EXECUTABLE` selects a local headless Chromium via CDP and supplies built JS/CSS from disk. Application/API code and persistence still run on the isolated server; CI leaves this option unset and uses standard Playwright transport.
