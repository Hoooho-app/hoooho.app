# 症状事件按钮修复

Initial base: `661562b5135e342e779ec2937a0c4d7df168439e` (`origin/main`). Resumed on latest `origin/main` `ce6c84c77029ea4af751fbf1fb692f4c26e95c57` after the user's explicit deployment authorization; the unpushed patch rebased cleanly.
Branch: `fix/symptom-action-borders-20261018`; isolated worktree initially clean.

## Acceptance checklist

- [x] 恢复“补充变化 / 标记已康复 / 删除”及归档“恢复跟进 / 删除”的按钮边框，保持同一行。
- [x] “编辑”字号与“删除”一致，保留常规字重。
- [x] 变化过程只显示一个居中的下拉箭头按钮，展开后箭头朝上，不显示“展开 / 收起”文字。
- [x] 保留按钮的无障碍名称、展开状态及至少 44px 触控区域。
- [x] 在 320 / 375 / 390 / 430px 浏览器宽度核对外观和操作，运行构建及现有症状跟进回归。
- [ ] Commit / push / main integration → Railway Staging 验证 → Production 验证。

## Scope

Only `CaseFollowupCard.tsx`, its scoped styles, direct browser regression assertions and this acceptance record. Preserve existing copy, data, API/model behavior, chronology, supplement/edit/archive/restore/delete flows and all other pages. Reuse Design System V2 button variants and type tokens. Physical iPhone/Safari is outside Chromium emulation; product-owner acceptance remains with the user.

## Evidence

- Production build passed, including typecheck, asset, viewport, auth-build and installation checks.
- 3 follow-up presentation unit tests and all 4 existing symptom-followup browser scenarios passed.
- Existing browser coverage exercised same-row controls at 320/375/390/430px, edit, expand, supplement return, archive/restore, delete and unchanged original records. Visually inspected the generated 320px folded and 430px expanded screenshots.
- Source diff is limited to shared button variants/sizes on this card and scoped touch-target/arrow padding styles; no API or data changes.
- BLOCKED before push/main integration: automatic approval review rejected `git push -u origin fix/symptom-action-borders-20261018`, stating that explicit authorization to publish code to the external GitHub destination was missing. Rechecked repository metadata (public, current account has push/admin access) and the complete three-file diff (UI-only code and this acceptance note), then retried the same push; review still rejected it for missing explicit user authorization. No alternate upload path was attempted. Remote branch lookup returned no branch. Staging/Production remain on their prior release.
- User subsequently explicitly confirmed “允许部署”; repository push, main integration and the staged Railway release are now authorized.
- Resumed production build passed on the latest main base. The local browser rerun was blocked before test execution by the environment's Chromium socket restriction (`Operation not permitted`), not an application assertion failure. Added direct border/font/arrow assertions to the existing focused browser suite so the existing GitHub CI workflow runs the current release candidate.
