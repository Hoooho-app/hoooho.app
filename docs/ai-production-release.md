# AI business Production release — 2026-10-01

The user's latest explicit authorization supersedes the earlier no-deploy scope
in `ai-business-integration.md`: Production only; no Staging deployment or changes.

## Recorded baseline and rollback

- Project: `d8855fe3-c785-4b8c-825b-bdb10a941850`
- Service: `aa308ba0-d7da-4771-9c94-ccdcd110f636` (`hoooho.app`)
- Environment: `production` (`68b9b73f-1401-4658-a315-6d333ec31728`)
- Source: `Hoooho-app/hoooho.app`, remote `main`
- Domain: `https://hoooho.com`
- Baseline recorded at `2026-10-01T13:29:47.7261141Z`
- Successful deployment: `588bad86-eb41-4771-b08d-ef0db4433caa`
- Baseline commit: `484e902de67def57b2e01c17cfab9ed967450374`
- Persistent data mount: `/data`; no migration, reset or user-data rewrite.

A detached checkout of the exact baseline has been prepared at
`D:\projects\hoooho\.worktrees\ai-production-rollback-20261001`.
If this release breaks existing business, execute in that directory:

```powershell
railway up -p d8855fe3-c785-4b8c-825b-bdb10a941850 -s aa308ba0-d7da-4771-9c94-ccdcd110f636 -e production --detach --message rollback-to-484e902d
```

This redeploys the exact previous source, retaining the current volume and server
environment. Never use `--no-gitignore`. After rollback, verify health, source
revision and affected interfaces; revert the release on main separately before
future releases. `railway deployment redeploy` only redeploys the latest build
and is not the old-version rollback command.

## Credentials and explicit-call boundary

The previously authorized Hoooho key was written with CLI stdin to Production
`OPENAI_API_KEY`, with `--skip-deploys`. No key argument, raw env dump, frontend
setting, Git secret, new key, payment change or Staging mutation was used.
Models: `gpt-5-mini` (summary/draft/vision), `gpt-4o-mini-transcribe` (ASR),
`gpt-4o-mini-tts` (speech). Configuration was compared in memory; only boolean
verification was output. Keys determine project ownership; no unverified project
or organization ID is asserted.

Ordinary manual-record organization now explicitly selects LocalFactProvider
even with a configured key. Existing explicit AI business routes remain unchanged.
This prevents an incidental paid request on manual saves and keeps offline/local
facts independent of quota. A regression test exercises a configured-key case
with an upstream function that must never be called.

## Release checks and actual acceptance

Before the final isolation change: client 554/554, server 198/198, guest 21/21,
business 31/31, visit-sheet 36/36, AI business mobile 6/6 and medical-summary
mobile 1/1; typecheck and Production build passed. After the isolation change:
server/business/visit-sheet regression suites and Production build passed again.
Parser evaluation: 30/30 cases, expected facts 48/48; no parser-rule change or
reported regression. Lint: no project lint command. Git diff validation uses
scoped `cr-at-eol` because the existing main files contain CRLF.

The final phone rerun initially failed before reaching application actions:
Windows rejected the auxiliary Vite listener on port 4197 (`EACCES`), which also
terminated the fixture control listener. The fixture server now accepts a
test-only `VISIT_E2E_DEV_PORT` override; using bind-verified 4297 recovered the
6/6 business and 1/1 medical-summary mobile tests. No production port changed.

`scripts/verify-ai-production.mjs` is an opt-in external verifier, never imported
by the production server. It uses actual HTTPS app interfaces with a fresh
dedicated account and fictional child, iPhone SE emulation, and zero retries.
Summary costs one request; single-page OCR plus combined text/report extraction
costs two; ASR and TTS cost one each. First failure stops all further model calls.
Actual run results and screenshots are in ignored `outputs/ai-production-20261001`.
Local unit/E2E test substitutes are not production acceptance evidence.

Authenticated cleanup removes only this run's records, events, draft and fictional
member. Full account/report-history deletion requires the existing verified
identity deletion flow. Do not bypass it by minting tokens or directly overwriting
live multi-user JSON stores. Report any retained isolated account/history truthfully.

ABC percentage remains incomplete: the required scoring formula is not defined;
source-backed inputs and missing-field indications work without fabricated scores.
The five high-severity dependency audit entries remain separately documented in
`ai-business-integration.md`; this release does not run automatic dependency fixes.
