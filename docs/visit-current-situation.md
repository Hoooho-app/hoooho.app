# 就诊情况单：目前情况

此投影只使用已保存资料，不触发 AI。`currentSituation` 提供描述、带来源的症状/饮食/发生变化/已做处理与完整原话。已整理事实仅在原引用可核对、记录版本一致、属于当前成员且不是被替代、未来或条件事实时展示。阴性观察与家属猜测保留完整原引用；没有结构化事实的旧记录保守显示原描述，不猜测分块。

`PUT /api/members/:memberId/visit-sheet` 兼容原请求，可选 `currentSituation: {scopeKey, block, text}`，block 为 description / symptoms / diet，最多 5000 字。沿用 expectedVersion、requestId、账户事务和成员权限；当前焦点或版本不匹配时拒绝补丁。局部修改保存到 `currentSituationEdits[photoKey]`，换焦点不套用另一情况的修改，切回恢复。旧 caseDetails 描述按原焦点兼容迁入；原记录不修改。复制和离线 HTML 使用同一份展示内容。

`GET /api/members/:memberId/visit-sheet/temperature` 是只读接口，沿用情况单成员权限，返回 `{from,to,points:[{sourceId,at,value}]}`。查询当前成员全部来源，不受情况单选择范围影响；复用既有测量提取校验，上海周一 00:00 到下周一，排除删除、无数值、未知发生时间、范围外和未来记录，按记录身份去重并按实际时间排序。读取未能确认时失败，不把不可用当成空记录。前端加载/失败期间隐藏入口，有两条不同记录才显示。刷新、成员/版本变化、窗口恢复与可见页定时刷新更新资格；失去资格时关闭弹层。

附件仍使用原上传草稿、选择、元数据和预览服务，文件类型与限制未扩展。取消选择仅调整本次展示，原随记附件保留。温度弹层复用 BottomSheetSurface 与 FactLineChart，普通折线、点值、焦点/背景锁定和底部安全区；局部样式不影响其他弹层或章节。

验证入口：`node --test server/visit-sheets/*.test.mjs`、`npm run test:client`、`npm run build`、`playwright test -c tests/visit-sheet/current-situation.config.ts`。浏览器夹具只用于隔离测试服务，绝不写入生产成员记录。
