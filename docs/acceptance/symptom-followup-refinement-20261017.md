# 症状跟进精修验收

Base: `2952a79a5dde3694fd6f657fec5d6b7d9e5d110c` (`origin/main`).
Branch: `codex/symptom-followup-refinement-20261017`. Initial worktree clean.
User approved the interactive mockup and explicitly authorized implementation and deployment.

## Scope and checklist

- [x] 症状跟进卡片统一使用症状描述的 Lucide Cross（1.8 stroke）。
- [x] 症状标题和过程摘要提炼核心短句、只占一行；完整原文可展开查看。
- [x] 历史记录使用相同只读展示规则，保留原始存储内容，不进行数据迁移。
- [x] 编辑仅文字；编辑和展开/收起为 400 字重。
- [x] 最近更新、首次记录移入变化过程底部，以弱化文字显示，无横线区隔。
- [x] 变化过程默认收起；补充后查看仍返回对应症状并展开定位。
- [x] 补充变化、标记已康复、删除底部同一行，触控目标至少 44px。
- [x] 320/375/390/430px 浏览器验证；编辑、归档恢复、删除及原文查看回归。
- [x] Build、语义短句单测、智能记录相关回归通过。
- [x] Commit/push/PR/main → Railway Staging 验证 → Production 验证。

## Frozen boundaries

Only the symptom follow-up surface and its direct presentation/test dependencies change. Home, journal, AI/parser, APIs, data models, stored narratives, chronology and other page flows remain unchanged. Use Design System V2 tokens/components. Physical iPhone/Safari is not covered by Chromium emulation.

## Delivery evidence

- PR: https://github.com/Hoooho-app/hoooho.app/pull/442; merged application commit `9307d089bafe4e3eeae4494a4dda5fb469478854`.
- Local: production build, 3 presentation unit tests, 18 case-continuity tests passed. CI re-ran the production build on the PR merge candidate.
- CI: https://github.com/Hoooho-app/hoooho.app/actions/runs/39014790691 — success; 124 backend tests, 3 presentation tests, 4 focused browser scenarios and 22 smart-record browser regressions passed. Mobile widths: 320/375/390/430px. Synthetic screenshots retained in the workflow artifact.
- The raw-save failure test was corrected to locate the returned record ID rather than assume that an unknown occurrence time sorts ahead of known times; chronology remains unchanged.
- Staging deployment `ae364171-5c78-4ed6-9bc4-ab0624230cc2`: SUCCESS on `9307d089bafe4e3eeae4494a4dda5fb469478854`; health OK, built entry commit and refined case chunk verified; one healthy replica, no warnings/criticals. Browser reached the normal login page; authenticated mobile interactions were covered by CI with synthetic records.
- Production deployment `0e5bcb6e-ae45-4939-91bd-31d2b72bfffb`: SUCCESS on concurrent main descendant `edf3e26ad356777f42be0a98b4af661c904ffd6a`. Its parent is the approved follow-up commit; its additional diff concerns daily-record controls and does not modify the follow-up surface. Preserved the concurrent release rather than reverting its source.
- Production health OK; built entry commit and refined case chunk verified. One healthy replica, no pending work, no warnings/criticals.
- Live https://hoooho.com/cases checked in the existing signed-in browser: new Cross icons, short one-line historical titles, zero edit icons, edit/expand weights 400, timelines initially absent, dates present only inside the expanded timeline with 0px borders, complete original accessible, archived records also normalized. No user record edits/status changes/deletions were performed. Browser service-worker cache switched to the current entry after a normal reload; the ordinary /cases URL was rechecked.
- No stored original records were rewritten. The API snapshot preservation browser test passed.
- Design mockup approved before execution. Product-owner feedback on the deployed result remains with the user; no claim of final visual acceptance. Physical iPhone/Safari not tested.
