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
