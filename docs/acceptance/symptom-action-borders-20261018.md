# 症状事件按钮修复验收

初始基线：`661562b5135e342e779ec2937a0c4d7df168439e`。用户确认“允许部署”后，将未发布补丁干净地接到最新 `origin/main` `ce6c84c77029ea4af751fbf1fb692f4c26e95c57`。

## 范围与验收

- [x] “补充变化 / 标记已康复 / 删除”恢复边框并保持同排；归档的“恢复跟进 / 删除”同样恢复。
- [x] “编辑”与“删除”同为 13px、400 字重。
- [x] 变化过程只保留居中的下拉箭头，展开后朝上；无可见“展开 / 收起”文字。
- [x] 保留无障碍名称、展开状态与至少 44px 触控区域。
- [x] 320 / 375 / 390 / 430px 浏览器验证，保留编辑、补充、归档、恢复、删除、原文与同症状回跳流程。
- [x] Commit / publication / main integration → Railway Staging 验证 → Production 验证。

只修改卡片组件、局部样式和直接测试依赖，使用 Design System V2。未更改 API、模型、数据、时间排序及其他页面业务。

## 测试证据

- 本地完整 production build 和 3 项展示规则测试通过。
- 本地 Chromium 重跑被执行环境的 socket 限制阻止，未将启动失败计为应用测试通过；后续由 GitHub CI 实际执行。
- PR https://github.com/Hoooho-app/hoooho.app/pull/471 已合并，应用提交 `fc2d6e4383dd0b7a67c393a309bb905c95bdddcd`。
- CI https://github.com/Hoooho-app/hoooho.app/actions/runs/39062888374：SUCCESS。185 项后端测试、3 项展示规则测试、4 项症状跟进浏览器场景、23 项智能记录浏览器回归全部通过。
- 专项断言覆盖边框、相同字号、纯箭头、归档态边框和触控尺寸；宽度 320/375/390/430px。已目视核对 CI 的 320px 收起及 430px 展开截图；证据在 workflow artifact `smart-record-browser-evidence`。
- 终端发布在公开仓库与四文件差异核验后通过审批，但缺少命令行凭据；已连接的 GitHub 服务发布了与本地审查内容完全相同的 tree `5c5578a4f4405df9c656cf3108b6db02dcb0f8a0`。

## 发布证据

- Staging：`787679d7-8bc9-4652-bc29-1dbd75ae7fb2`，SUCCESS，实际构建 `fc2d6e4383dd0b7a67c393a309bb905c95bdddcd`。健康接口 200、入口 build commit、编辑小字号、纯箭头、三按钮 secondary 变体及局部 CSS 核验通过；浏览器首屏正常。
- Production：`5ddbd64c-c338-4d52-9fc8-4f99cb21912a`，SUCCESS，实际构建 `93d49cb7e6ecce4756fe7481ef8073eda4f3e456`。该版本是本次应用提交的后代，发布期间合入了其他工作；祖先关系与目标组件/样式零差异已核对，保留并行更新。
- Production 健康接口 200；实际 build commit、页面 chunk 和 CSS 标记全部通过。两环境均为 1 个健康实例，0 告警、0 近期失败、无 pending work。
- 正式域名 https://hoooho.com/cases 已在现有登录态浏览器核验。起初命中旧 service-worker 缓存，正常刷新后入口为 `/assets/index-Bt4mbhd_.js`，与当前线上资源一致。
- 正式页面 4 张活动卡片均核实：底部三按钮同一行、1px solid 边框、高度 44px；删除宽度 44px；编辑与删除同为 13px/400；变化过程按钮无可见文字，仅 1 个箭头，44×44px，保留折叠状态与无障碍名称。
- 线上验证为只读，没有修改、康复或删除用户健康记录，没有调用模型。完整操作回归使用 CI 合成数据。
- 实体 iPhone/Safari 未验证；产品负责人对上线视觉的最终验收仍由用户确认。
