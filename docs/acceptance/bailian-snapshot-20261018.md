# Bailian same-model snapshot repair — 2026-10-18

Base: `origin/main` at `48a10c94bf809d900475384b08d32f666d2a4a58`, clean isolated branch `fix/bailian-snapshot-20261018`.

The product owner approved fixing the preceding diagnosis directly, including Staging acceptance followed by Production release. The text/image model remains Qwen3.7 Plus; pin its functionally equivalent `qwen3.7-plus-2026-05-26` snapshot. Preserve ASR/TTS, credentials, Beijing endpoint, quota/billing settings, schemas, factual validation, user data and all UI.

Acceptance checklist:

- Pin the backend default and example configuration; retain explicit configured overrides without automatic supplier/model fallback.
- Update the existing adapter and persisted-provenance assertions; run relevant provider/business tests and production build.
- Commit, push and integrate the exact focused change into canonical `Hoooho-app/hoooho.app` main.
- Apply text/image model variables to Staging, deploy the integrated commit, and verify real text/image organization plus saving with disposable synthetic data.
- Only after Staging acceptance, apply the same variables to Production, deploy and repeat real acceptance. Physical iPhone/Safari verification remains separate.

Diagnosis: a minimal request from the Production container with its existing Key and Beijing endpoint returned 403 `insufficient_quota` for `qwen3.7-plus` (1208 ms, request `d9d5c277-73f2-9dd4-8672-ca0ceda2f6c5`); the equivalent snapshot returned 200 and `OK` (2287 ms, request `4808309d-52d9-939b-48ee-443d2f10f27d`). This demonstrates a model-ID-dependent quota difference, not its undocumented internal cause. These probes alone do not establish full application acceptance.

Official equivalence: https://help.aliyun.com/zh/model-studio/qwen3-7-plus

Release and acceptance results are recorded after verification. No secrets or personal health data belong in this document.

## Completed release

PR #475 merged as `bd14cca9972056640792dca9e3f0cfaa1bdcd8e4`; merged source matched the tested local files. Both environments have `BAILIAN_MODEL` and `BAILIAN_VISION_MODEL` set to `qwen3.7-plus-2026-05-26`. No credential, endpoint, ASR/TTS, quota/billing or UI changes were made.

- Local checks: 201 provider/business/ASR/transport tests and 29 recognition/front-desk tests passed; production build passed.
- GitHub Smart record verification run `39064701701`: SUCCESS, including mobile browser regression.
- Staging deployment `003080be-2ca7-4311-af77-a571d9b0c991`: SUCCESS.
- Production deployment `6f8dd112-d222-4257-98e6-3d0fd3e3e645`: SUCCESS, after Staging acceptance.

| Environment | Text ready in mobile browser | Image OCR + extraction | Result |
| --- | ---: | ---: | --- |
| Staging | 8369 ms | 7115 ms | PASS |
| Production | 11880 ms | 6807 ms | PASS |

These are single synthetic acceptance observations with different timing boundaries, not a latency benchmark. Text acceptance used the existing real browser flow: one injury/visit incident, doctor wording and observation instructions retained, exact recording clock, review/save/readback, date-dot behavior and 320/375/390 px calendar layout. Image acceptance used a clearly legible synthetic feeding note through the real upload/OCR/extraction API, verified the feeding category and 120 mL source quantity, confirmed the date, saved and read back one record, checked save idempotency and located the exact saved record ID in the mobile calendar. All disposable test members were removed.

The initial image browser assertion expected `120` in the compact calendar row and timed out after OCR/extraction/save/readback had passed. The existing approved row displays a short title, so the assertion was corrected to locate the exact persisted record ID; quantity remains checked in structured extraction and persisted records. The corrected Staging and Production runs passed. No product UI change was made to satisfy this assertion.

Production extraction requests include text `bc1f1c85-d6b9-9366-a984-5323c833fa92` and image `c7269f26-9c24-9d52-aa9b-46a23b2295c2`; both identify the pinned snapshot. No 403 occurred in these acceptance calls. Other model-assisted business surfaces were not individually live-tested in this narrow configuration repair. Physical iPhone/Safari verification remains NOT_VERIFIED.

Rollback: the preceding Production deployment is `c53ad271-74e6-466e-a92f-c5000952e966` (`93d49cb7e6ecce4756fe7481ef8073eda4f3e456`), but restoring its floating model alias would restore the observed quota blocker. Do not silently switch suppliers/models or alter paid-use settings.
