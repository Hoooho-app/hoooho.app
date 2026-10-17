# 症状跟进精修验收

Base: `2952a79a5dde3694fd6f657fec5d6b7d9e5d110c` (`origin/main`).
Branch: `codex/symptom-followup-refinement-20261017`. Initial worktree clean.
User approved the interactive mockup and explicitly authorized implementation and deployment.

## Scope and checklist

- [ ] 症状跟进卡片统一使用症状描述的 Lucide Cross（1.8 stroke）。
- [ ] 症状标题和过程摘要提炼核心短句、只占一行；完整原文可展开查看。
- [ ] 历史记录使用相同只读展示规则，保留原始存储内容，不进行数据迁移。
- [ ] 编辑仅文字；编辑和展开/收起为 400 字重。
- [ ] 最近更新、首次记录移入变化过程底部，以弱化文字显示，无横线区隔。
- [ ] 变化过程默认收起；补充后查看仍返回对应症状并展开定位。
- [ ] 补充变化、标记已康复、删除底部同一行，触控目标至少 44px。
- [ ] 320/375/390/430px 浏览器验证；编辑、归档恢复、删除及原文查看回归。
- [ ] Build、语义短句单测、智能记录相关回归通过。
- [ ] Commit/push/PR/main → Railway Staging 验证 → Production 验证。

## Frozen boundaries

Only the symptom follow-up surface and its direct presentation/test dependencies change. Home, journal, AI/parser, APIs, data models, stored narratives, chronology and other page flows remain unchanged. Use Design System V2 tokens/components. Physical iPhone/Safari is not covered by Chromium emulation.

## Delivery evidence

Pending implementation and checks.
