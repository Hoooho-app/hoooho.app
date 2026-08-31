# Hoooho 快捷记录事实链路独立验收报告

## 1. 最终结论

- 测试任务交付状态：**DONE**
- 产品验收结论：**FAIL**
- 65 个正式用例：20 PASS / 16 PARTIAL / 29 FAIL / 0 BLOCKED
- 严格 PASS：20/65（30.8%），远低于 90% 门槛
- 缺陷簇：P0 0 / P1 6 / P2 4
- 判定要点：跨人物、假设/问句、幂等、离线和真正未来时间门禁通过；但仍有显式否定反转、状态链丢失、语义时间错误、多事实丢失与纠正关系缺失。

## 2. 测试基线

- 仓库：Hoooho-app/hoooho.app
- 测试分支：codex/independent-symptom-tracking-acceptance
- 代码基线：858bac329ec6e75f4bd553963c71be99f2ad7f16（执行开始时与 origin/main 一致）
- Staging：https://hooohoapp-staging.up.railway.app；健康检查 200；部署 49dfade9-7405-4262-ac3a-adaa8efa37d8 / SUCCESS；镜像 sha256:b4d067…；标签 deploy b54067c fact pipeline final
- Staging 静态资源：/assets/index-9ieQxQx4.js，/assets/index-mk0_RvKK.css
- 浏览器：Google Chrome 151.0.7922.174，Playwright Core 独立上下文
- 设备：iPhone SE，375×667，DPR 2，竖屏
- 时区：Asia/Shanghai
- 执行时间：2026-08-31T03:40:39.779Z ～ 2026-08-31T04:13:12.302Z
- 账号：全新虚构 Staging 账号（redacted-fictional-phone）；人物：测试宝宝A、测试成人B、测试老人C

## 3. 与修复方回归的独立性

没有复用旧账号、旧 Token、旧事件、浏览器缓存或修复方宽松断言。65 条均通过 Staging 真实页面文字入口、Preview API、Confirm API、刷新后的 Records/Organizations 与最终 UI 执行；每条使用独立事件。独立预期逐字段覆盖人物、实体、极性、状态、属性、时间、关系和 UI。开发侧 65/65、314/314 等结果未作为本报告通过证据。

## 4. 65 个正式用例结果

| Case | 人物 | 结果 | 主要差异 |
|---|---|---|---|
| ST-01 | 测试宝宝A | PARTIAL | UI 错误显示 00:00 |
| ST-02 | 测试宝宝A | PARTIAL | 侧别:right；UI 缺少 小腿；UI 缺少 右 |
| ST-03 | 测试宝宝A | PARTIAL | 程度:severe |
| ST-04 | 测试宝宝A | PARTIAL | UI 错误显示 00:00 |
| ST-05 | 测试宝宝A | PARTIAL | UI 错误显示 00:00 |
| ST-06 | 测试宝宝A | PARTIAL | 实体:腹痛；部位:腹部；持续:2小时；UI 缺少 腹痛；UI 缺少 腹部 |
| ST-07 | 测试宝宝A | PARTIAL | UI 错误显示 00:00 |
| ST-08 | 测试宝宝A | PARTIAL | 程度:mild |
| ST-09 | 测试宝宝A | PASS | 无 |
| ST-10 | 测试宝宝A | PARTIAL | 实体:咽喉痛；部位:咽喉；UI 缺少 咽喉痛；UI 缺少 咽喉 |
| ST-11 | 测试宝宝A | PARTIAL | 侧别:left；侧别:right；UI 缺少 肩；UI 缺少 左；UI 缺少 小腿；UI 缺少 右 |
| ST-12 | 测试宝宝A | FAIL | 时间距提交:10分钟内 |
| FILTER-01 | 测试宝宝A | PASS | 无 |
| FILTER-02 | 测试宝宝A | PASS | 无 |
| FILTER-03 | 测试宝宝A | PASS | 无 |
| FILTER-04 | 测试宝宝A | PASS | 无 |
| FILTER-05 | 测试宝宝A | PASS | 无 |
| CTX-01 | 测试宝宝A | PASS | 无 / 无 |
| CTX-02 | 测试宝宝A | FAIL | 程度:severe；解析小时:10 / 无 |
| CTX-03 | 测试宝宝A | PARTIAL | 实体:腹痛；部位:腹部；UI 缺少 腹痛；UI 缺少 腹部 / Preview 409: [REDACTED] 请说明是哪一个症状发生了变化。 |
| CTX-04 | 测试宝宝A | FAIL | 实体:腹痛；部位:腹部；UI 缺少 腹痛；UI 缺少 腹部 / 无实际事实；UI 缺少 腹痛 |
| CTX-05 | 测试宝宝A | FAIL | 无 / 无 / 无实际事实；预期健康事实未保存 |
| CTX-06 | 测试宝宝A | FAIL | 原始时间:三天前；解析日期:2026-08-28 / 无 / 无 |
| NEG-01 | 测试宝宝A | PARTIAL | UI 错误显示 00:00 |
| NEG-02 | 测试宝宝A | PASS | 无 |
| NEG-03 | 测试宝宝A | PASS | 无 |
| NEG-04 | 测试宝宝A | PARTIAL | 无实际事实；预期健康事实未保存 |
| NEG-05 | 测试宝宝A | FAIL | 极性:affirmed；侧别:right；实体:左腿疼痛纠正；类型:status_change；变化:corrected；纠正关系；UI 缺少 腿；UI 缺少 右；UI 缺少 左腿疼痛；UI 缺少 左 |
| NEG-06 | 测试宝宝A | FAIL | 无实际事实 |
| NEG-07 | 测试宝宝A | FAIL | 原始时间:昨天晚上；解析日期:2026-08-30；出现 1 条禁用事实 |
| NEG-08 | 测试宝宝A | PARTIAL | 无 |
| SPEECH-01 | 测试宝宝A | PASS | 无 |
| SPEECH-02 | 测试宝宝A | PASS | 无 / 无 |
| SPEECH-03 | 测试宝宝A | PASS | 无 / 无 |
| SPEECH-04 | 测试宝宝A | PASS | 无 / 无 |
| SPEECH-05 | 测试宝宝A | FAIL | 实体:咳嗽加重；类型:status_change；极性:uncertain；变化:worsened；目标:咳嗽 |
| SPEECH-07 | 测试宝宝A | FAIL | 实体:咳嗽加重；类型:status_change；变化:worsened；目标:咳嗽；时间距提交:10分钟内 |
| SPEECH-08 | 测试老人C | PARTIAL | UI 错误显示 00:00 |
| TIME-01 | 测试宝宝A | FAIL | 程度:severe；时间距提交:10分钟内 |
| TIME-02 | 测试宝宝A | FAIL | 部位:腹部；解析小时:23；UI 缺少 腹部 |
| TIME-03 | 测试宝宝A | FAIL | 解析小时:23；解析分钟:30 / 解析小时:1；实体:发热持续；类型:status_change；变化:persistent；目标:发热 |
| TIME-04 | 测试宝宝A | PARTIAL | 持续:3天 |
| TIME-06 | 测试宝宝A | PASS | 无 |
| TIME-07 | 测试成人B | FAIL | 极性:affirmed；频率:跑步；频率:不跑 |
| TRACK-01 | 测试宝宝A | FAIL | 解析小时:8 / 解析小时:10；实体:发热加重；类型:status_change；变化:worsened；目标:发热 / 无实际事实 / 解析小时:15 / 解析小时:20 |
| TRACK-02 | 测试宝宝A | FAIL | 无 / 实体:咳嗽加重；类型:status_change；变化:worsened；目标:咳嗽 / 频率:几分钟 / 频率:occasional；次数:2 / 无 |
| TRACK-03 | 测试成人B | FAIL | 实体:腹痛；部位:腹部；评分:3；UI 缺少 腹痛；UI 缺少 腹部 / 实体:腹痛加重；目标:腹痛；评分:6；解析小时:11；UI 缺少 腹痛 / 实体:腹痛未加重；极性:affirmed；目标:腹痛；评分:6；UI 缺少 腹痛 / 实体:腹痛改善；目标:腹痛；评分:2；UI 缺少 腹痛；UI 缺少 2 |
| TRACK-04 | 测试宝宝A | FAIL | 解析小时:1 / 实体:呕吐复发；类型:status_change；变化:recurred；目标:呕吐；解析小时:3 / 无 / 实体:呕吐复发；类型:status_change；变化:recurred；目标:呕吐；解析小时:16 |
| TRACK-05 | 测试宝宝A | FAIL | 程度:mild / 实体:发热消失；类型:status_change；变化:resolved；目标:发热；实体:咳嗽加重；变化:worsened；目标:咳嗽 / 极性:negated；状态:resolved；实体:咳嗽持续；变化:persistent；目标:咳嗽；频率:frequent；出现 2 条禁用事实 |
| TRACK-06 | 测试成人B | FAIL | 实体:恶心；UI 缺少 恶心 / 实体:恶心消失；类型:status_change；变化:resolved；目标:恶心；实体:头痛持续；变化:persistent；目标:头痛；UI 缺少 恶心 / 实体:头痛改善；类型:status_change；变化:improved；目标:头痛 |
| TRACK-07 | 测试宝宝A | FAIL | UI 缺少 肚脐周围 / UI 缺少 右下腹；UI 缺少 右 / 实体:肚脐周围疼痛消失；类型:status_change；变化:resolved；部位:肚脐周围；实体:右下腹疼痛持续；变化:persistent；UI 缺少 肚脐周围疼痛；UI 缺少 肚脐周围；UI 缺少 右下腹疼痛；UI 缺少 右下腹；UI 缺少 右 |
| TRACK-08 | 测试宝宝A | FAIL | UI 缺少 胳膊；UI 缺少 左 / 实体:皮疹纠正；类型:status_change；变化:corrected；UI 缺少 胳膊；UI 缺少 右 |
| TRACK-09 | 测试老人C | FAIL | UI 缺少 咽喉痛；UI 缺少 咽喉 / 实体:咽喉痛未变；变化:unchanged；目标:咽喉痛；UI 缺少 咽喉痛 / 实体:咽喉痛持续未加重；极性:affirmed；变化:persistent；目标:咽喉痛；UI 缺少 咽喉痛未加重 |
| TRACK-10 | 测试成人B | FAIL | 无 / 实体:头痛；状态:resolved / 无 |
| TRACK-11 | 测试老人C | FAIL | 无 / 实体:腹泻改善；类型:status_change；变化:improved；目标:腹泻 / 实体:腹泻持续改善；类型:status_change；变化:persistent；目标:腹泻；UI 缺少 腹泻改善 |
| TRACK-12 | 测试宝宝A | FAIL | 无 / 实体:鼻塞持续；类型:status_change；变化:persistent；目标:鼻塞 / 部位:咽喉；UI 缺少 咽喉痛；UI 缺少 咽喉 |
| PERSON-01 | 测试宝宝A | PASS | Preview 409: [REDACTED] 这条情况不属于测试宝宝A，请切换到正确的记录对象。 |
| PERSON-02 | 测试宝宝A | PASS | Preview 409: [REDACTED] 这段话包含多个人的情况，请分别记录。 |
| PERSON-03 | 测试宝宝A | PASS | 无 |
| PERSON-04 | 测试成人B | PASS | 无 |
| UI-01 | 测试宝宝A | PASS | 无 |
| UI-06 | 测试宝宝A | PASS | 无 |
| UI-07 | 测试宝宝A | FAIL | 解析小时:10 / 解析小时:10；解析分钟:30 |
| TIME-05 | 测试宝宝A | FAIL | 无实际事实；UI 缺少 咳嗽；Preview 400: FUTURE_OCCURRED_AT 发生时间不能晚于现在，请修改后重试。；预期健康事实未保存 |
| TIME-08 | 测试老人C | FAIL | 无实际事实；UI 缺少 头痛；Preview 400: FUTURE_OCCURRED_AT 发生时间不能晚于现在，请修改后重试。；预期健康事实未保存 |

### ST-01 — PARTIAL

- 当前人物：测试宝宝A（child）
- 原始输入：今天开始咳嗽。
- 执行输入：今天开始咳嗽。
- 用例预期：咳嗽阳性，人物为测试宝宝A，时间为今天；日期级 UI 不得伪装成 00:00。
- 严格结果：未满足全部字段

#### Step 1

- 输入：今天开始咳嗽。
- 完整预期：{"facts":[{"name":"咳嗽","polarity":"affirmed","type":"symptom","status":"active","timeRaw":"今天"}],"minFacts":1,"maxFacts":1,"uiForbid":["00:00"]}
- Preview：HTTP 200；{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"今天","resolvedStart":"2026-08-31T00:00:00+08:00","resolvedEnd":"2026-09-01T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"今天","resolvedStart":"2026-08-31T00:00:00+08:00","resolvedEnd":"2026-09-01T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：不满足：{"pass":false,"missing":[],"forbidden":["00:00"]}
- 失败/差异：UI 错误显示 00:00
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/ST-01/ST-01-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/ST-01/ST-01-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/ST-01/ST-01-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/ST-01/ST-01-step-01-refresh.png

### ST-02 — PARTIAL

- 当前人物：测试宝宝A（child）
- 原始输入：右边小腿疼。
- 执行输入：右边小腿疼。
- 用例预期：右侧小腿疼痛；小腿粒度和右侧均不可丢失。
- 严格结果：未满足全部字段

#### Step 1

- 输入：右边小腿疼。
- 完整预期：{"facts":[{"name":"疼痛","polarity":"affirmed","type":"symptom","bodyPart":"小腿","laterality":"right"}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"疼痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"小腿","laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:43:52.427Z","resolvedStart":"2026-08-31T11:43:52+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"疼痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"小腿","laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:43:52.427Z","resolvedStart":"2026-08-31T11:43:52+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：不满足：{"pass":false,"missing":["小腿","右"],"forbidden":[]}
- 失败/差异：侧别:right；UI 缺少 小腿；UI 缺少 右
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/ST-02/ST-02-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/ST-02/ST-02-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/ST-02/ST-02-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/ST-02/ST-02-step-01-refresh.png

### ST-03 — PARTIAL

- 当前人物：测试宝宝A（child）
- 原始输入：头疼得比较厉害。
- 执行输入：头疼得比较厉害。
- 用例预期：头痛且程度为比较厉害/严重。
- 严格结果：未满足全部字段

#### Step 1

- 输入：头疼得比较厉害。
- 完整预期：{"facts":[{"name":"头痛","polarity":"affirmed","type":"symptom","severity":"severe"}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"头痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"头","laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:44:04.438Z","resolvedStart":"2026-08-31T11:44:04+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"头痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"头","laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:44:04.438Z","resolvedStart":"2026-08-31T11:44:04+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：程度:severe
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/ST-03/ST-03-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/ST-03/ST-03-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/ST-03/ST-03-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/ST-03/ST-03-step-01-refresh.png

### ST-04 — PARTIAL

- 当前人物：测试宝宝A（child）
- 原始输入：今天偶尔会咳两声。
- 执行输入：今天偶尔会咳两声。
- 用例预期：咳嗽、偶发频率、两声次数信息全部保留；日期级 UI 不得伪装成 00:00。
- 严格结果：未满足全部字段

#### Step 1

- 输入：今天偶尔会咳两声。
- 完整预期：{"facts":[{"name":"咳嗽","polarity":"affirmed","type":"symptom","frequency":"occasional","occurrenceCount":2,"timeRaw":"今天"}],"minFacts":1,"maxFacts":1,"uiForbid":["00:00"]}
- Preview：HTTP 200；{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":"occasional","occurrenceCount":2,"duration":null,"temperature":null,"time":{"raw":"今天","resolvedStart":"2026-08-31T00:00:00+08:00","resolvedEnd":"2026-09-01T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":"occasional","occurrenceCount":2,"duration":null,"temperature":null,"time":{"raw":"今天","resolvedStart":"2026-08-31T00:00:00+08:00","resolvedEnd":"2026-09-01T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：不满足：{"pass":false,"missing":[],"forbidden":["00:00"]}
- 失败/差异：UI 错误显示 00:00
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/ST-04/ST-04-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/ST-04/ST-04-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/ST-04/ST-04-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/ST-04/ST-04-step-01-refresh.png

### ST-05 — PARTIAL

- 当前人物：测试宝宝A（child）
- 原始输入：今天吐了三次。
- 执行输入：今天吐了三次。
- 用例预期：呕吐三次；日期级 UI 不得伪装成 00:00。
- 严格结果：未满足全部字段

#### Step 1

- 输入：今天吐了三次。
- 完整预期：{"facts":[{"name":"呕吐","polarity":"affirmed","type":"symptom","occurrenceCount":3,"timeRaw":"今天"}],"minFacts":1,"maxFacts":1,"uiForbid":["00:00"]}
- Preview：HTTP 200；{"name":"呕吐","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":3,"duration":null,"temperature":null,"time":{"raw":"今天","resolvedStart":"2026-08-31T00:00:00+08:00","resolvedEnd":"2026-09-01T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"呕吐","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":3,"duration":null,"temperature":null,"time":{"raw":"今天","resolvedStart":"2026-08-31T00:00:00+08:00","resolvedEnd":"2026-09-01T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：不满足：{"pass":false,"missing":[],"forbidden":["00:00"]}
- 失败/差异：UI 错误显示 00:00
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/ST-05/ST-05-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/ST-05/ST-05-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/ST-05/ST-05-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/ST-05/ST-05-step-01-refresh.png

### ST-06 — PARTIAL

- 当前人物：测试宝宝A（child）
- 原始输入：肚子已经疼了两个小时。
- 执行输入：肚子已经疼了两个小时。
- 用例预期：腹痛，部位为腹部，持续两小时。
- 严格结果：未满足全部字段

#### Step 1

- 输入：肚子已经疼了两个小时。
- 完整预期：{"facts":[{"name":"腹痛","polarity":"affirmed","type":"symptom","bodyPart":"腹部","duration":"2小时"}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"疼痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:44:39.236Z","resolvedStart":"2026-08-31T11:44:39+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"疼痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:44:39.236Z","resolvedStart":"2026-08-31T11:44:39+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：不满足：{"pass":false,"missing":["腹痛","腹部"],"forbidden":[]}
- 失败/差异：实体:腹痛；部位:腹部；持续:2小时；UI 缺少 腹痛；UI 缺少 腹部
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/ST-06/ST-06-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/ST-06/ST-06-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/ST-06/ST-06-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/ST-06/ST-06-step-01-refresh.png

### ST-07 — PARTIAL

- 当前人物：测试宝宝A（child）
- 原始输入：这个疹子是前天开始出现的。
- 执行输入：这个疹子是前天开始出现的。
- 用例预期：皮疹，开始时间为前天（2026-08-29）；日期级 UI 不得伪装成 00:00。
- 严格结果：未满足全部字段

#### Step 1

- 输入：这个疹子是前天开始出现的。
- 完整预期：{"facts":[{"name":"皮疹","polarity":"affirmed","type":"symptom","timeRaw":"前天","resolvedDate":"2026-08-29"}],"minFacts":1,"maxFacts":1,"uiForbid":["00:00"]}
- Preview：HTTP 200；{"name":"皮疹","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"前天","resolvedStart":"2026-08-29T00:00:00+08:00","resolvedEnd":"2026-08-30T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"皮疹","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"前天","resolvedStart":"2026-08-29T00:00:00+08:00","resolvedEnd":"2026-08-30T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：不满足：{"pass":false,"missing":[],"forbidden":["00:00"]}
- 失败/差异：UI 错误显示 00:00
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/ST-07/ST-07-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/ST-07/ST-07-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/ST-07/ST-07-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/ST-07/ST-07-step-01-refresh.png

### ST-08 — PARTIAL

- 当前人物：测试宝宝A（child）
- 原始输入：好像有一点喘。
- 执行输入：好像有一点喘。
- 用例预期：轻微喘息且极性为 uncertain，不能升级为确定阳性。
- 严格结果：未满足全部字段

#### Step 1

- 输入：好像有一点喘。
- 完整预期：{"facts":[{"name":"喘息","polarity":"uncertain","type":"symptom","severity":"mild"}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"喘息","type":"symptom","polarity":"uncertain","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:44:59.735Z","resolvedStart":"2026-08-31T11:44:59+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"喘息","type":"symptom","polarity":"uncertain","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:44:59.735Z","resolvedStart":"2026-08-31T11:44:59+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：程度:mild
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/ST-08/ST-08-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/ST-08/ST-08-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/ST-08/ST-08-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/ST-08/ST-08-step-01-refresh.png

### ST-09 — PASS

- 当前人物：测试宝宝A（child）
- 原始输入：体温大概三十八九度。
- 执行输入：体温大概三十八九度。
- 用例预期：约 38～39℃ 范围，不得压成无依据的单点值。
- 严格结果：PASS

#### Step 1

- 输入：体温大概三十八九度。
- 完整预期：{"facts":[{"name":"体温","polarity":"affirmed","type":"temperature","temperatureMin":38,"temperatureMax":39}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"38-39℃","type":"temperature","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":{"min":38,"max":39,"unit":"℃"},"time":{"raw":"2026-08-31T03:45:12.034Z","resolvedStart":"2026-08-31T11:45:12+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"38-39℃","type":"temperature","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":{"min":38,"max":39,"unit":"℃"},"time":{"raw":"2026-08-31T03:45:12.034Z","resolvedStart":"2026-08-31T11:45:12+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：无
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/ST-09/ST-09-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/ST-09/ST-09-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/ST-09/ST-09-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/ST-09/ST-09-step-01-refresh.png

### ST-10 — PARTIAL

- 当前人物：测试宝宝A（child）
- 原始输入：鼻子堵，嗓子也疼，但是没有发烧。
- 执行输入：鼻子堵，嗓子也疼，但是没有发烧。
- 用例预期：鼻塞、咽喉痛和无发热阴性事实全部保留；不得生成发热阳性。
- 严格结果：未满足全部字段

#### Step 1

- 输入：鼻子堵，嗓子也疼，但是没有发烧。
- 完整预期：{"facts":[{"name":"鼻塞","polarity":"affirmed","type":"symptom"},{"name":"咽喉痛","polarity":"affirmed","type":"symptom","bodyPart":"咽喉"},{"name":"发热","polarity":"negated","type":"symptom","status":"not_applicable"}],"minFacts":3,"maxFacts":3,"forbidden":[{"name":"发热","polarity":"affirmed"}]}
- Preview：HTTP 200；{"name":"鼻塞","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:45:22.176Z","resolvedStart":"2026-08-31T11:45:22+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}<br>{"name":"疼痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:45:22.176Z","resolvedStart":"2026-08-31T11:45:22+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}<br>{"name":"发热","type":"symptom","polarity":"negated","status":"not_applicable","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:45:22.176Z","resolvedStart":"2026-08-31T11:45:22+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"鼻塞","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:45:22.176Z","resolvedStart":"2026-08-31T11:45:22+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}<br>{"name":"疼痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:45:22.176Z","resolvedStart":"2026-08-31T11:45:22+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}<br>{"name":"发热","type":"symptom","polarity":"negated","status":"not_applicable","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:45:22.176Z","resolvedStart":"2026-08-31T11:45:22+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：不满足：{"pass":false,"missing":["咽喉痛","咽喉"],"forbidden":[]}
- 失败/差异：实体:咽喉痛；部位:咽喉；UI 缺少 咽喉痛；UI 缺少 咽喉
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/ST-10/ST-10-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/ST-10/ST-10-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/ST-10/ST-10-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/ST-10/ST-10-step-01-refresh.png

### ST-11 — PARTIAL

- 当前人物：测试宝宝A（child）
- 原始输入：左边肩膀疼，右边小腿也有点麻。
- 执行输入：左边肩膀疼，右边小腿也有点麻。
- 用例预期：左肩疼痛和右小腿麻木拆分为两条，侧别不得丢失。
- 严格结果：未满足全部字段

#### Step 1

- 输入：左边肩膀疼，右边小腿也有点麻。
- 完整预期：{"facts":[{"name":"疼痛","polarity":"affirmed","type":"symptom","bodyPart":"肩","laterality":"left"},{"name":"麻木","polarity":"affirmed","type":"symptom","bodyPart":"小腿","laterality":"right"}],"minFacts":2,"maxFacts":2}
- Preview：HTTP 200；{"name":"疼痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"肩","laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:45:32.181Z","resolvedStart":"2026-08-31T11:45:32+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}<br>{"name":"麻木","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"小腿","laterality":null,"severity":"mild","severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:45:32.181Z","resolvedStart":"2026-08-31T11:45:32+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"疼痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"肩","laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:45:32.181Z","resolvedStart":"2026-08-31T11:45:32+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}<br>{"name":"麻木","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"小腿","laterality":null,"severity":"mild","severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:45:32.181Z","resolvedStart":"2026-08-31T11:45:32+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：不满足：{"pass":false,"missing":["肩","左","小腿","右"],"forbidden":[]}
- 失败/差异：侧别:left；侧别:right；UI 缺少 肩；UI 缺少 左；UI 缺少 小腿；UI 缺少 右
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/ST-11/ST-11-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/ST-11/ST-11-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/ST-11/ST-11-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/ST-11/ST-11-step-01-refresh.png

### ST-12 — FAIL

- 当前人物：测试宝宝A（child）
- 原始输入：我真的快急死了，孩子一直咳，刚才还吐了两次。
- 执行输入：我真的快急死了，孩子一直咳，刚才还吐了两次。
- 用例预期：持续咳嗽和刚才呕吐两次；情绪化措辞不是疾病事实。
- 严格结果：未满足全部字段

#### Step 1

- 输入：我真的快急死了，孩子一直咳，刚才还吐了两次。
- 完整预期：{"facts":[{"name":"咳嗽","polarity":"affirmed","type":"symptom"},{"name":"咳嗽持续","polarity":"affirmed","type":"status_change","target":"咳嗽","change":"persistent"},{"name":"呕吐","polarity":"affirmed","type":"symptom","occurrenceCount":2,"timeRaw":"刚才","resolvedNearNowMinutes":10}],"minFacts":3,"maxFacts":3,"forbidden":[{"name":"焦虑"},{"name":"急死"}]}
- Preview：HTTP 200；{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":"continuous","occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:45:43.152Z","resolvedStart":"2026-08-31T11:45:43+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}<br>{"name":"咳嗽持续","type":"status_change","polarity":"affirmed","status":"active","change":"persistent","target":"咳嗽","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":"continuous","occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:45:43.152Z","resolvedStart":"2026-08-31T11:45:43+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}<br>{"name":"呕吐","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":2,"duration":null,"temperature":null,"time":{"raw":"刚才","resolvedStart":"2026-08-31T00:00:00+08:00","resolvedEnd":"2026-09-01T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":"continuous","occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:45:43.152Z","resolvedStart":"2026-08-31T11:45:43+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}<br>{"name":"咳嗽持续","type":"status_change","polarity":"affirmed","status":"active","change":"persistent","target":"咳嗽","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":"continuous","occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:45:43.152Z","resolvedStart":"2026-08-31T11:45:43+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}<br>{"name":"呕吐","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":2,"duration":null,"temperature":null,"time":{"raw":"刚才","resolvedStart":"2026-08-31T00:00:00+08:00","resolvedEnd":"2026-09-01T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：时间距提交:10分钟内
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/ST-12/ST-12-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/ST-12/ST-12-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/ST-12/ST-12-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/ST-12/ST-12-step-01-refresh.png

### FILTER-01 — PASS

- 当前人物：测试宝宝A（child）
- 原始输入：帮我把刚才的咳嗽改成头疼。
- 执行输入：帮我把刚才的咳嗽改成头疼。
- 用例预期：编辑指令零入库。
- 严格结果：PASS

#### Step 1

- 输入：帮我把刚才的咳嗽改成头疼。
- 完整预期：{"facts":[],"minFacts":0,"maxFacts":0,"reject":true,"reason":"编辑指令不得通过快捷记录创建事实"}
- Preview：HTTP 200；[]
- Confirm：未确认（安全门禁用例不确认错误阳性预览）
- 刷新 API：[]
- 数量：Records +0，Organizations +0
- Preview/Confirm/Refresh：无确认链路
- 最终 UI：满足本步 UI 断言
- 失败/差异：无
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/FILTER-01/FILTER-01-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/FILTER-01/FILTER-01-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/FILTER-01/FILTER-01-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/FILTER-01/FILTER-01-step-01-refresh.png

### FILTER-02 — PASS

- 当前人物：测试宝宝A（child）
- 原始输入：要是明天发烧就麻烦了。
- 执行输入：要是明天发烧就麻烦了。
- 用例预期：假设句零阳性入库。
- 严格结果：PASS

#### Step 1

- 输入：要是明天发烧就麻烦了。
- 完整预期：{"facts":[],"minFacts":0,"maxFacts":0,"reject":true,"reason":"假设句不得创建阳性事实","forbidden":[{"name":"发热","polarity":"affirmed"}]}
- Preview：HTTP 200；[]
- Confirm：未确认（安全门禁用例不确认错误阳性预览）
- 刷新 API：[]
- 数量：Records +0，Organizations +0
- Preview/Confirm/Refresh：无确认链路
- 最终 UI：满足本步 UI 断言
- 失败/差异：无
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/FILTER-02/FILTER-02-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/FILTER-02/FILTER-02-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/FILTER-02/FILTER-02-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/FILTER-02/FILTER-02-step-01-refresh.png

### FILTER-03 — PASS

- 当前人物：测试宝宝A（child）
- 原始输入：发烧一般是体温超过多少度？
- 执行输入：发烧一般是体温超过多少度？
- 用例预期：医疗知识问句零阳性入库。
- 严格结果：PASS

#### Step 1

- 输入：发烧一般是体温超过多少度？
- 完整预期：{"facts":[],"minFacts":0,"maxFacts":0,"reject":true,"reason":"医疗知识问句不得创建阳性事实","forbidden":[{"name":"发热","polarity":"affirmed"},{"name":"体温","polarity":"affirmed"}]}
- Preview：HTTP 200；[]
- Confirm：未确认（安全门禁用例不确认错误阳性预览）
- 刷新 API：[]
- 数量：Records +0，Organizations +0
- Preview/Confirm/Refresh：无确认链路
- 最终 UI：满足本步 UI 断言
- 失败/差异：无
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/FILTER-03/FILTER-03-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/FILTER-03/FILTER-03-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/FILTER-03/FILTER-03-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/FILTER-03/FILTER-03-step-01-refresh.png

### FILTER-04 — PASS

- 当前人物：测试宝宝A（child）
- 原始输入：这会不会是肺炎？
- 执行输入：这会不会是肺炎？
- 用例预期：肺炎担忧问句零阳性入库。
- 严格结果：PASS

#### Step 1

- 输入：这会不会是肺炎？
- 完整预期：{"facts":[],"minFacts":0,"maxFacts":0,"reject":true,"reason":"诊断担忧问句不得创建肺炎事实","forbidden":[{"name":"肺炎","polarity":"affirmed"}]}
- Preview：HTTP 200；[]
- Confirm：未确认（安全门禁用例不确认错误阳性预览）
- 刷新 API：[]
- 数量：Records +0，Organizations +0
- Preview/Confirm/Refresh：无确认链路
- 最终 UI：满足本步 UI 断言
- 失败/差异：无
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/FILTER-04/FILTER-04-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/FILTER-04/FILTER-04-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/FILTER-04/FILTER-04-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/FILTER-04/FILTER-04-step-01-refresh.png

### FILTER-05 — PASS

- 当前人物：测试宝宝A（child）
- 原始输入：今天天气真热。
- 执行输入：今天天气真热。
- 用例预期：天气闲聊零入库。
- 严格结果：PASS

#### Step 1

- 输入：今天天气真热。
- 完整预期：{"facts":[],"minFacts":0,"maxFacts":0,"reject":true,"reason":"天气闲聊不得创建健康事实"}
- Preview：HTTP 200；[]
- Confirm：未确认（安全门禁用例不确认错误阳性预览）
- 刷新 API：[]
- 数量：Records +0，Organizations +0
- Preview/Confirm/Refresh：无确认链路
- 最终 UI：满足本步 UI 断言
- 失败/差异：无
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/FILTER-05/FILTER-05-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/FILTER-05/FILTER-05-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/FILTER-05/FILTER-05-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/FILTER-05/FILTER-05-step-01-refresh.png

### CTX-01 — PASS

- 当前人物：测试宝宝A（child）
- 原始输入：今天早上开始咳嗽。 → 现在还在。
- 执行输入：今天早上开始咳嗽。 → 现在还在。
- 用例预期：唯一咳嗽上下文中，“还在”关联咳嗽并形成持续状态。
- 严格结果：PASS

#### Step 1

- 输入：今天早上开始咳嗽。
- 完整预期：{"facts":[{"name":"咳嗽","polarity":"affirmed","type":"symptom","timeRaw":"今天早上"}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"今天早上","resolvedStart":"2026-08-31T06:00:00+08:00","resolvedEnd":"2026-08-31T09:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"今天早上","resolvedStart":"2026-08-31T06:00:00+08:00","resolvedEnd":"2026-08-31T09:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：无
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/CTX-01/CTX-01-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-01/CTX-01-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-01/CTX-01-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-01/CTX-01-step-01-refresh.png

#### Step 2

- 输入：现在还在。
- 完整预期：{"facts":[{"name":"咳嗽持续","polarity":"affirmed","type":"status_change","target":"咳嗽","change":"persistent"}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"咳嗽持续","type":"status_change","polarity":"affirmed","status":"active","change":"persistent","target":"咳嗽","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:46:46.926Z","resolvedStart":"2026-08-31T11:46:46+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"咳嗽持续","type":"status_change","polarity":"affirmed","status":"active","change":"persistent","target":"咳嗽","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:46:46.926Z","resolvedStart":"2026-08-31T11:46:46+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：无
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/CTX-01/CTX-01-step-02-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-01/CTX-01-step-02-input.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-01/CTX-01-step-02-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-01/CTX-01-step-02-refresh.png

### CTX-02 — FAIL

- 当前人物：测试宝宝A（child）
- 原始输入：十点头疼得很厉害。 → 现在轻一点了。
- 执行输入：十点头疼得很厉害。 → 现在轻一点了。
- 用例预期：唯一头痛上下文中，“轻一点了”形成改善状态。
- 严格结果：未满足全部字段

#### Step 1

- 输入：十点头疼得很厉害。
- 完整预期：{"facts":[{"name":"头痛","polarity":"affirmed","type":"symptom","severity":"severe","resolvedHour":10}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"头痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"头","laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:46:57.301Z","resolvedStart":"2026-08-31T11:46:57+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"头痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"头","laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:46:57.301Z","resolvedStart":"2026-08-31T11:46:57+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：程度:severe；解析小时:10
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/CTX-02/CTX-02-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-02/CTX-02-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-02/CTX-02-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-02/CTX-02-step-01-refresh.png

#### Step 2

- 输入：现在轻一点了。
- 完整预期：{"facts":[{"name":"头痛改善","polarity":"affirmed","type":"status_change","target":"头痛","change":"improved"}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"头痛好转","type":"status_change","polarity":"affirmed","status":"improving","change":"improved","target":"头痛","bodyPart":"头","laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:47:07.792Z","resolvedStart":"2026-08-31T11:47:07+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"头痛好转","type":"status_change","polarity":"affirmed","status":"improving","change":"improved","target":"头痛","bodyPart":"头","laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:47:07.792Z","resolvedStart":"2026-08-31T11:47:07+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：无
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/CTX-02/CTX-02-step-02-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-02/CTX-02-step-02-input.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-02/CTX-02-step-02-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-02/CTX-02-step-02-refresh.png

### CTX-03 — PARTIAL

- 当前人物：测试宝宝A（child）
- 原始输入：头疼，而且肚子也疼。 → 这个好一点了。
- 执行输入：头疼，而且肚子也疼。 → 这个好一点了。
- 用例预期：第二步目标含糊，不能擅自关联任一症状。
- 严格结果：未满足全部字段

#### Step 1

- 输入：头疼，而且肚子也疼。
- 完整预期：{"facts":[{"name":"头痛","polarity":"affirmed","type":"symptom"},{"name":"腹痛","polarity":"affirmed","type":"symptom","bodyPart":"腹部"}],"minFacts":2,"maxFacts":2}
- Preview：HTTP 200；{"name":"头痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"头","laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:47:21.579Z","resolvedStart":"2026-08-31T11:47:21+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}<br>{"name":"疼痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:47:21.579Z","resolvedStart":"2026-08-31T11:47:21+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"头痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"头","laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:47:21.579Z","resolvedStart":"2026-08-31T11:47:21+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}<br>{"name":"疼痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:47:21.579Z","resolvedStart":"2026-08-31T11:47:21+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：不满足：{"pass":false,"missing":["腹痛","腹部"],"forbidden":[]}
- 失败/差异：实体:腹痛；部位:腹部；UI 缺少 腹痛；UI 缺少 腹部
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/CTX-03/CTX-03-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-03/CTX-03-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-03/CTX-03-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-03/CTX-03-step-01-refresh.png

#### Step 2

- 输入：这个好一点了。
- 完整预期：{"facts":[],"minFacts":0,"maxFacts":0,"reject":true,"reason":"两个候选症状下“这个”目标不明确，必须阻止保存或要求补充"}
- Preview：HTTP 409；[]
- Confirm：未确认（安全门禁用例不确认错误阳性预览）
- 刷新 API：[]
- 数量：Records +0，Organizations +0
- Preview/Confirm/Refresh：无确认链路
- 最终 UI：满足本步 UI 断言
- 失败/差异：Preview 409: [REDACTED] 请说明是哪一个症状发生了变化。
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/CTX-03/CTX-03-step-02-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-03/CTX-03-step-02-input.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-03/CTX-03-step-02-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-03/CTX-03-step-02-refresh.png

### CTX-04 — FAIL

- 当前人物：测试宝宝A（child）
- 原始输入：头疼，而且肚子也疼。 → 头已经不疼了，肚子还是疼。
- 执行输入：头疼，而且肚子也疼。 → 头已经不疼了，肚子还是疼。
- 用例预期：头痛消失与腹痛持续拆分正确。
- 严格结果：未满足全部字段

#### Step 1

- 输入：头疼，而且肚子也疼。
- 完整预期：{"facts":[{"name":"头痛","polarity":"affirmed","type":"symptom"},{"name":"腹痛","polarity":"affirmed","type":"symptom","bodyPart":"腹部"}],"minFacts":2,"maxFacts":2}
- Preview：HTTP 200；{"name":"头痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"头","laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:47:41.198Z","resolvedStart":"2026-08-31T11:47:41+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}<br>{"name":"疼痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:47:41.198Z","resolvedStart":"2026-08-31T11:47:41+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"头痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"头","laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:47:41.198Z","resolvedStart":"2026-08-31T11:47:41+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}<br>{"name":"疼痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:47:41.198Z","resolvedStart":"2026-08-31T11:47:41+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：不满足：{"pass":false,"missing":["腹痛","腹部"],"forbidden":[]}
- 失败/差异：实体:腹痛；部位:腹部；UI 缺少 腹痛；UI 缺少 腹部
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/CTX-04/CTX-04-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-04/CTX-04-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-04/CTX-04-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-04/CTX-04-step-01-refresh.png

#### Step 2

- 输入：头已经不疼了，肚子还是疼。
- 完整预期：{"facts":[{"name":"头痛消失","polarity":"affirmed","type":"status_change","target":"头痛","change":"resolved"},{"name":"腹痛持续","polarity":"affirmed","type":"status_change","target":"腹痛","change":"persistent"}],"minFacts":2,"maxFacts":2}
- Preview：HTTP 200；{"name":"头痛消失","type":"status_change","polarity":"affirmed","status":"resolved","change":"resolved","target":"头痛","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:47:50.798Z","resolvedStart":"2026-08-31T11:47:50+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"头痛消失","type":"status_change","polarity":"affirmed","status":"resolved","change":"resolved","target":"头痛","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:47:50.798Z","resolvedStart":"2026-08-31T11:47:50+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：不满足：{"pass":false,"missing":["腹痛"],"forbidden":[]}
- 失败/差异：无实际事实；UI 缺少 腹痛
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/CTX-04/CTX-04-step-02-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-04/CTX-04-step-02-input.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-04/CTX-04-step-02-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-04/CTX-04-step-02-refresh.png

### CTX-05 — FAIL

- 当前人物：测试宝宝A（child）
- 原始输入：上午起了红疹。 → 下午红疹退了。 → 晚上又有了。
- 执行输入：8月30日上午起了红疹。 → 8月30日下午红疹退了。 → 8月30日晚上又有了。
- 用例预期：皮疹出现、消失、复发的三步状态链完整。
- 严格结果：未满足全部字段

#### Step 1

- 输入：8月30日上午起了红疹。
- 完整预期：{"facts":[{"name":"皮疹","polarity":"affirmed","type":"symptom","timeRaw":"8月30日上午","resolvedDate":"2026-08-30"}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"皮疹","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日上午","resolvedStart":"2026-08-30T09:00:00+08:00","resolvedEnd":"2026-08-30T12:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"皮疹","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日上午","resolvedStart":"2026-08-30T09:00:00+08:00","resolvedEnd":"2026-08-30T12:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：无
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/CTX-05/CTX-05-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-05/CTX-05-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-05/CTX-05-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-05/CTX-05-step-01-refresh.png

#### Step 2

- 输入：8月30日下午红疹退了。
- 完整预期：{"facts":[{"name":"皮疹消失","polarity":"affirmed","type":"status_change","target":"皮疹","change":"resolved","timeRaw":"8月30日下午","resolvedDate":"2026-08-30"}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"皮疹","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日下午","resolvedStart":"2026-08-30T14:00:00+08:00","resolvedEnd":"2026-08-30T18:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}<br>{"name":"皮疹消失","type":"status_change","polarity":"affirmed","status":"resolved","change":"resolved","target":"皮疹","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日下午","resolvedStart":"2026-08-30T14:00:00+08:00","resolvedEnd":"2026-08-30T18:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"皮疹","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日下午","resolvedStart":"2026-08-30T14:00:00+08:00","resolvedEnd":"2026-08-30T18:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}<br>{"name":"皮疹消失","type":"status_change","polarity":"affirmed","status":"resolved","change":"resolved","target":"皮疹","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日下午","resolvedStart":"2026-08-30T14:00:00+08:00","resolvedEnd":"2026-08-30T18:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：无
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/CTX-05/CTX-05-step-02-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-05/CTX-05-step-02-input.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-05/CTX-05-step-02-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-05/CTX-05-step-02-refresh.png

#### Step 3

- 输入：8月30日晚上又有了。
- 完整预期：{"facts":[{"name":"皮疹复发","polarity":"affirmed","type":"status_change","target":"皮疹","change":"recurred","timeRaw":"8月30日晚上","resolvedDate":"2026-08-30"}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；[]
- Confirm：未确认（无可确认 previewId 或事实）
- 刷新 API：[]
- 数量：Records +0，Organizations +0
- Preview/Confirm/Refresh：无确认链路
- 最终 UI：满足本步 UI 断言
- 失败/差异：无实际事实；预期健康事实未保存
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/CTX-05/CTX-05-step-03-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-05/CTX-05-step-03-input.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-05/CTX-05-step-03-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-05/CTX-05-step-03-refresh.png

### CTX-06 — FAIL

- 当前人物：测试宝宝A（child）
- 原始输入：三天前开始咳嗽。 → 今天量体温37度。 → 今天比前两天轻多了。
- 执行输入：三天前开始咳嗽。 → 今天量体温37度。 → 今天比前两天轻多了。
- 用例预期：跨一条体温记录仍应把“轻多了”关联到此前咳嗽。
- 严格结果：未满足全部字段

#### Step 1

- 输入：三天前开始咳嗽。
- 完整预期：{"facts":[{"name":"咳嗽","polarity":"affirmed","type":"symptom","timeRaw":"三天前","resolvedDate":"2026-08-28"}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":"三天","temperature":null,"time":{"raw":"2026-08-31T03:48:51.434Z","resolvedStart":"2026-08-31T11:48:51+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":"三天","temperature":null,"time":{"raw":"2026-08-31T03:48:51.434Z","resolvedStart":"2026-08-31T11:48:51+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：原始时间:三天前；解析日期:2026-08-28
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/CTX-06/CTX-06-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-06/CTX-06-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-06/CTX-06-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-06/CTX-06-step-01-refresh.png

#### Step 2

- 输入：今天量体温37度。
- 完整预期：{"facts":[{"name":"体温","polarity":"affirmed","type":"temperature","temperatureMin":37,"temperatureMax":37,"timeRaw":"今天"}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"37℃","type":"temperature","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":{"min":37,"max":37,"unit":"℃"},"time":{"raw":"今天","resolvedStart":"2026-08-31T00:00:00+08:00","resolvedEnd":"2026-09-01T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"37℃","type":"temperature","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":{"min":37,"max":37,"unit":"℃"},"time":{"raw":"今天","resolvedStart":"2026-08-31T00:00:00+08:00","resolvedEnd":"2026-09-01T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：无
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/CTX-06/CTX-06-step-02-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-06/CTX-06-step-02-input.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-06/CTX-06-step-02-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-06/CTX-06-step-02-refresh.png

#### Step 3

- 输入：今天比前两天轻多了。
- 完整预期：{"facts":[{"name":"咳嗽改善","polarity":"affirmed","type":"status_change","target":"咳嗽","change":"improved"}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"咳嗽好转","type":"status_change","polarity":"affirmed","status":"improving","change":"improved","target":"咳嗽","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":"两天","temperature":null,"time":{"raw":"今天","resolvedStart":"2026-08-31T00:00:00+08:00","resolvedEnd":"2026-09-01T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"咳嗽好转","type":"status_change","polarity":"affirmed","status":"improving","change":"improved","target":"咳嗽","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":"两天","temperature":null,"time":{"raw":"今天","resolvedStart":"2026-08-31T00:00:00+08:00","resolvedEnd":"2026-09-01T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：无
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/CTX-06/CTX-06-step-03-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-06/CTX-06-step-03-input.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-06/CTX-06-step-03-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/CTX-06/CTX-06-step-03-refresh.png

### NEG-01 — PARTIAL

- 当前人物：测试宝宝A（child）
- 原始输入：今天没有发烧。
- 执行输入：今天没有发烧。
- 用例预期：无发热作为阴性病程事实保存，零发热阳性；日期级 UI 不得伪装成 00:00。
- 严格结果：未满足全部字段

#### Step 1

- 输入：今天没有发烧。
- 完整预期：{"facts":[{"name":"发热","polarity":"negated","type":"symptom","status":"not_applicable","timeRaw":"今天"}],"minFacts":1,"maxFacts":1,"forbidden":[{"name":"发热","polarity":"affirmed"}],"uiForbid":["00:00"]}
- Preview：HTTP 200；{"name":"发热","type":"symptom","polarity":"negated","status":"not_applicable","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"今天","resolvedStart":"2026-08-31T00:00:00+08:00","resolvedEnd":"2026-09-01T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"发热","type":"symptom","polarity":"negated","status":"not_applicable","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"今天","resolvedStart":"2026-08-31T00:00:00+08:00","resolvedEnd":"2026-09-01T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：不满足：{"pass":false,"missing":[],"forbidden":["00:00"]}
- 失败/差异：UI 错误显示 00:00
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/NEG-01/NEG-01-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/NEG-01/NEG-01-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/NEG-01/NEG-01-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/NEG-01/NEG-01-step-01-refresh.png

### NEG-02 — PASS

- 当前人物：测试宝宝A（child）
- 原始输入：不发烧，就是一直咳嗽。
- 执行输入：不发烧，就是一直咳嗽。
- 用例预期：无发热阴性与持续咳嗽均保存；允许兼容的咳嗽基础观察并存。
- 严格结果：PASS

#### Step 1

- 输入：不发烧，就是一直咳嗽。
- 完整预期：{"facts":[{"name":"发热","polarity":"negated","type":"symptom","status":"not_applicable"},{"name":"咳嗽持续","polarity":"affirmed","type":"status_change","target":"咳嗽","change":"persistent"}],"minFacts":2,"maxFacts":3,"forbidden":[{"name":"发热","polarity":"affirmed"}]}
- Preview：HTTP 200；{"name":"发热","type":"symptom","polarity":"negated","status":"not_applicable","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:49:35.169Z","resolvedStart":"2026-08-31T11:49:35+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}<br>{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":"continuous","occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:49:35.169Z","resolvedStart":"2026-08-31T11:49:35+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}<br>{"name":"咳嗽持续","type":"status_change","polarity":"affirmed","status":"active","change":"persistent","target":"咳嗽","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":"continuous","occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:49:35.169Z","resolvedStart":"2026-08-31T11:49:35+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"发热","type":"symptom","polarity":"negated","status":"not_applicable","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:49:35.169Z","resolvedStart":"2026-08-31T11:49:35+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}<br>{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":"continuous","occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:49:35.169Z","resolvedStart":"2026-08-31T11:49:35+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}<br>{"name":"咳嗽持续","type":"status_change","polarity":"affirmed","status":"active","change":"persistent","target":"咳嗽","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":"continuous","occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:49:35.169Z","resolvedStart":"2026-08-31T11:49:35+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：无
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/NEG-02/NEG-02-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/NEG-02/NEG-02-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/NEG-02/NEG-02-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/NEG-02/NEG-02-step-01-refresh.png

### NEG-03 — PASS

- 当前人物：测试宝宝A（child）
- 原始输入：也不是完全不咳，就是偶尔咳两声。
- 执行输入：也不是完全不咳，就是偶尔咳两声。
- 用例预期：双重否定后为咳嗽阳性，并保留偶尔、两声。
- 严格结果：PASS

#### Step 1

- 输入：也不是完全不咳，就是偶尔咳两声。
- 完整预期：{"facts":[{"name":"咳嗽","polarity":"affirmed","type":"symptom","frequency":"occasional","occurrenceCount":2}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":"occasional","occurrenceCount":2,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:49:45.556Z","resolvedStart":"2026-08-31T11:49:45+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":"occasional","occurrenceCount":2,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:49:45.556Z","resolvedStart":"2026-08-31T11:49:45+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：无
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/NEG-03/NEG-03-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/NEG-03/NEG-03-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/NEG-03/NEG-03-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/NEG-03/NEG-03-step-01-refresh.png

### NEG-04 — PARTIAL

- 当前人物：测试宝宝A（child）
- 原始输入：今天没有比昨天更严重，差不多还是那样。
- 执行输入：今天没有比昨天更严重，差不多还是那样。
- 用例预期：保留未加重/基本不变的病程状态；零入库最多 PARTIAL。
- 严格结果：未满足全部字段

#### Step 1

- 输入：今天没有比昨天更严重，差不多还是那样。
- 完整预期：{"facts":[{"name":"症状未加重","polarity":"affirmed","type":"status_change","change":"unchanged"}],"minFacts":1,"maxFacts":1,"forbidden":[{"change":"worsened"}]}
- Preview：HTTP 200；[]
- Confirm：未确认（无可确认 previewId 或事实）
- 刷新 API：[]
- 数量：Records +0，Organizations +0
- Preview/Confirm/Refresh：无确认链路
- 最终 UI：满足本步 UI 断言
- 失败/差异：无实际事实；预期健康事实未保存
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/NEG-04/NEG-04-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/NEG-04/NEG-04-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/NEG-04/NEG-04-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/NEG-04/NEG-04-step-01-refresh.png

### NEG-05 — FAIL

- 当前人物：测试宝宝A（child）
- 原始输入：左腿疼，不对，是右腿，左腿没事。
- 执行输入：左腿疼，不对，是右腿，左腿没事。
- 用例预期：当前有效疼痛在右腿；左腿旧说法明确纠正/阴性并具有修订关系。
- 严格结果：未满足全部字段

#### Step 1

- 输入：左腿疼，不对，是右腿，左腿没事。
- 完整预期：{"facts":[{"name":"疼痛","polarity":"affirmed","type":"symptom","bodyPart":"腿","laterality":"right"},{"name":"左腿疼痛纠正","polarity":"affirmed","type":"status_change","laterality":"left","change":"corrected","relation":true}],"minFacts":2,"maxFacts":3,"forbidden":[{"name":"疼痛","laterality":"left","polarity":"affirmed","current":true}]}
- Preview：HTTP 200；{"name":"疼痛","type":"symptom","polarity":"negated","status":"not_applicable","change":null,"target":null,"bodyPart":"左腿","laterality":"left","severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:50:03.892Z","resolvedStart":"2026-08-31T11:50:03+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"疼痛","type":"symptom","polarity":"negated","status":"not_applicable","change":null,"target":null,"bodyPart":"左腿","laterality":"left","severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:50:03.892Z","resolvedStart":"2026-08-31T11:50:03+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：不满足：{"pass":false,"missing":["腿","右","左腿疼痛","左"],"forbidden":[]}
- 失败/差异：极性:affirmed；侧别:right；实体:左腿疼痛纠正；类型:status_change；变化:corrected；纠正关系；UI 缺少 腿；UI 缺少 右；UI 缺少 左腿疼痛；UI 缺少 左
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/NEG-05/NEG-05-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/NEG-05/NEG-05-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/NEG-05/NEG-05-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/NEG-05/NEG-05-step-01-refresh.png

### NEG-06 — FAIL

- 当前人物：测试宝宝A（child）
- 原始输入：刚才量的是39度2，不对，我看错了，是38度2。
- 执行输入：刚才量的是39度2，不对，我看错了，是38度2。
- 用例预期：当前温度为 38.2℃；39.2℃ 不得继续作为当前有效值。
- 严格结果：未满足全部字段

#### Step 1

- 输入：刚才量的是39度2，不对，我看错了，是38度2。
- 完整预期：{"facts":[{"name":"体温","polarity":"affirmed","type":"temperature","temperatureMin":38.2,"temperatureMax":38.2},{"name":"体温纠正","polarity":"affirmed","type":"status_change","change":"corrected","relation":true}],"minFacts":1,"maxFacts":2,"forbidden":[{"type":"temperature","temperatureMin":39.2,"polarity":"affirmed","current":true}]}
- Preview：HTTP 200；{"name":"38.2℃","type":"temperature","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":{"min":38.2,"max":38.2,"unit":"℃"},"time":{"raw":"刚才","resolvedStart":"2026-08-31T00:00:00+08:00","resolvedEnd":"2026-09-01T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"38.2℃","type":"temperature","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":{"min":38.2,"max":38.2,"unit":"℃"},"time":{"raw":"刚才","resolvedStart":"2026-08-31T00:00:00+08:00","resolvedEnd":"2026-09-01T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：无实际事实
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/NEG-06/NEG-06-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/NEG-06/NEG-06-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/NEG-06/NEG-06-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/NEG-06/NEG-06-step-01-refresh.png

### NEG-07 — FAIL

- 当前人物：测试宝宝A（child）
- 原始输入：是今天早上开始疼的，哦不是，是昨天晚上就开始了。
- 执行输入：是今天早上开始疼的，哦不是，是昨天晚上就开始了。
- 用例预期：疼痛开始时间纠正为昨天晚上。
- 严格结果：未满足全部字段

#### Step 1

- 输入：是今天早上开始疼的，哦不是，是昨天晚上就开始了。
- 完整预期：{"facts":[{"name":"疼痛","polarity":"affirmed","type":"symptom","timeRaw":"昨天晚上","resolvedDate":"2026-08-30"}],"minFacts":1,"maxFacts":1,"forbidden":[{"timeRaw":"今天早上","current":true}]}
- Preview：HTTP 200；{"name":"疼痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"今天早上","resolvedStart":"2026-08-31T06:00:00+08:00","resolvedEnd":"2026-08-31T09:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"疼痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"今天早上","resolvedStart":"2026-08-31T06:00:00+08:00","resolvedEnd":"2026-08-31T09:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：原始时间:昨天晚上；解析日期:2026-08-30；出现 1 条禁用事实
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/NEG-07/NEG-07-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/NEG-07/NEG-07-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/NEG-07/NEG-07-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/NEG-07/NEG-07-step-01-refresh.png

### NEG-08 — PARTIAL

- 当前人物：测试宝宝A（child）
- 原始输入：不是头疼，是头晕，头不疼。
- 执行输入：不是头疼，是头晕，头不疼。
- 用例预期：当前有效事实为头晕；头痛为阴性/纠正而非阳性。
- 严格结果：未满足全部字段

#### Step 1

- 输入：不是头疼，是头晕，头不疼。
- 完整预期：{"facts":[{"name":"头晕","polarity":"affirmed","type":"symptom"},{"name":"头痛","polarity":"negated","type":"symptom","status":"not_applicable"}],"minFacts":2,"maxFacts":2,"forbidden":[{"name":"头痛","polarity":"affirmed","current":true}]}
- Preview：HTTP 200；{"name":"头痛","type":"symptom","polarity":"negated","status":"not_applicable","change":null,"target":null,"bodyPart":"头","laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:50:36.564Z","resolvedStart":"2026-08-31T11:50:36+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}<br>{"name":"头晕","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"头","laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:50:36.564Z","resolvedStart":"2026-08-31T11:50:36+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}<br>{"name":"疼痛","type":"symptom","polarity":"negated","status":"not_applicable","change":null,"target":null,"bodyPart":"头","laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:50:36.564Z","resolvedStart":"2026-08-31T11:50:36+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"头痛","type":"symptom","polarity":"negated","status":"not_applicable","change":null,"target":null,"bodyPart":"头","laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:50:36.564Z","resolvedStart":"2026-08-31T11:50:36+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}<br>{"name":"头晕","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"头","laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:50:36.564Z","resolvedStart":"2026-08-31T11:50:36+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}<br>{"name":"疼痛","type":"symptom","polarity":"negated","status":"not_applicable","change":null,"target":null,"bodyPart":"头","laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:50:36.564Z","resolvedStart":"2026-08-31T11:50:36+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：无
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/NEG-08/NEG-08-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/NEG-08/NEG-08-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/NEG-08/NEG-08-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/NEG-08/NEG-08-step-01-refresh.png

### SPEECH-01 — PASS

- 当前人物：测试宝宝A（child）
- 原始输入：39度2。
- 执行输入：39度2。
- 用例预期：文字入口公共事实链路识别 39.2℃；不代表真实麦克风 E2E。
- 严格结果：PASS

#### Step 1

- 输入：39度2。
- 完整预期：{"facts":[{"name":"体温","polarity":"affirmed","type":"temperature","temperatureMin":39.2,"temperatureMax":39.2}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"39.2℃","type":"temperature","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":{"min":39.2,"max":39.2,"unit":"℃"},"time":{"raw":"2026-08-31T03:50:47.266Z","resolvedStart":"2026-08-31T11:50:47+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"39.2℃","type":"temperature","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":{"min":39.2,"max":39.2,"unit":"℃"},"time":{"raw":"2026-08-31T03:50:47.266Z","resolvedStart":"2026-08-31T11:50:47+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：无
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-01/SPEECH-01-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-01/SPEECH-01-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-01/SPEECH-01-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-01/SPEECH-01-step-01-refresh.png

### SPEECH-02 — PASS

- 当前人物：测试宝宝A（child）
- 原始输入：早上发烧38度。 → 又烧了。
- 执行输入：早上发烧38度。 → 又烧了。
- 用例预期：发热 38℃ 后“又烧了”形成复发。
- 严格结果：PASS

#### Step 1

- 输入：早上发烧38度。
- 完整预期：{"facts":[{"name":"发热","polarity":"affirmed","type":"symptom","timeRaw":"早上"},{"name":"体温","polarity":"affirmed","type":"temperature","temperatureMin":38,"temperatureMax":38,"timeRaw":"早上"}],"minFacts":2,"maxFacts":2}
- Preview：HTTP 200；{"name":"发热","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"早上","resolvedStart":"2026-08-31T06:00:00+08:00","resolvedEnd":"2026-08-31T09:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}<br>{"name":"38℃","type":"temperature","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":{"min":38,"max":38,"unit":"℃"},"time":{"raw":"早上","resolvedStart":"2026-08-31T06:00:00+08:00","resolvedEnd":"2026-08-31T09:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"发热","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"早上","resolvedStart":"2026-08-31T06:00:00+08:00","resolvedEnd":"2026-08-31T09:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}<br>{"name":"38℃","type":"temperature","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":{"min":38,"max":38,"unit":"℃"},"time":{"raw":"早上","resolvedStart":"2026-08-31T06:00:00+08:00","resolvedEnd":"2026-08-31T09:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：无
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-02/SPEECH-02-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-02/SPEECH-02-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-02/SPEECH-02-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-02/SPEECH-02-step-01-refresh.png

#### Step 2

- 输入：又烧了。
- 完整预期：{"facts":[{"name":"发热复发","polarity":"affirmed","type":"status_change","target":"发热","change":"recurred"}],"minFacts":1,"maxFacts":2}
- Preview：HTTP 200；{"name":"发热","type":"symptom","polarity":"affirmed","status":"recurrent","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:51:13.116Z","resolvedStart":"2026-08-31T11:51:13+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}<br>{"name":"发热复发","type":"status_change","polarity":"affirmed","status":"recurrent","change":"recurred","target":"发热","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:51:13.116Z","resolvedStart":"2026-08-31T11:51:13+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"发热","type":"symptom","polarity":"affirmed","status":"recurrent","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:51:13.116Z","resolvedStart":"2026-08-31T11:51:13+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}<br>{"name":"发热复发","type":"status_change","polarity":"affirmed","status":"recurrent","change":"recurred","target":"发热","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:51:13.116Z","resolvedStart":"2026-08-31T11:51:13+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：无
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-02/SPEECH-02-step-02-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-02/SPEECH-02-step-02-input.png；.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-02/SPEECH-02-step-02-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-02/SPEECH-02-step-02-refresh.png

### SPEECH-03 — PASS

- 当前人物：测试宝宝A（child）
- 原始输入：早上发烧38度。 → 不烧了。
- 执行输入：早上发烧38度。 → 不烧了。
- 用例预期：发热 38℃ 后“不烧了”形成消失。
- 严格结果：PASS

#### Step 1

- 输入：早上发烧38度。
- 完整预期：{"facts":[{"name":"发热","polarity":"affirmed","type":"symptom","timeRaw":"早上"},{"name":"体温","polarity":"affirmed","type":"temperature","temperatureMin":38,"temperatureMax":38,"timeRaw":"早上"}],"minFacts":2,"maxFacts":2}
- Preview：HTTP 200；{"name":"发热","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"早上","resolvedStart":"2026-08-31T06:00:00+08:00","resolvedEnd":"2026-08-31T09:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}<br>{"name":"38℃","type":"temperature","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":{"min":38,"max":38,"unit":"℃"},"time":{"raw":"早上","resolvedStart":"2026-08-31T06:00:00+08:00","resolvedEnd":"2026-08-31T09:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"发热","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"早上","resolvedStart":"2026-08-31T06:00:00+08:00","resolvedEnd":"2026-08-31T09:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}<br>{"name":"38℃","type":"temperature","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":{"min":38,"max":38,"unit":"℃"},"time":{"raw":"早上","resolvedStart":"2026-08-31T06:00:00+08:00","resolvedEnd":"2026-08-31T09:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：无
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-03/SPEECH-03-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-03/SPEECH-03-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-03/SPEECH-03-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-03/SPEECH-03-step-01-refresh.png

#### Step 2

- 输入：不烧了。
- 完整预期：{"facts":[{"name":"发热消失","polarity":"affirmed","type":"status_change","target":"发热","change":"resolved"}],"minFacts":1,"maxFacts":2}
- Preview：HTTP 200；{"name":"发热","type":"symptom","polarity":"negated","status":"not_applicable","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:51:38.804Z","resolvedStart":"2026-08-31T11:51:38+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}<br>{"name":"发热消失","type":"status_change","polarity":"affirmed","status":"resolved","change":"resolved","target":"发热","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:51:38.804Z","resolvedStart":"2026-08-31T11:51:38+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"发热","type":"symptom","polarity":"negated","status":"not_applicable","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:51:38.804Z","resolvedStart":"2026-08-31T11:51:38+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}<br>{"name":"发热消失","type":"status_change","polarity":"affirmed","status":"resolved","change":"resolved","target":"发热","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:51:38.804Z","resolvedStart":"2026-08-31T11:51:38+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：无
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-03/SPEECH-03-step-02-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-03/SPEECH-03-step-02-input.png；.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-03/SPEECH-03-step-02-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-03/SPEECH-03-step-02-refresh.png

### SPEECH-04 — PASS

- 当前人物：测试宝宝A（child）
- 原始输入：早上开始头疼。 → 好多了。
- 执行输入：早上开始头疼。 → 好多了。
- 用例预期：头痛后“好多了”形成改善。
- 严格结果：PASS

#### Step 1

- 输入：早上开始头疼。
- 完整预期：{"facts":[{"name":"头痛","polarity":"affirmed","type":"symptom","timeRaw":"早上"}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"头痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"头","laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"早上","resolvedStart":"2026-08-31T06:00:00+08:00","resolvedEnd":"2026-08-31T09:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"头痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"头","laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"早上","resolvedStart":"2026-08-31T06:00:00+08:00","resolvedEnd":"2026-08-31T09:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：无
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-04/SPEECH-04-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-04/SPEECH-04-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-04/SPEECH-04-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-04/SPEECH-04-step-01-refresh.png

#### Step 2

- 输入：好多了。
- 完整预期：{"facts":[{"name":"头痛改善","polarity":"affirmed","type":"status_change","target":"头痛","change":"improved"}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"头痛好转","type":"status_change","polarity":"affirmed","status":"improving","change":"improved","target":"头痛","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:51:59.726Z","resolvedStart":"2026-08-31T11:51:59+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"头痛好转","type":"status_change","polarity":"affirmed","status":"improving","change":"improved","target":"头痛","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:51:59.726Z","resolvedStart":"2026-08-31T11:51:59+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：无
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-04/SPEECH-04-step-02-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-04/SPEECH-04-step-02-input.png；.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-04/SPEECH-04-step-02-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-04/SPEECH-04-step-02-refresh.png

### SPEECH-05 — FAIL

- 当前人物：测试宝宝A（child）
- 原始输入：就是那个，嗯，孩子吧，今天这个咳嗽啊，好像比上午多一点，就这样。
- 执行输入：就是那个，嗯，孩子吧，今天这个咳嗽啊，好像比上午多一点，就这样。
- 用例预期：忽略口头填充词，保留孩子咳嗽较上午增多且“好像”的不确定性。
- 严格结果：未满足全部字段

#### Step 1

- 输入：就是那个，嗯，孩子吧，今天这个咳嗽啊，好像比上午多一点，就这样。
- 完整预期：{"facts":[{"name":"咳嗽加重","polarity":"uncertain","type":"status_change","target":"咳嗽","change":"worsened"}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"今天","resolvedStart":"2026-08-31T00:00:00+08:00","resolvedEnd":"2026-09-01T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"今天","resolvedStart":"2026-08-31T00:00:00+08:00","resolvedEnd":"2026-09-01T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：实体:咳嗽加重；类型:status_change；极性:uncertain；变化:worsened；目标:咳嗽
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-05/SPEECH-05-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-05/SPEECH-05-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-05/SPEECH-05-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-05/SPEECH-05-step-01-refresh.png

### SPEECH-07 — FAIL

- 当前人物：测试宝宝A（child）
- 原始输入：妈的急死我了，孩子咳得更厉害了，刚刚还吐了一次。
- 执行输入：妈的急死我了，孩子咳得更厉害了，刚刚还吐了一次。
- 用例预期：咳嗽加重和刚刚呕吐一次；口头情绪词不成事实。
- 严格结果：未满足全部字段

#### Step 1

- 输入：妈的急死我了，孩子咳得更厉害了，刚刚还吐了一次。
- 完整预期：{"facts":[{"name":"咳嗽加重","polarity":"affirmed","type":"status_change","target":"咳嗽","change":"worsened"},{"name":"呕吐","polarity":"affirmed","type":"symptom","occurrenceCount":1,"timeRaw":"刚刚","resolvedNearNowMinutes":10}],"minFacts":2,"maxFacts":2,"forbidden":[{"name":"焦虑"},{"name":"辱骂"}]}
- Preview：HTTP 200；{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:52:22.745Z","resolvedStart":"2026-08-31T11:52:22+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}<br>{"name":"呕吐","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":1,"duration":null,"temperature":null,"time":{"raw":"刚刚","resolvedStart":"2026-08-31T00:00:00+08:00","resolvedEnd":"2026-09-01T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:52:22.745Z","resolvedStart":"2026-08-31T11:52:22+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}<br>{"name":"呕吐","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":1,"duration":null,"temperature":null,"time":{"raw":"刚刚","resolvedStart":"2026-08-31T00:00:00+08:00","resolvedEnd":"2026-09-01T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：实体:咳嗽加重；类型:status_change；变化:worsened；目标:咳嗽；时间距提交:10分钟内
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-07/SPEECH-07-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-07/SPEECH-07-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-07/SPEECH-07-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-07/SPEECH-07-step-01-refresh.png

### SPEECH-08 — PARTIAL

- 当前人物：测试老人C（senior）
- 原始输入：娃儿今天蔫巴巴的，身上烫得很，量了39度1。
- 执行输入：娃儿今天蔫巴巴的，身上烫得很，量了39度1。
- 用例预期：测试老人C事件中的方言输入至少准确保留 39.1℃，不得写给其他人物；日期级 UI 不得伪装成 00:00。
- 严格结果：未满足全部字段

#### Step 1

- 输入：娃儿今天蔫巴巴的，身上烫得很，量了39度1。
- 完整预期：{"facts":[{"name":"体温","polarity":"affirmed","type":"temperature","temperatureMin":39.1,"temperatureMax":39.1,"timeRaw":"今天"}],"minFacts":1,"maxFacts":2,"uiForbid":["00:00"]}
- Preview：HTTP 200；{"name":"精神状态差","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"今天","resolvedStart":"2026-08-31T00:00:00+08:00","resolvedEnd":"2026-09-01T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-senior"}<br>{"name":"39.1℃","type":"temperature","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":{"min":39.1,"max":39.1,"unit":"℃"},"time":{"raw":"今天","resolvedStart":"2026-08-31T00:00:00+08:00","resolvedEnd":"2026-09-01T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-senior"}
- Confirm：HTTP 201
- 刷新 API：{"name":"精神状态差","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"今天","resolvedStart":"2026-08-31T00:00:00+08:00","resolvedEnd":"2026-09-01T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-senior"}<br>{"name":"39.1℃","type":"temperature","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":{"min":39.1,"max":39.1,"unit":"℃"},"time":{"raw":"今天","resolvedStart":"2026-08-31T00:00:00+08:00","resolvedEnd":"2026-09-01T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-senior"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：不满足：{"pass":false,"missing":[],"forbidden":["00:00"]}
- 失败/差异：UI 错误显示 00:00
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-08/SPEECH-08-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-08/SPEECH-08-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-08/SPEECH-08-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/SPEECH-08/SPEECH-08-step-01-refresh.png

### TIME-01 — FAIL

- 当前人物：测试宝宝A（child）
- 原始输入：刚刚咳得特别厉害。
- 执行输入：刚刚咳得特别厉害。
- 用例预期：严重咳嗽，时间接近提交时刻。
- 严格结果：未满足全部字段

#### Step 1

- 输入：刚刚咳得特别厉害。
- 完整预期：{"facts":[{"name":"咳嗽","polarity":"affirmed","type":"symptom","severity":"severe","timeRaw":"刚刚","resolvedNearNowMinutes":10}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"刚刚","resolvedStart":"2026-08-31T00:00:00+08:00","resolvedEnd":"2026-09-01T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"刚刚","resolvedStart":"2026-08-31T00:00:00+08:00","resolvedEnd":"2026-09-01T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：程度:severe；时间距提交:10分钟内
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TIME-01/TIME-01-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TIME-01/TIME-01-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TIME-01/TIME-01-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TIME-01/TIME-01-step-01-refresh.png

### TIME-02 — FAIL

- 当前人物：测试宝宝A（child）
- 原始输入：昨晚十一点开始肚子疼。
- 执行输入：昨晚十一点开始肚子疼。
- 用例预期：腹痛开始于 2026-08-30 23:00。
- 严格结果：未满足全部字段

#### Step 1

- 输入：昨晚十一点开始肚子疼。
- 完整预期：{"facts":[{"name":"腹痛","polarity":"affirmed","type":"symptom","bodyPart":"腹部","timeRaw":"昨晚十一点","resolvedDate":"2026-08-30","resolvedHour":23}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"腹痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"昨晚","resolvedStart":"2026-08-30T18:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"腹痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"昨晚","resolvedStart":"2026-08-30T18:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：不满足：{"pass":false,"missing":["腹部"],"forbidden":[]}
- 失败/差异：部位:腹部；解析小时:23；UI 缺少 腹部
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TIME-02/TIME-02-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TIME-02/TIME-02-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TIME-02/TIME-02-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TIME-02/TIME-02-step-01-refresh.png

### TIME-03 — FAIL

- 当前人物：测试宝宝A（child）
- 原始输入：昨晚十一点半开始发烧。 → 今天凌晨一点还是38度8。
- 执行输入：昨晚十一点半开始发烧。 → 今天凌晨一点还是38度8。
- 用例预期：跨午夜时间分别为 8月30日23:30 与 8月31日01:00，持续状态保留。
- 严格结果：未满足全部字段

#### Step 1

- 输入：昨晚十一点半开始发烧。
- 完整预期：{"facts":[{"name":"发热","polarity":"affirmed","type":"symptom","timeRaw":"昨晚十一点半","resolvedDate":"2026-08-30","resolvedHour":23,"resolvedMinute":30}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"发热","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"昨晚","resolvedStart":"2026-08-30T18:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"发热","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"昨晚","resolvedStart":"2026-08-30T18:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：解析小时:23；解析分钟:30
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TIME-03/TIME-03-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TIME-03/TIME-03-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TIME-03/TIME-03-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TIME-03/TIME-03-step-01-refresh.png

#### Step 2

- 输入：今天凌晨一点还是38度8。
- 完整预期：{"facts":[{"name":"体温","polarity":"affirmed","type":"temperature","temperatureMin":38.8,"temperatureMax":38.8,"timeRaw":"今天凌晨一点","resolvedDate":"2026-08-31","resolvedHour":1},{"name":"发热持续","polarity":"affirmed","type":"status_change","target":"发热","change":"persistent"}],"minFacts":2,"maxFacts":2}
- Preview：HTTP 200；{"name":"38.8℃","type":"temperature","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":{"min":38.8,"max":38.8,"unit":"℃"},"time":{"raw":"今天凌晨","resolvedStart":"2026-08-31T00:00:00+08:00","resolvedEnd":"2026-08-31T06:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"38.8℃","type":"temperature","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":{"min":38.8,"max":38.8,"unit":"℃"},"time":{"raw":"今天凌晨","resolvedStart":"2026-08-31T00:00:00+08:00","resolvedEnd":"2026-08-31T06:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：解析小时:1；实体:发热持续；类型:status_change；变化:persistent；目标:发热
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TIME-03/TIME-03-step-02-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TIME-03/TIME-03-step-02-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TIME-03/TIME-03-step-02-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TIME-03/TIME-03-step-02-refresh.png

### TIME-04 — PARTIAL

- 当前人物：测试宝宝A（child）
- 原始输入：这个疹子从8月29号开始，到今天已经持续三天了。
- 执行输入：这个疹子从8月29号开始，到今天已经持续三天了。
- 用例预期：皮疹从 8月29日开始并持续三天；日期精度不得伪装为精确 00:00。
- 严格结果：未满足全部字段

#### Step 1

- 输入：这个疹子从8月29号开始，到今天已经持续三天了。
- 完整预期：{"facts":[{"name":"皮疹","polarity":"affirmed","type":"symptom","duration":"3天","timeRaw":"8月29","resolvedDate":"2026-08-29","timePrecision":"day"}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"皮疹","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月29号","resolvedStart":"2026-08-29T00:00:00+08:00","resolvedEnd":"2026-08-30T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"皮疹","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月29号","resolvedStart":"2026-08-29T00:00:00+08:00","resolvedEnd":"2026-08-30T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：持续:3天
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TIME-04/TIME-04-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TIME-04/TIME-04-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TIME-04/TIME-04-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TIME-04/TIME-04-step-01-refresh.png

### TIME-06 — PASS

- 当前人物：测试宝宝A（child）
- 原始输入：明天如果还发烧我再记录。
- 执行输入：明天如果还发烧我再记录。
- 用例预期：未来条件句零入库。
- 严格结果：PASS

#### Step 1

- 输入：明天如果还发烧我再记录。
- 完整预期：{"facts":[],"minFacts":0,"maxFacts":0,"reject":true,"reason":"未来条件计划不得创建健康事实","forbidden":[{"name":"发热","polarity":"affirmed"}]}
- Preview：HTTP 200；[]
- Confirm：未确认（安全门禁用例不确认错误阳性预览）
- 刷新 API：[]
- 数量：Records +0，Organizations +0
- Preview/Confirm/Refresh：无确认链路
- 最终 UI：满足本步 UI 断言
- 失败/差异：无
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TIME-06/TIME-06-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TIME-06/TIME-06-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TIME-06/TIME-06-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TIME-06/TIME-06-step-01-refresh.png

### TIME-07 — FAIL

- 当前人物：测试成人B（self）
- 原始输入：一跑步就咳，不跑的时候基本不咳。
- 执行输入：一跑步就咳，不跑的时候基本不咳。
- 用例预期：本人运动诱发咳嗽，静息时基本不咳；两种上下文不反转。
- 严格结果：未满足全部字段

#### Step 1

- 输入：一跑步就咳，不跑的时候基本不咳。
- 完整预期：{"facts":[{"name":"咳嗽","polarity":"affirmed","type":"symptom","frequency":"跑步"},{"name":"咳嗽","polarity":"negated","type":"symptom","frequency":"不跑"}],"minFacts":1,"maxFacts":2}
- Preview：HTTP 200；{"name":"咳嗽","type":"symptom","polarity":"negated","status":"not_applicable","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:53:54.296Z","resolvedStart":"2026-08-31T11:53:54+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-self"}
- Confirm：HTTP 201
- 刷新 API：{"name":"咳嗽","type":"symptom","polarity":"negated","status":"not_applicable","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:53:54.296Z","resolvedStart":"2026-08-31T11:53:54+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-self"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：极性:affirmed；频率:跑步；频率:不跑
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TIME-07/TIME-07-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TIME-07/TIME-07-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TIME-07/TIME-07-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TIME-07/TIME-07-step-01-refresh.png

### TRACK-01 — FAIL

- 当前人物：测试宝宝A（child）
- 原始输入：今天早上八点开始发烧，体温38度3。 → 十点量到39度1，比早上高了。 → 中午十二点降到38度5了。 → 下午三点已经不烧了，体温37度2。 → 晚上八点又烧到38度8。
- 执行输入：8月30日早上八点开始发烧，体温38度3。 → 8月30日上午十点量到39度1，比早上高了。 → 8月30日中午十二点降到38度5了。 → 8月30日下午三点已经不烧了，体温37度2。 → 8月30日晚上八点又烧到38度8。
- 用例预期：8:00 发热38.3 → 10:00 39.1加重 → 12:00 38.5改善 → 15:00 37.2消失 → 20:00 38.8复发。
- 严格结果：未满足全部字段

#### Step 1

- 输入：8月30日早上八点开始发烧，体温38度3。
- 完整预期：{"facts":[{"name":"发热","polarity":"affirmed","type":"symptom","resolvedDate":"2026-08-30","resolvedHour":8},{"name":"体温","polarity":"affirmed","type":"temperature","temperatureMin":38.3,"temperatureMax":38.3,"resolvedDate":"2026-08-30","resolvedHour":8}],"minFacts":2,"maxFacts":2}
- Preview：HTTP 200；{"name":"发热","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日早上","resolvedStart":"2026-08-30T06:00:00+08:00","resolvedEnd":"2026-08-30T09:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}<br>{"name":"38.3℃","type":"temperature","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":{"min":38.3,"max":38.3,"unit":"℃"},"time":{"raw":"8月30日早上","resolvedStart":"2026-08-30T06:00:00+08:00","resolvedEnd":"2026-08-30T09:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"发热","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日早上","resolvedStart":"2026-08-30T06:00:00+08:00","resolvedEnd":"2026-08-30T09:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}<br>{"name":"38.3℃","type":"temperature","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":{"min":38.3,"max":38.3,"unit":"℃"},"time":{"raw":"8月30日早上","resolvedStart":"2026-08-30T06:00:00+08:00","resolvedEnd":"2026-08-30T09:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：解析小时:8
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-01/TRACK-01-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-01/TRACK-01-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-01/TRACK-01-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-01/TRACK-01-step-01-refresh.png

#### Step 2

- 输入：8月30日上午十点量到39度1，比早上高了。
- 完整预期：{"facts":[{"name":"体温","polarity":"affirmed","type":"temperature","temperatureMin":39.1,"temperatureMax":39.1,"resolvedDate":"2026-08-30","resolvedHour":10},{"name":"发热加重","polarity":"affirmed","type":"status_change","target":"发热","change":"worsened"}],"minFacts":2,"maxFacts":2}
- Preview：HTTP 200；{"name":"39.1℃","type":"temperature","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":{"min":39.1,"max":39.1,"unit":"℃"},"time":{"raw":"8月30日上午","resolvedStart":"2026-08-30T09:00:00+08:00","resolvedEnd":"2026-08-30T12:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"39.1℃","type":"temperature","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":{"min":39.1,"max":39.1,"unit":"℃"},"time":{"raw":"8月30日上午","resolvedStart":"2026-08-30T09:00:00+08:00","resolvedEnd":"2026-08-30T12:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：解析小时:10；实体:发热加重；类型:status_change；变化:worsened；目标:发热
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-01/TRACK-01-step-02-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-01/TRACK-01-step-02-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-01/TRACK-01-step-02-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-01/TRACK-01-step-02-refresh.png

#### Step 3

- 输入：8月30日中午十二点降到38度5了。
- 完整预期：{"facts":[{"name":"体温","polarity":"affirmed","type":"temperature","temperatureMin":38.5,"temperatureMax":38.5,"resolvedDate":"2026-08-30","resolvedHour":12},{"name":"发热改善","polarity":"affirmed","type":"status_change","target":"发热","change":"improved"}],"minFacts":2,"maxFacts":2}
- Preview：HTTP 200；{"name":"38.5℃","type":"temperature","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":{"min":38.5,"max":38.5,"unit":"℃"},"time":{"raw":"8月30日中午","resolvedStart":"2026-08-30T12:00:00+08:00","resolvedEnd":"2026-08-30T13:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"38.5℃","type":"temperature","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":{"min":38.5,"max":38.5,"unit":"℃"},"time":{"raw":"8月30日中午","resolvedStart":"2026-08-30T12:00:00+08:00","resolvedEnd":"2026-08-30T13:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：无实际事实
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-01/TRACK-01-step-03-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-01/TRACK-01-step-03-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-01/TRACK-01-step-03-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-01/TRACK-01-step-03-refresh.png

#### Step 4

- 输入：8月30日下午三点已经不烧了，体温37度2。
- 完整预期：{"facts":[{"name":"体温","polarity":"affirmed","type":"temperature","temperatureMin":37.2,"temperatureMax":37.2,"resolvedDate":"2026-08-30","resolvedHour":15},{"name":"发热消失","polarity":"affirmed","type":"status_change","target":"发热","change":"resolved"}],"minFacts":2,"maxFacts":2}
- Preview：HTTP 200；{"name":"发热","type":"symptom","polarity":"negated","status":"not_applicable","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日下午","resolvedStart":"2026-08-30T14:00:00+08:00","resolvedEnd":"2026-08-30T18:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}<br>{"name":"发热消失","type":"status_change","polarity":"affirmed","status":"resolved","change":"resolved","target":"发热","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日下午","resolvedStart":"2026-08-30T14:00:00+08:00","resolvedEnd":"2026-08-30T18:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}<br>{"name":"37.2℃","type":"temperature","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":{"min":37.2,"max":37.2,"unit":"℃"},"time":{"raw":"8月30日下午","resolvedStart":"2026-08-30T14:00:00+08:00","resolvedEnd":"2026-08-30T18:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"发热","type":"symptom","polarity":"negated","status":"not_applicable","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日下午","resolvedStart":"2026-08-30T14:00:00+08:00","resolvedEnd":"2026-08-30T18:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}<br>{"name":"发热消失","type":"status_change","polarity":"affirmed","status":"resolved","change":"resolved","target":"发热","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日下午","resolvedStart":"2026-08-30T14:00:00+08:00","resolvedEnd":"2026-08-30T18:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}<br>{"name":"37.2℃","type":"temperature","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":{"min":37.2,"max":37.2,"unit":"℃"},"time":{"raw":"8月30日下午","resolvedStart":"2026-08-30T14:00:00+08:00","resolvedEnd":"2026-08-30T18:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：解析小时:15
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-01/TRACK-01-step-04-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-01/TRACK-01-step-04-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-01/TRACK-01-step-04-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-01/TRACK-01-step-04-refresh.png

#### Step 5

- 输入：8月30日晚上八点又烧到38度8。
- 完整预期：{"facts":[{"name":"体温","polarity":"affirmed","type":"temperature","temperatureMin":38.8,"temperatureMax":38.8,"resolvedDate":"2026-08-30","resolvedHour":20},{"name":"发热复发","polarity":"affirmed","type":"status_change","target":"发热","change":"recurred"}],"minFacts":2,"maxFacts":2}
- Preview：HTTP 200；{"name":"发热","type":"symptom","polarity":"affirmed","status":"recurrent","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日晚上","resolvedStart":"2026-08-30T18:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}<br>{"name":"30℃","type":"temperature","polarity":"affirmed","status":"recurrent","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":{"min":30,"max":30,"unit":"℃"},"time":{"raw":"8月30日晚上","resolvedStart":"2026-08-30T18:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}<br>{"name":"38.8℃","type":"temperature","polarity":"affirmed","status":"recurrent","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":{"min":38.8,"max":38.8,"unit":"℃"},"time":{"raw":"8月30日晚上","resolvedStart":"2026-08-30T18:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}<br>{"name":"发热复发","type":"status_change","polarity":"affirmed","status":"recurrent","change":"recurred","target":"发热","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日晚上","resolvedStart":"2026-08-30T18:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"发热","type":"symptom","polarity":"affirmed","status":"recurrent","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日晚上","resolvedStart":"2026-08-30T18:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}<br>{"name":"30℃","type":"temperature","polarity":"affirmed","status":"recurrent","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":{"min":30,"max":30,"unit":"℃"},"time":{"raw":"8月30日晚上","resolvedStart":"2026-08-30T18:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}<br>{"name":"38.8℃","type":"temperature","polarity":"affirmed","status":"recurrent","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":{"min":38.8,"max":38.8,"unit":"℃"},"time":{"raw":"8月30日晚上","resolvedStart":"2026-08-30T18:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}<br>{"name":"发热复发","type":"status_change","polarity":"affirmed","status":"recurrent","change":"recurred","target":"发热","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日晚上","resolvedStart":"2026-08-30T18:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：解析小时:20
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-01/TRACK-01-step-05-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-01/TRACK-01-step-05-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-01/TRACK-01-step-05-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-01/TRACK-01-step-05-refresh.png

### TRACK-02 — FAIL

- 当前人物：测试宝宝A（child）
- 原始输入：昨天晚上开始偶尔咳几声。 → 今天上午咳得比昨晚频繁了。 → 下午一直咳，差不多几分钟就咳一次。 → 晚上好多了，现在只是偶尔咳两声。 → 睡着以后就没再咳。
- 执行输入：8月29日晚上开始偶尔咳几声。 → 8月30日上午咳得比昨晚频繁了。 → 8月30日下午一直咳，差不多几分钟就咳一次。 → 8月30日晚上好多了，现在只是偶尔咳两声。 → 8月30日睡着以后就没再咳。
- 用例预期：偶发 → 频率升高 → 持续且几分钟一次 → 改善为偶尔两声 → 睡后消失。
- 严格结果：未满足全部字段

#### Step 1

- 输入：8月29日晚上开始偶尔咳几声。
- 完整预期：{"facts":[{"name":"咳嗽","polarity":"affirmed","type":"symptom","frequency":"occasional","resolvedDate":"2026-08-29"}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":"occasional","occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月29日晚上","resolvedStart":"2026-08-29T18:00:00+08:00","resolvedEnd":"2026-08-30T00:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":"occasional","occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月29日晚上","resolvedStart":"2026-08-29T18:00:00+08:00","resolvedEnd":"2026-08-30T00:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：无
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-02/TRACK-02-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-02/TRACK-02-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-02/TRACK-02-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-02/TRACK-02-step-01-refresh.png

#### Step 2

- 输入：8月30日上午咳得比昨晚频繁了。
- 完整预期：{"facts":[{"name":"咳嗽加重","polarity":"affirmed","type":"status_change","target":"咳嗽","change":"worsened","frequency":"frequent"}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":"frequent","occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日上午","resolvedStart":"2026-08-30T09:00:00+08:00","resolvedEnd":"2026-08-30T12:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":"frequent","occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日上午","resolvedStart":"2026-08-30T09:00:00+08:00","resolvedEnd":"2026-08-30T12:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：实体:咳嗽加重；类型:status_change；变化:worsened；目标:咳嗽
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-02/TRACK-02-step-02-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-02/TRACK-02-step-02-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-02/TRACK-02-step-02-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-02/TRACK-02-step-02-refresh.png

#### Step 3

- 输入：8月30日下午一直咳，差不多几分钟就咳一次。
- 完整预期：{"facts":[{"name":"咳嗽持续","polarity":"affirmed","type":"status_change","target":"咳嗽","change":"persistent","frequency":"几分钟"}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":"continuous","occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日下午","resolvedStart":"2026-08-30T14:00:00+08:00","resolvedEnd":"2026-08-30T18:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}<br>{"name":"咳嗽持续","type":"status_change","polarity":"affirmed","status":"active","change":"persistent","target":"咳嗽","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":"continuous","occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日下午","resolvedStart":"2026-08-30T14:00:00+08:00","resolvedEnd":"2026-08-30T18:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}<br>{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":1,"duration":null,"temperature":null,"time":{"raw":"8月30日下午","resolvedStart":"2026-08-30T14:00:00+08:00","resolvedEnd":"2026-08-30T18:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":"continuous","occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日下午","resolvedStart":"2026-08-30T14:00:00+08:00","resolvedEnd":"2026-08-30T18:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}<br>{"name":"咳嗽持续","type":"status_change","polarity":"affirmed","status":"active","change":"persistent","target":"咳嗽","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":"continuous","occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日下午","resolvedStart":"2026-08-30T14:00:00+08:00","resolvedEnd":"2026-08-30T18:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}<br>{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":1,"duration":null,"temperature":null,"time":{"raw":"8月30日下午","resolvedStart":"2026-08-30T14:00:00+08:00","resolvedEnd":"2026-08-30T18:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：频率:几分钟
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-02/TRACK-02-step-03-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-02/TRACK-02-step-03-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-02/TRACK-02-step-03-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-02/TRACK-02-step-03-refresh.png

#### Step 4

- 输入：8月30日晚上好多了，现在只是偶尔咳两声。
- 完整预期：{"facts":[{"name":"咳嗽改善","polarity":"affirmed","type":"status_change","target":"咳嗽","change":"improved","frequency":"occasional","occurrenceCount":2}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"咳嗽好转","type":"status_change","polarity":"affirmed","status":"improving","change":"improved","target":"咳嗽","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日晚上","resolvedStart":"2026-08-30T18:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}<br>{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":"occasional","occurrenceCount":2,"duration":null,"temperature":null,"time":{"raw":"现在","resolvedStart":"2026-08-31T00:00:00+08:00","resolvedEnd":"2026-09-01T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"咳嗽好转","type":"status_change","polarity":"affirmed","status":"improving","change":"improved","target":"咳嗽","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日晚上","resolvedStart":"2026-08-30T18:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}<br>{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":"occasional","occurrenceCount":2,"duration":null,"temperature":null,"time":{"raw":"现在","resolvedStart":"2026-08-31T00:00:00+08:00","resolvedEnd":"2026-09-01T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：频率:occasional；次数:2
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-02/TRACK-02-step-04-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-02/TRACK-02-step-04-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-02/TRACK-02-step-04-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-02/TRACK-02-step-04-refresh.png

#### Step 5

- 输入：8月30日睡着以后就没再咳。
- 完整预期：{"facts":[{"name":"咳嗽消失","polarity":"affirmed","type":"status_change","target":"咳嗽","change":"resolved"}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日","resolvedStart":"2026-08-30T00:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}<br>{"name":"咳嗽消失","type":"status_change","polarity":"affirmed","status":"resolved","change":"resolved","target":"咳嗽","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日","resolvedStart":"2026-08-30T00:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日","resolvedStart":"2026-08-30T00:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}<br>{"name":"咳嗽消失","type":"status_change","polarity":"affirmed","status":"resolved","change":"resolved","target":"咳嗽","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日","resolvedStart":"2026-08-30T00:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：无
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-02/TRACK-02-step-05-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-02/TRACK-02-step-05-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-02/TRACK-02-step-05-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-02/TRACK-02-step-05-refresh.png

### TRACK-03 — FAIL

- 当前人物：测试成人B（self）
- 原始输入：早上起床的时候肚子有点疼，大概三分。 → 十一点更疼了，大概有六分。 → 下午还是六分左右，没继续加重。 → 晚饭以后轻了一些，现在两分。
- 执行输入：8月30日早上起床的时候肚子有点疼，大概三分。 → 8月30日十一点更疼了，大概有六分。 → 8月30日下午还是六分左右，没继续加重。 → 8月30日晚饭以后轻了一些，现在两分。
- 用例预期：腹痛 3分 → 6分加重 → 仍6分未继续加重 → 2分改善。
- 严格结果：未满足全部字段

#### Step 1

- 输入：8月30日早上起床的时候肚子有点疼，大概三分。
- 完整预期：{"facts":[{"name":"腹痛","polarity":"affirmed","type":"symptom","bodyPart":"腹部","severityScale":"3","resolvedDate":"2026-08-30"}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"疼痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":"mild","severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日早上","resolvedStart":"2026-08-30T06:00:00+08:00","resolvedEnd":"2026-08-30T09:00:00+08:00","precision":"period"},"subjectMemberId":"member-self"}
- Confirm：HTTP 201
- 刷新 API：{"name":"疼痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":"mild","severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日早上","resolvedStart":"2026-08-30T06:00:00+08:00","resolvedEnd":"2026-08-30T09:00:00+08:00","precision":"period"},"subjectMemberId":"member-self"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：不满足：{"pass":false,"missing":["腹痛","腹部"],"forbidden":[]}
- 失败/差异：实体:腹痛；部位:腹部；评分:3；UI 缺少 腹痛；UI 缺少 腹部
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-03/TRACK-03-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-03/TRACK-03-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-03/TRACK-03-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-03/TRACK-03-step-01-refresh.png

#### Step 2

- 输入：8月30日十一点更疼了，大概有六分。
- 完整预期：{"facts":[{"name":"腹痛加重","polarity":"affirmed","type":"status_change","target":"腹痛","change":"worsened","severityScale":"6","resolvedHour":11}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"疼痛疼痛加重","type":"status_change","polarity":"affirmed","status":"active","change":"worsened","target":"疼痛","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日","resolvedStart":"2026-08-30T00:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-self"}
- Confirm：HTTP 201
- 刷新 API：{"name":"疼痛疼痛加重","type":"status_change","polarity":"affirmed","status":"active","change":"worsened","target":"疼痛","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日","resolvedStart":"2026-08-30T00:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-self"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：不满足：{"pass":false,"missing":["腹痛"],"forbidden":[]}
- 失败/差异：实体:腹痛加重；目标:腹痛；评分:6；解析小时:11；UI 缺少 腹痛
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-03/TRACK-03-step-02-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-03/TRACK-03-step-02-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-03/TRACK-03-step-02-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-03/TRACK-03-step-02-refresh.png

#### Step 3

- 输入：8月30日下午还是六分左右，没继续加重。
- 完整预期：{"facts":[{"name":"腹痛未加重","polarity":"affirmed","type":"status_change","target":"腹痛","change":"unchanged","severityScale":"6"}],"minFacts":1,"maxFacts":1,"forbidden":[{"change":"worsened"}]}
- Preview：HTTP 200；{"name":"疼痛未加重","type":"status_change","polarity":"negated","status":"active","change":"unchanged","target":"疼痛","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日下午","resolvedStart":"2026-08-30T14:00:00+08:00","resolvedEnd":"2026-08-30T18:00:00+08:00","precision":"period"},"subjectMemberId":"member-self"}
- Confirm：HTTP 201
- 刷新 API：{"name":"疼痛未加重","type":"status_change","polarity":"negated","status":"active","change":"unchanged","target":"疼痛","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日下午","resolvedStart":"2026-08-30T14:00:00+08:00","resolvedEnd":"2026-08-30T18:00:00+08:00","precision":"period"},"subjectMemberId":"member-self"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：不满足：{"pass":false,"missing":["腹痛"],"forbidden":[]}
- 失败/差异：实体:腹痛未加重；极性:affirmed；目标:腹痛；评分:6；UI 缺少 腹痛
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-03/TRACK-03-step-03-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-03/TRACK-03-step-03-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-03/TRACK-03-step-03-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-03/TRACK-03-step-03-refresh.png

#### Step 4

- 输入：8月30日晚饭以后轻了一些，现在两分。
- 完整预期：{"facts":[{"name":"腹痛改善","polarity":"affirmed","type":"status_change","target":"腹痛","change":"improved","severityScale":"2"}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"疼痛好转","type":"status_change","polarity":"affirmed","status":"improving","change":"improved","target":"疼痛","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日","resolvedStart":"2026-08-30T00:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-self"}
- Confirm：HTTP 201
- 刷新 API：{"name":"疼痛好转","type":"status_change","polarity":"affirmed","status":"improving","change":"improved","target":"疼痛","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日","resolvedStart":"2026-08-30T00:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-self"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：不满足：{"pass":false,"missing":["腹痛","2"],"forbidden":[]}
- 失败/差异：实体:腹痛改善；目标:腹痛；评分:2；UI 缺少 腹痛；UI 缺少 2
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-03/TRACK-03-step-04-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-03/TRACK-03-step-04-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-03/TRACK-03-step-04-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-03/TRACK-03-step-04-refresh.png

### TRACK-04 — FAIL

- 当前人物：测试宝宝A（child）
- 原始输入：凌晨一点吐了一次。 → 凌晨三点又吐了两次。 → 从早上开始就没再吐。 → 下午四点又吐了一次。
- 执行输入：8月30日凌晨一点吐了一次。 → 8月30日凌晨三点又吐了两次。 → 8月30日从早上开始就没再吐。 → 8月30日下午四点又吐了一次。
- 用例预期：01:00 吐1次 → 03:00 又吐2次 → 早上停止 → 16:00 复发1次。
- 严格结果：未满足全部字段

#### Step 1

- 输入：8月30日凌晨一点吐了一次。
- 完整预期：{"facts":[{"name":"呕吐","polarity":"affirmed","type":"symptom","occurrenceCount":1,"resolvedDate":"2026-08-30","resolvedHour":1}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"呕吐","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":1,"duration":null,"temperature":null,"time":{"raw":"8月30日凌晨","resolvedStart":"2026-08-30T00:00:00+08:00","resolvedEnd":"2026-08-30T06:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"呕吐","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":1,"duration":null,"temperature":null,"time":{"raw":"8月30日凌晨","resolvedStart":"2026-08-30T00:00:00+08:00","resolvedEnd":"2026-08-30T06:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：解析小时:1
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-04/TRACK-04-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-04/TRACK-04-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-04/TRACK-04-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-04/TRACK-04-step-01-refresh.png

#### Step 2

- 输入：8月30日凌晨三点又吐了两次。
- 完整预期：{"facts":[{"name":"呕吐复发","polarity":"affirmed","type":"status_change","target":"呕吐","change":"recurred","occurrenceCount":2,"resolvedHour":3}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"呕吐","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":2,"duration":null,"temperature":null,"time":{"raw":"8月30日凌晨","resolvedStart":"2026-08-30T00:00:00+08:00","resolvedEnd":"2026-08-30T06:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"呕吐","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":2,"duration":null,"temperature":null,"time":{"raw":"8月30日凌晨","resolvedStart":"2026-08-30T00:00:00+08:00","resolvedEnd":"2026-08-30T06:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：实体:呕吐复发；类型:status_change；变化:recurred；目标:呕吐；解析小时:3
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-04/TRACK-04-step-02-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-04/TRACK-04-step-02-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-04/TRACK-04-step-02-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-04/TRACK-04-step-02-refresh.png

#### Step 3

- 输入：8月30日从早上开始就没再吐。
- 完整预期：{"facts":[{"name":"呕吐消失","polarity":"affirmed","type":"status_change","target":"呕吐","change":"resolved"}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"呕吐","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日","resolvedStart":"2026-08-30T00:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}<br>{"name":"呕吐消失","type":"status_change","polarity":"affirmed","status":"resolved","change":"resolved","target":"呕吐","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日","resolvedStart":"2026-08-30T00:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"呕吐","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日","resolvedStart":"2026-08-30T00:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}<br>{"name":"呕吐消失","type":"status_change","polarity":"affirmed","status":"resolved","change":"resolved","target":"呕吐","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日","resolvedStart":"2026-08-30T00:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：无
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-04/TRACK-04-step-03-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-04/TRACK-04-step-03-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-04/TRACK-04-step-03-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-04/TRACK-04-step-03-refresh.png

#### Step 4

- 输入：8月30日下午四点又吐了一次。
- 完整预期：{"facts":[{"name":"呕吐复发","polarity":"affirmed","type":"status_change","target":"呕吐","change":"recurred","occurrenceCount":1,"resolvedHour":16}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"呕吐","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":1,"duration":null,"temperature":null,"time":{"raw":"8月30日下午","resolvedStart":"2026-08-30T14:00:00+08:00","resolvedEnd":"2026-08-30T18:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"呕吐","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":1,"duration":null,"temperature":null,"time":{"raw":"8月30日下午","resolvedStart":"2026-08-30T14:00:00+08:00","resolvedEnd":"2026-08-30T18:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：实体:呕吐复发；类型:status_change；变化:recurred；目标:呕吐；解析小时:16
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-04/TRACK-04-step-04-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-04/TRACK-04-step-04-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-04/TRACK-04-step-04-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-04/TRACK-04-step-04-refresh.png

### TRACK-05 — FAIL

- 当前人物：测试宝宝A（child）
- 原始输入：今天早上发烧38度5，还有一点咳嗽。 → 下午体温已经正常了，但是咳嗽比早上厉害。 → 晚上没有再发烧，咳嗽还是很多，还开始流鼻涕。
- 执行输入：8月30日早上发烧38度5，还有一点咳嗽。 → 8月30日下午体温已经正常了，但是咳嗽比早上厉害。 → 8月30日晚上没有再发烧，咳嗽还是很多，还开始流鼻涕。
- 用例预期：发热/38.5/轻咳 → 退热且咳嗽加重 → 无再发热、咳嗽持续多、加入流鼻涕。
- 严格结果：未满足全部字段

#### Step 1

- 输入：8月30日早上发烧38度5，还有一点咳嗽。
- 完整预期：{"facts":[{"name":"发热","polarity":"affirmed","type":"symptom"},{"name":"体温","polarity":"affirmed","type":"temperature","temperatureMin":38.5,"temperatureMax":38.5},{"name":"咳嗽","polarity":"affirmed","type":"symptom","severity":"mild"}],"minFacts":3,"maxFacts":3}
- Preview：HTTP 200；{"name":"发热","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日早上","resolvedStart":"2026-08-30T06:00:00+08:00","resolvedEnd":"2026-08-30T09:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}<br>{"name":"38.5℃","type":"temperature","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":{"min":38.5,"max":38.5,"unit":"℃"},"time":{"raw":"8月30日早上","resolvedStart":"2026-08-30T06:00:00+08:00","resolvedEnd":"2026-08-30T09:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}<br>{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日早上","resolvedStart":"2026-08-30T06:00:00+08:00","resolvedEnd":"2026-08-30T09:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"发热","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日早上","resolvedStart":"2026-08-30T06:00:00+08:00","resolvedEnd":"2026-08-30T09:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}<br>{"name":"38.5℃","type":"temperature","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":{"min":38.5,"max":38.5,"unit":"℃"},"time":{"raw":"8月30日早上","resolvedStart":"2026-08-30T06:00:00+08:00","resolvedEnd":"2026-08-30T09:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}<br>{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日早上","resolvedStart":"2026-08-30T06:00:00+08:00","resolvedEnd":"2026-08-30T09:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：程度:mild
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-05/TRACK-05-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-05/TRACK-05-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-05/TRACK-05-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-05/TRACK-05-step-01-refresh.png

#### Step 2

- 输入：8月30日下午体温已经正常了，但是咳嗽比早上厉害。
- 完整预期：{"facts":[{"name":"发热消失","polarity":"affirmed","type":"status_change","target":"发热","change":"resolved"},{"name":"咳嗽加重","polarity":"affirmed","type":"status_change","target":"咳嗽","change":"worsened"}],"minFacts":2,"maxFacts":2}
- Preview：HTTP 200；{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"早上","resolvedStart":"2026-08-30T06:00:00+08:00","resolvedEnd":"2026-08-30T09:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"早上","resolvedStart":"2026-08-30T06:00:00+08:00","resolvedEnd":"2026-08-30T09:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：实体:发热消失；类型:status_change；变化:resolved；目标:发热；实体:咳嗽加重；变化:worsened；目标:咳嗽
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-05/TRACK-05-step-02-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-05/TRACK-05-step-02-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-05/TRACK-05-step-02-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-05/TRACK-05-step-02-refresh.png

#### Step 3

- 输入：8月30日晚上没有再发烧，咳嗽还是很多，还开始流鼻涕。
- 完整预期：{"facts":[{"name":"发热","polarity":"negated","type":"symptom","status":"resolved"},{"name":"咳嗽持续","polarity":"affirmed","type":"status_change","target":"咳嗽","change":"persistent","frequency":"frequent"},{"name":"流鼻涕","polarity":"affirmed","type":"symptom"}],"minFacts":3,"maxFacts":3,"forbidden":[{"name":"发热","polarity":"affirmed"}]}
- Preview：HTTP 200；{"name":"发热","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日晚上","resolvedStart":"2026-08-30T18:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}<br>{"name":"发热消失","type":"status_change","polarity":"affirmed","status":"resolved","change":"resolved","target":"发热","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日晚上","resolvedStart":"2026-08-30T18:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}<br>{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日晚上","resolvedStart":"2026-08-30T18:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}<br>{"name":"流鼻涕","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日晚上","resolvedStart":"2026-08-30T18:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"发热","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日晚上","resolvedStart":"2026-08-30T18:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}<br>{"name":"发热消失","type":"status_change","polarity":"affirmed","status":"resolved","change":"resolved","target":"发热","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日晚上","resolvedStart":"2026-08-30T18:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}<br>{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日晚上","resolvedStart":"2026-08-30T18:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}<br>{"name":"流鼻涕","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日晚上","resolvedStart":"2026-08-30T18:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：极性:negated；状态:resolved；实体:咳嗽持续；变化:persistent；目标:咳嗽；频率:frequent；出现 2 条禁用事实
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-05/TRACK-05-step-03-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-05/TRACK-05-step-03-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-05/TRACK-05-step-03-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-05/TRACK-05-step-03-refresh.png

### TRACK-06 — FAIL

- 当前人物：测试成人B（self）
- 原始输入：昨天开始头疼、恶心，还吐了一次。 → 今天不吐了，也不恶心了，但是头还是疼。 → 头疼比昨天轻一点。
- 执行输入：8月29日开始头疼、恶心，还吐了一次。 → 8月30日不吐了，也不恶心了，但是头还是疼。 → 8月30日头疼比昨天轻一点。
- 用例预期：头痛/恶心/呕吐1次 → 呕吐和恶心消失、头痛持续 → 头痛改善。
- 严格结果：未满足全部字段

#### Step 1

- 输入：8月29日开始头疼、恶心，还吐了一次。
- 完整预期：{"facts":[{"name":"头痛","polarity":"affirmed","type":"symptom"},{"name":"恶心","polarity":"affirmed","type":"symptom"},{"name":"呕吐","polarity":"affirmed","type":"symptom","occurrenceCount":1}],"minFacts":3,"maxFacts":3}
- Preview：HTTP 200；{"name":"头痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"头","laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月29日","resolvedStart":"2026-08-29T00:00:00+08:00","resolvedEnd":"2026-08-30T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-self"}<br>{"name":"呕吐","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":1,"duration":null,"temperature":null,"time":{"raw":"8月29日","resolvedStart":"2026-08-29T00:00:00+08:00","resolvedEnd":"2026-08-30T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-self"}
- Confirm：HTTP 201
- 刷新 API：{"name":"头痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"头","laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月29日","resolvedStart":"2026-08-29T00:00:00+08:00","resolvedEnd":"2026-08-30T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-self"}<br>{"name":"呕吐","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":1,"duration":null,"temperature":null,"time":{"raw":"8月29日","resolvedStart":"2026-08-29T00:00:00+08:00","resolvedEnd":"2026-08-30T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-self"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：不满足：{"pass":false,"missing":["恶心"],"forbidden":[]}
- 失败/差异：实体:恶心；UI 缺少 恶心
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-06/TRACK-06-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-06/TRACK-06-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-06/TRACK-06-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-06/TRACK-06-step-01-refresh.png

#### Step 2

- 输入：8月30日不吐了，也不恶心了，但是头还是疼。
- 完整预期：{"facts":[{"name":"呕吐消失","polarity":"affirmed","type":"status_change","target":"呕吐","change":"resolved"},{"name":"恶心消失","polarity":"affirmed","type":"status_change","target":"恶心","change":"resolved"},{"name":"头痛持续","polarity":"affirmed","type":"status_change","target":"头痛","change":"persistent"}],"minFacts":3,"maxFacts":3}
- Preview：HTTP 200；{"name":"呕吐","type":"symptom","polarity":"negated","status":"not_applicable","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日","resolvedStart":"2026-08-30T00:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-self"}<br>{"name":"呕吐消失","type":"status_change","polarity":"affirmed","status":"resolved","change":"resolved","target":"呕吐","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日","resolvedStart":"2026-08-30T00:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-self"}<br>{"name":"疼痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"头","laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日","resolvedStart":"2026-08-30T00:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-self"}
- Confirm：HTTP 201
- 刷新 API：{"name":"呕吐","type":"symptom","polarity":"negated","status":"not_applicable","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日","resolvedStart":"2026-08-30T00:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-self"}<br>{"name":"呕吐消失","type":"status_change","polarity":"affirmed","status":"resolved","change":"resolved","target":"呕吐","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日","resolvedStart":"2026-08-30T00:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-self"}<br>{"name":"疼痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"头","laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日","resolvedStart":"2026-08-30T00:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-self"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：不满足：{"pass":false,"missing":["恶心"],"forbidden":[]}
- 失败/差异：实体:恶心消失；类型:status_change；变化:resolved；目标:恶心；实体:头痛持续；变化:persistent；目标:头痛；UI 缺少 恶心
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-06/TRACK-06-step-02-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-06/TRACK-06-step-02-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-06/TRACK-06-step-02-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-06/TRACK-06-step-02-refresh.png

#### Step 3

- 输入：8月30日头疼比昨天轻一点。
- 完整预期：{"facts":[{"name":"头痛改善","polarity":"affirmed","type":"status_change","target":"头痛","change":"improved"}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"头痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"头","laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"昨天","resolvedStart":"2026-08-30T00:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-self"}
- Confirm：HTTP 201
- 刷新 API：{"name":"头痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"头","laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"昨天","resolvedStart":"2026-08-30T00:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-self"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：实体:头痛改善；类型:status_change；变化:improved；目标:头痛
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-06/TRACK-06-step-03-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-06/TRACK-06-step-03-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-06/TRACK-06-step-03-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-06/TRACK-06-step-03-refresh.png

### TRACK-07 — FAIL

- 当前人物：测试宝宝A（child）
- 原始输入：早上肚脐周围疼。 → 下午感觉疼的位置跑到右下腹了。 → 现在肚脐周围不疼了，主要是右下腹疼。
- 执行输入：8月30日早上肚脐周围疼。 → 8月30日下午感觉疼的位置跑到右下腹了。 → 8月30日晚上肚脐周围不疼了，主要是右下腹疼。
- 用例预期：肚脐周围痛 → 转到右下腹 → 原部位消失、右下腹持续。
- 严格结果：未满足全部字段

#### Step 1

- 输入：8月30日早上肚脐周围疼。
- 完整预期：{"facts":[{"name":"疼痛","polarity":"affirmed","type":"symptom","bodyPart":"肚脐周围"}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"腹痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"肚脐周围","laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日早上","resolvedStart":"2026-08-30T06:00:00+08:00","resolvedEnd":"2026-08-30T09:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"腹痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"肚脐周围","laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日早上","resolvedStart":"2026-08-30T06:00:00+08:00","resolvedEnd":"2026-08-30T09:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：不满足：{"pass":false,"missing":["肚脐周围"],"forbidden":[]}
- 失败/差异：UI 缺少 肚脐周围
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-07/TRACK-07-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-07/TRACK-07-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-07/TRACK-07-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-07/TRACK-07-step-01-refresh.png

#### Step 2

- 输入：8月30日下午感觉疼的位置跑到右下腹了。
- 完整预期：{"facts":[{"name":"疼痛","polarity":"affirmed","type":"symptom","bodyPart":"右下腹","laterality":"right"}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"疼痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"右下腹","laterality":"right","severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日下午","resolvedStart":"2026-08-30T14:00:00+08:00","resolvedEnd":"2026-08-30T18:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"疼痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"右下腹","laterality":"right","severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日下午","resolvedStart":"2026-08-30T14:00:00+08:00","resolvedEnd":"2026-08-30T18:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：不满足：{"pass":false,"missing":["右下腹","右"],"forbidden":[]}
- 失败/差异：UI 缺少 右下腹；UI 缺少 右
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-07/TRACK-07-step-02-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-07/TRACK-07-step-02-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-07/TRACK-07-step-02-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-07/TRACK-07-step-02-refresh.png

#### Step 3

- 输入：8月30日晚上肚脐周围不疼了，主要是右下腹疼。
- 完整预期：{"facts":[{"name":"肚脐周围疼痛消失","polarity":"affirmed","type":"status_change","bodyPart":"肚脐周围","change":"resolved"},{"name":"右下腹疼痛持续","polarity":"affirmed","type":"status_change","bodyPart":"右下腹","laterality":"right","change":"persistent"}],"minFacts":2,"maxFacts":2}
- Preview：HTTP 200；{"name":"疼痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"右下腹","laterality":"right","severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日晚上","resolvedStart":"2026-08-30T18:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"疼痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"右下腹","laterality":"right","severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日晚上","resolvedStart":"2026-08-30T18:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：不满足：{"pass":false,"missing":["肚脐周围疼痛","肚脐周围","右下腹疼痛","右下腹","右"],"forbidden":[]}
- 失败/差异：实体:肚脐周围疼痛消失；类型:status_change；变化:resolved；部位:肚脐周围；实体:右下腹疼痛持续；变化:persistent；UI 缺少 肚脐周围疼痛；UI 缺少 肚脐周围；UI 缺少 右下腹疼痛；UI 缺少 右下腹；UI 缺少 右
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-07/TRACK-07-step-03-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-07/TRACK-07-step-03-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-07/TRACK-07-step-03-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-07/TRACK-07-step-03-refresh.png

### TRACK-08 — FAIL

- 当前人物：测试宝宝A（child）
- 原始输入：左胳膊起了一片红疹。 → 刚才说错了，不是左胳膊，是右胳膊。
- 执行输入：左胳膊起了一片红疹。 → 刚才说错了，不是左胳膊，是右胳膊。
- 用例预期：当前有效侧别为右，左侧旧事实被 superseded/revised。
- 严格结果：未满足全部字段

#### Step 1

- 输入：左胳膊起了一片红疹。
- 完整预期：{"facts":[{"name":"皮疹","polarity":"affirmed","type":"symptom","bodyPart":"胳膊","laterality":"left"}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"手臂发红","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"左手臂","laterality":"left","severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:58:55.376Z","resolvedStart":"2026-08-31T11:58:55+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}<br>{"name":"皮疹","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"左手臂","laterality":"left","severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:58:55.376Z","resolvedStart":"2026-08-31T11:58:55+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"手臂发红","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"左手臂","laterality":"left","severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:58:55.376Z","resolvedStart":"2026-08-31T11:58:55+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}<br>{"name":"皮疹","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"左手臂","laterality":"left","severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:58:55.376Z","resolvedStart":"2026-08-31T11:58:55+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：不满足：{"pass":false,"missing":["胳膊","左"],"forbidden":[]}
- 失败/差异：UI 缺少 胳膊；UI 缺少 左
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-08/TRACK-08-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-08/TRACK-08-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-08/TRACK-08-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-08/TRACK-08-step-01-refresh.png

#### Step 2

- 输入：刚才说错了，不是左胳膊，是右胳膊。
- 完整预期：{"facts":[{"name":"皮疹纠正","polarity":"affirmed","type":"status_change","bodyPart":"胳膊","laterality":"right","change":"corrected","relation":true}],"minFacts":1,"maxFacts":2,"forbidden":[{"name":"皮疹","laterality":"left","polarity":"affirmed","current":true}]}
- Preview：HTTP 200；{"name":"皮疹","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"右胳膊","laterality":"right","severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:58:55.376Z","resolvedStart":"2026-08-31T11:58:55+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"皮疹","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"右胳膊","laterality":"right","severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T03:58:55.376Z","resolvedStart":"2026-08-31T11:58:55+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：不满足：{"pass":false,"missing":["胳膊","右"],"forbidden":[]}
- 失败/差异：实体:皮疹纠正；类型:status_change；变化:corrected；UI 缺少 胳膊；UI 缺少 右
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-08/TRACK-08-step-02-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-08/TRACK-08-step-02-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-08/TRACK-08-step-02-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-08/TRACK-08-step-02-refresh.png

### TRACK-09 — FAIL

- 当前人物：测试老人C（senior）
- 原始输入：昨天下午开始喉咙疼。 → 今天早上还是疼，和昨天差不多。 → 下午也没加重，但还没有好。
- 执行输入：8月29日下午开始喉咙疼。 → 8月30日早上还是疼，和昨天差不多。 → 8月30日下午也没加重，但还没有好。
- 用例预期：咽喉痛开始 → 基本不变 → 持续且未加重，不能反转为加重。
- 严格结果：未满足全部字段

#### Step 1

- 输入：8月29日下午开始喉咙疼。
- 完整预期：{"facts":[{"name":"咽喉痛","polarity":"affirmed","type":"symptom","bodyPart":"咽喉","resolvedDate":"2026-08-29"}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"喉咙痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"喉咙","laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月29日下午","resolvedStart":"2026-08-29T14:00:00+08:00","resolvedEnd":"2026-08-29T18:00:00+08:00","precision":"period"},"subjectMemberId":"member-senior"}
- Confirm：HTTP 201
- 刷新 API：{"name":"喉咙痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"喉咙","laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月29日下午","resolvedStart":"2026-08-29T14:00:00+08:00","resolvedEnd":"2026-08-29T18:00:00+08:00","precision":"period"},"subjectMemberId":"member-senior"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：不满足：{"pass":false,"missing":["咽喉痛","咽喉"],"forbidden":[]}
- 失败/差异：UI 缺少 咽喉痛；UI 缺少 咽喉
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-09/TRACK-09-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-09/TRACK-09-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-09/TRACK-09-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-09/TRACK-09-step-01-refresh.png

#### Step 2

- 输入：8月30日早上还是疼，和昨天差不多。
- 完整预期：{"facts":[{"name":"咽喉痛未变","polarity":"affirmed","type":"status_change","target":"咽喉痛","change":"unchanged"}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"喉咙痛持续","type":"status_change","polarity":"affirmed","status":"active","change":"persistent","target":"喉咙痛","bodyPart":"喉咙","laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日早上","resolvedStart":"2026-08-30T06:00:00+08:00","resolvedEnd":"2026-08-30T09:00:00+08:00","precision":"period"},"subjectMemberId":"member-senior"}
- Confirm：HTTP 201
- 刷新 API：{"name":"喉咙痛持续","type":"status_change","polarity":"affirmed","status":"active","change":"persistent","target":"喉咙痛","bodyPart":"喉咙","laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日早上","resolvedStart":"2026-08-30T06:00:00+08:00","resolvedEnd":"2026-08-30T09:00:00+08:00","precision":"period"},"subjectMemberId":"member-senior"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：不满足：{"pass":false,"missing":["咽喉痛"],"forbidden":[]}
- 失败/差异：实体:咽喉痛未变；变化:unchanged；目标:咽喉痛；UI 缺少 咽喉痛
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-09/TRACK-09-step-02-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-09/TRACK-09-step-02-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-09/TRACK-09-step-02-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-09/TRACK-09-step-02-refresh.png

#### Step 3

- 输入：8月30日下午也没加重，但还没有好。
- 完整预期：{"facts":[{"name":"咽喉痛持续未加重","polarity":"affirmed","type":"status_change","target":"咽喉痛","change":"persistent"}],"minFacts":1,"maxFacts":1,"forbidden":[{"change":"worsened"}]}
- Preview：HTTP 200；{"name":"喉咙痛未加重","type":"status_change","polarity":"negated","status":"active","change":"unchanged","target":"喉咙痛","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日下午","resolvedStart":"2026-08-30T14:00:00+08:00","resolvedEnd":"2026-08-30T18:00:00+08:00","precision":"period"},"subjectMemberId":"member-senior"}
- Confirm：HTTP 201
- 刷新 API：{"name":"喉咙痛未加重","type":"status_change","polarity":"negated","status":"active","change":"unchanged","target":"喉咙痛","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日下午","resolvedStart":"2026-08-30T14:00:00+08:00","resolvedEnd":"2026-08-30T18:00:00+08:00","precision":"period"},"subjectMemberId":"member-senior"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：不满足：{"pass":false,"missing":["咽喉痛未加重"],"forbidden":[]}
- 失败/差异：实体:咽喉痛持续未加重；极性:affirmed；变化:persistent；目标:咽喉痛；UI 缺少 咽喉痛未加重
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-09/TRACK-09-step-03-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-09/TRACK-09-step-03-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-09/TRACK-09-step-03-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-09/TRACK-09-step-03-refresh.png

### TRACK-10 — FAIL

- 当前人物：测试成人B（self）
- 原始输入：前天开始头疼。 → 昨天一天都没疼。 → 今天中午又开始疼了。
- 执行输入：8月28日开始头疼。 → 8月29日一天都没疼。 → 8月30日中午又开始疼了。
- 用例预期：头痛出现 → 一整天无头痛 → 中午复发。
- 严格结果：未满足全部字段

#### Step 1

- 输入：8月28日开始头疼。
- 完整预期：{"facts":[{"name":"头痛","polarity":"affirmed","type":"symptom","resolvedDate":"2026-08-28"}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"头痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"头","laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月28日","resolvedStart":"2026-08-28T00:00:00+08:00","resolvedEnd":"2026-08-29T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-self"}
- Confirm：HTTP 201
- 刷新 API：{"name":"头痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"头","laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月28日","resolvedStart":"2026-08-28T00:00:00+08:00","resolvedEnd":"2026-08-29T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-self"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：无
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-10/TRACK-10-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-10/TRACK-10-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-10/TRACK-10-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-10/TRACK-10-step-01-refresh.png

#### Step 2

- 输入：8月29日一天都没疼。
- 完整预期：{"facts":[{"name":"头痛","polarity":"negated","type":"symptom","status":"resolved","resolvedDate":"2026-08-29"}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"疼痛","type":"symptom","polarity":"negated","status":"not_applicable","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":"一天","temperature":null,"time":{"raw":"8月29日","resolvedStart":"2026-08-29T00:00:00+08:00","resolvedEnd":"2026-08-30T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-self"}
- Confirm：HTTP 201
- 刷新 API：{"name":"疼痛","type":"symptom","polarity":"negated","status":"not_applicable","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":"一天","temperature":null,"time":{"raw":"8月29日","resolvedStart":"2026-08-29T00:00:00+08:00","resolvedEnd":"2026-08-30T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-self"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：实体:头痛；状态:resolved
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-10/TRACK-10-step-02-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-10/TRACK-10-step-02-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-10/TRACK-10-step-02-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-10/TRACK-10-step-02-refresh.png

#### Step 3

- 输入：8月30日中午又开始疼了。
- 完整预期：{"facts":[{"name":"头痛复发","polarity":"affirmed","type":"status_change","target":"头痛","change":"recurred","resolvedDate":"2026-08-30","resolvedHour":12}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"头痛疼痛复发","type":"status_change","polarity":"affirmed","status":"recurrent","change":"recurred","target":"头痛","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日中午","resolvedStart":"2026-08-30T12:00:00+08:00","resolvedEnd":"2026-08-30T13:00:00+08:00","precision":"period"},"subjectMemberId":"member-self"}
- Confirm：HTTP 201
- 刷新 API：{"name":"头痛疼痛复发","type":"status_change","polarity":"affirmed","status":"recurrent","change":"recurred","target":"头痛","bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日中午","resolvedStart":"2026-08-30T12:00:00+08:00","resolvedEnd":"2026-08-30T13:00:00+08:00","precision":"period"},"subjectMemberId":"member-self"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：无
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-10/TRACK-10-step-03-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-10/TRACK-10-step-03-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-10/TRACK-10-step-03-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-10/TRACK-10-step-03-refresh.png

### TRACK-11 — FAIL

- 当前人物：测试老人C（senior）
- 原始输入：昨晚拉了五次肚子。 → 今天上午拉了两次。 → 下午只拉了一次，现在还没有完全好。
- 执行输入：8月29日晚上拉了五次肚子。 → 8月30日上午拉了两次。 → 8月30日下午只拉了一次，现在还没有完全好。
- 用例预期：腹泻 5次 → 2次改善 → 1次但未完全好。
- 严格结果：未满足全部字段

#### Step 1

- 输入：8月29日晚上拉了五次肚子。
- 完整预期：{"facts":[{"name":"腹泻","polarity":"affirmed","type":"symptom","occurrenceCount":5,"resolvedDate":"2026-08-29"}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"腹泻","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":5,"duration":null,"temperature":null,"time":{"raw":"8月29日晚上","resolvedStart":"2026-08-29T18:00:00+08:00","resolvedEnd":"2026-08-30T00:00:00+08:00","precision":"period"},"subjectMemberId":"member-senior"}
- Confirm：HTTP 201
- 刷新 API：{"name":"腹泻","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":5,"duration":null,"temperature":null,"time":{"raw":"8月29日晚上","resolvedStart":"2026-08-29T18:00:00+08:00","resolvedEnd":"2026-08-30T00:00:00+08:00","precision":"period"},"subjectMemberId":"member-senior"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：无
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-11/TRACK-11-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-11/TRACK-11-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-11/TRACK-11-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-11/TRACK-11-step-01-refresh.png

#### Step 2

- 输入：8月30日上午拉了两次。
- 完整预期：{"facts":[{"name":"腹泻改善","polarity":"affirmed","type":"status_change","target":"腹泻","change":"improved","occurrenceCount":2}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"腹泻","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":2,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T04:00:30.212Z","resolvedStart":"2026-08-31T12:00:30+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-senior"}
- Confirm：HTTP 201
- 刷新 API：{"name":"腹泻","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":2,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T04:00:30.212Z","resolvedStart":"2026-08-31T12:00:30+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-senior"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：实体:腹泻改善；类型:status_change；变化:improved；目标:腹泻
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-11/TRACK-11-step-02-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-11/TRACK-11-step-02-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-11/TRACK-11-step-02-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-11/TRACK-11-step-02-refresh.png

#### Step 3

- 输入：8月30日下午只拉了一次，现在还没有完全好。
- 完整预期：{"facts":[{"name":"腹泻持续改善","polarity":"affirmed","type":"status_change","target":"腹泻","change":"persistent","occurrenceCount":1}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"腹泻","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":1,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T04:00:40.606Z","resolvedStart":"2026-08-31T12:00:40+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-senior"}
- Confirm：HTTP 201
- 刷新 API：{"name":"腹泻","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":1,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T04:00:40.606Z","resolvedStart":"2026-08-31T12:00:40+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-senior"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：不满足：{"pass":false,"missing":["腹泻改善"],"forbidden":[]}
- 失败/差异：实体:腹泻持续改善；类型:status_change；变化:persistent；目标:腹泻；UI 缺少 腹泻改善
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-11/TRACK-11-step-03-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-11/TRACK-11-step-03-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-11/TRACK-11-step-03-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-11/TRACK-11-step-03-refresh.png

### TRACK-12 — FAIL

- 当前人物：测试宝宝A（child）
- 原始输入：昨天开始鼻塞。 → 今天鼻塞还在，又开始流鼻涕。 → 晚上还多了嗓子疼。
- 执行输入：8月29日开始鼻塞。 → 8月30日鼻塞还在，又开始流鼻涕。 → 8月30日晚上还多了嗓子疼。
- 用例预期：鼻塞出现并持续，随后加入流鼻涕，再加入咽喉痛；既有事实不丢失。
- 严格结果：未满足全部字段

#### Step 1

- 输入：8月29日开始鼻塞。
- 完整预期：{"facts":[{"name":"鼻塞","polarity":"affirmed","type":"symptom","resolvedDate":"2026-08-29"}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"鼻塞","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月29日","resolvedStart":"2026-08-29T00:00:00+08:00","resolvedEnd":"2026-08-30T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"鼻塞","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月29日","resolvedStart":"2026-08-29T00:00:00+08:00","resolvedEnd":"2026-08-30T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：无
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-12/TRACK-12-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-12/TRACK-12-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-12/TRACK-12-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-12/TRACK-12-step-01-refresh.png

#### Step 2

- 输入：8月30日鼻塞还在，又开始流鼻涕。
- 完整预期：{"facts":[{"name":"鼻塞持续","polarity":"affirmed","type":"status_change","target":"鼻塞","change":"persistent"},{"name":"流鼻涕","polarity":"affirmed","type":"symptom"}],"minFacts":2,"maxFacts":2}
- Preview：HTTP 200；{"name":"鼻塞","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日","resolvedStart":"2026-08-30T00:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}<br>{"name":"流鼻涕","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日","resolvedStart":"2026-08-30T00:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"鼻塞","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日","resolvedStart":"2026-08-30T00:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}<br>{"name":"流鼻涕","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日","resolvedStart":"2026-08-30T00:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：实体:鼻塞持续；类型:status_change；变化:persistent；目标:鼻塞
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-12/TRACK-12-step-02-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-12/TRACK-12-step-02-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-12/TRACK-12-step-02-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-12/TRACK-12-step-02-refresh.png

#### Step 3

- 输入：8月30日晚上还多了嗓子疼。
- 完整预期：{"facts":[{"name":"咽喉痛","polarity":"affirmed","type":"symptom","bodyPart":"咽喉"}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"喉咙痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日晚上","resolvedStart":"2026-08-30T18:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"喉咙痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"8月30日晚上","resolvedStart":"2026-08-30T18:00:00+08:00","resolvedEnd":"2026-08-31T00:00:00+08:00","precision":"period"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：不满足：{"pass":false,"missing":["咽喉痛","咽喉"],"forbidden":[]}
- 失败/差异：部位:咽喉；UI 缺少 咽喉痛；UI 缺少 咽喉
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TRACK-12/TRACK-12-step-03-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-12/TRACK-12-step-03-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-12/TRACK-12-step-03-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TRACK-12/TRACK-12-step-03-refresh.png

### PERSON-01 — PASS

- 当前人物：测试宝宝A（child）
- 原始输入：我今天头痛。
- 执行输入：我今天头痛。
- 用例预期：人物不匹配整次阻断，宝宝事件零写入。
- 严格结果：PASS

#### Step 1

- 输入：我今天头痛。
- 完整预期：{"facts":[],"minFacts":0,"maxFacts":0,"reject":true,"reason":"宝宝事件中的“我”是记录者本人，人物不匹配必须阻断","forbidden":[{"name":"头痛","polarity":"affirmed"}]}
- Preview：HTTP 409；[]
- Confirm：未确认（安全门禁用例不确认错误阳性预览）
- 刷新 API：[]
- 数量：Records +0，Organizations +0
- Preview/Confirm/Refresh：无确认链路
- 最终 UI：满足本步 UI 断言
- 失败/差异：Preview 409: [REDACTED] 这条情况不属于测试宝宝A，请切换到正确的记录对象。
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/PERSON-01/PERSON-01-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/PERSON-01/PERSON-01-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/PERSON-01/PERSON-01-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/PERSON-01/PERSON-01-step-01-refresh.png

### PERSON-02 — PASS

- 当前人物：测试宝宝A（child）
- 原始输入：宝宝今天发烧38度5，我自己也有点头疼。
- 执行输入：宝宝今天发烧38度5，我自己也有点头疼。
- 用例预期：返回多人物拆分提示，无 previewId，不保存宝宝或成人任何部分。
- 严格结果：PASS

#### Step 1

- 输入：宝宝今天发烧38度5，我自己也有点头疼。
- 完整预期：{"facts":[],"minFacts":0,"maxFacts":0,"reject":true,"reason":"同一输入包含宝宝和记录者两个主体，必须整次阻断","forbidden":[{"name":"发热"},{"name":"体温"},{"name":"头痛"}]}
- Preview：HTTP 409；[]
- Confirm：未确认（安全门禁用例不确认错误阳性预览）
- 刷新 API：[]
- 数量：Records +0，Organizations +0
- Preview/Confirm/Refresh：无确认链路
- 最终 UI：满足本步 UI 断言
- 失败/差异：Preview 409: [REDACTED] 这段话包含多个人的情况，请分别记录。
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/PERSON-02/PERSON-02-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/PERSON-02/PERSON-02-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/PERSON-02/PERSON-02-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/PERSON-02/PERSON-02-step-01-refresh.png

### PERSON-03 — PASS

- 当前人物：测试宝宝A（child）
- 原始输入：奶奶说宝宝好像有点发烧，但我还没量。
- 执行输入：奶奶说宝宝好像有点发烧，但我还没量。
- 用例预期：奶奶是信息来源，宝宝是主体，发热 uncertain，未测量所以无虚构温度。
- 严格结果：PASS

#### Step 1

- 输入：奶奶说宝宝好像有点发烧，但我还没量。
- 完整预期：{"facts":[{"name":"发热","polarity":"uncertain","type":"symptom","subjectText":"宝宝"}],"minFacts":1,"maxFacts":1,"forbidden":[{"type":"temperature"},{"name":"发热","polarity":"affirmed"}]}
- Preview：HTTP 200；{"name":"发热","type":"symptom","polarity":"uncertain","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":"mild","severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T04:01:42.617Z","resolvedStart":"2026-08-31T12:01:42+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"发热","type":"symptom","polarity":"uncertain","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":"mild","severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"2026-08-31T04:01:42.617Z","resolvedStart":"2026-08-31T12:01:42+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：无
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/PERSON-03/PERSON-03-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/PERSON-03/PERSON-03-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/PERSON-03/PERSON-03-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/PERSON-03/PERSON-03-step-01-refresh.png

### PERSON-04 — PASS

- 当前人物：测试成人B（self）
- 原始输入：我现在头疼。
- 执行输入：我现在头疼。
- 用例预期：本人事件中的“我”正确归属测试成人B。
- 严格结果：PASS

#### Step 1

- 输入：我现在头疼。
- 完整预期：{"facts":[{"name":"头痛","polarity":"affirmed","type":"symptom","timeRaw":"现在"}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"头痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"头","laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"现在","resolvedStart":"2026-08-31T00:00:00+08:00","resolvedEnd":"2026-09-01T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-self"}
- Confirm：HTTP 201
- 刷新 API：{"name":"头痛","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":"头","laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"现在","resolvedStart":"2026-08-31T00:00:00+08:00","resolvedEnd":"2026-09-01T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-self"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：无
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/PERSON-04/PERSON-04-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/PERSON-04/PERSON-04-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/PERSON-04/PERSON-04-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/PERSON-04/PERSON-04-step-01-refresh.png

### UI-01 — PASS

- 当前人物：测试宝宝A（child）
- 原始输入：今天咳嗽。
- 执行输入：今天咳嗽。
- 用例预期：确认按钮快速双击、同幂等键重试和刷新后仅新增一条来源记录及一组事实。
- 严格结果：PASS

#### Step 1

- 输入：今天咳嗽。
- 完整预期：{"facts":[{"name":"咳嗽","polarity":"affirmed","type":"symptom","timeRaw":"今天"}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"今天","resolvedStart":"2026-08-31T00:00:00+08:00","resolvedEnd":"2026-09-01T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"今天","resolvedStart":"2026-08-31T00:00:00+08:00","resolvedEnd":"2026-09-01T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：无
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/UI-01/UI-01-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/UI-01/UI-01-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/UI-01/UI-01-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/UI-01/UI-01-step-01-refresh.png

### UI-06 — PASS

- 当前人物：测试宝宝A（child）
- 原始输入：离线重试用例。
- 执行输入：今天咳嗽。
- 用例预期：确认前真实离线：中文错误、零隐藏写入；恢复后重提只生成一次记录。
- 严格结果：PASS

#### Step 1

- 输入：今天咳嗽。
- 完整预期：{"facts":[{"name":"咳嗽","polarity":"affirmed","type":"symptom","timeRaw":"今天"}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"咳嗽","type":"symptom","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":null,"time":{"raw":"今天","resolvedStart":"2026-08-31T00:00:00+08:00","resolvedEnd":"2026-09-01T00:00:00+08:00","precision":"day"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：[]
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：无
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/UI-06/UI-06-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/UI-06/UI-06-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/UI-06/UI-06-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/UI-06/UI-06-step-01-refresh.png

### UI-07 — FAIL

- 当前人物：测试宝宝A（child）
- 原始输入：十点体温38度5。
- 执行输入：十点体温38度5。 → 十点半体温38度2。
- 用例预期：连续两次提交分别保留 10:00 38.5℃ 与 10:30 38.2℃，不串换、不覆盖。
- 严格结果：未满足全部字段

#### Step 1

- 输入：十点体温38度5。
- 完整预期：{"facts":[{"name":"体温","polarity":"affirmed","type":"temperature","temperatureMin":38.5,"temperatureMax":38.5,"resolvedHour":10}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"38.5℃","type":"temperature","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":{"min":38.5,"max":38.5,"unit":"℃"},"time":{"raw":"2026-08-31T04:02:34.066Z","resolvedStart":"2026-08-31T12:02:34+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"38.5℃","type":"temperature","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":{"min":38.5,"max":38.5,"unit":"℃"},"time":{"raw":"2026-08-31T04:02:34.066Z","resolvedStart":"2026-08-31T12:02:34+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：解析小时:10
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/UI-07/UI-07-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/UI-07/UI-07-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/UI-07/UI-07-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/UI-07/UI-07-step-01-refresh.png

#### Step 2

- 输入：十点半体温38度2。
- 完整预期：{"facts":[{"name":"体温","polarity":"affirmed","type":"temperature","temperatureMin":38.2,"temperatureMax":38.2,"resolvedHour":10,"resolvedMinute":30}],"minFacts":1,"maxFacts":1}
- Preview：HTTP 200；{"name":"38.2℃","type":"temperature","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":{"min":38.2,"max":38.2,"unit":"℃"},"time":{"raw":"2026-08-31T04:02:43.065Z","resolvedStart":"2026-08-31T12:02:43+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- Confirm：HTTP 201
- 刷新 API：{"name":"38.2℃","type":"temperature","polarity":"affirmed","status":"active","change":null,"target":null,"bodyPart":null,"laterality":null,"severity":null,"severityScale":null,"frequency":null,"occurrenceCount":null,"duration":null,"temperature":{"min":38.2,"max":38.2,"unit":"℃"},"time":{"raw":"2026-08-31T04:02:43.065Z","resolvedStart":"2026-08-31T12:02:43+08:00","resolvedEnd":null,"precision":"exact"},"subjectMemberId":"member-child"}
- 数量：Records +1，Organizations +1
- Preview/Confirm/Refresh：{"previewConfirm":true,"confirmRefresh":true,"previewRefresh":true}
- 最终 UI：满足本步 UI 断言
- 失败/差异：解析小时:10；解析分钟:30
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/UI-07/UI-07-step-02-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/UI-07/UI-07-step-02-input.png；.codex-tmp/independent-symptom-tracking-acceptance/UI-07/UI-07-step-02-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/UI-07/UI-07-step-02-refresh.png

### TIME-05 — FAIL

- 当前人物：测试宝宝A（child）
- 原始输入：咳嗽已经三天了，不是一直咳，主要是晚上咳。
- 执行输入：咳嗽已经三天了，不是一直咳，主要是晚上咳。
- 用例预期：咳嗽三天、主要夜间发生、并非持续不断。
- 严格结果：未满足全部字段

#### Step 1

- 输入：咳嗽已经三天了，不是一直咳，主要是晚上咳。
- 完整预期：{"facts":[{"name":"咳嗽","polarity":"affirmed","type":"symptom","duration":"3天","frequency":"晚上"},{"name":"持续咳嗽","polarity":"negated","type":"status_change","change":"persistent"}],"minFacts":1,"maxFacts":2,"forbidden":[{"change":"persistent","polarity":"affirmed","current":true}]}
- Preview：HTTP 400；[]
- Confirm：未确认（无可确认 previewId 或事实）
- 刷新 API：[]
- 数量：Records +0，Organizations +0
- Preview/Confirm/Refresh：无确认链路
- 最终 UI：不满足：{"pass":false,"missing":["咳嗽"],"forbidden":[]}
- 失败/差异：无实际事实；UI 缺少 咳嗽；Preview 400: FUTURE_OCCURRED_AT 发生时间不能晚于现在，请修改后重试。；预期健康事实未保存
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TIME-05/TIME-05-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TIME-05/TIME-05-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TIME-05/TIME-05-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TIME-05/TIME-05-step-01-refresh.png

### TIME-08 — FAIL

- 当前人物：测试老人C（senior）
- 原始输入：这几天每天晚上都会头疼，白天基本没事。
- 执行输入：这几天每天晚上都会头疼，白天基本没事。
- 用例预期：测试老人C的夜间反复头痛与白天无症状上下文保留。
- 严格结果：未满足全部字段

#### Step 1

- 输入：这几天每天晚上都会头疼，白天基本没事。
- 完整预期：{"facts":[{"name":"头痛","polarity":"affirmed","type":"symptom","frequency":"每天晚上"},{"name":"头痛","polarity":"negated","type":"symptom","frequency":"白天"}],"minFacts":1,"maxFacts":2}
- Preview：HTTP 400；[]
- Confirm：未确认（无可确认 previewId 或事实）
- 刷新 API：[]
- 数量：Records +0，Organizations +0
- Preview/Confirm/Refresh：无确认链路
- 最终 UI：不满足：{"pass":false,"missing":["头痛"],"forbidden":[]}
- 失败/差异：无实际事实；UI 缺少 头痛；Preview 400: FUTURE_OCCURRED_AT 发生时间不能晚于现在，请修改后重试。；预期健康事实未保存
- 完整本地证据：.codex-tmp/independent-symptom-tracking-acceptance/TIME-08/TIME-08-step-01-before-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TIME-08/TIME-08-step-01-input.png；.codex-tmp/independent-symptom-tracking-acceptance/TIME-08/TIME-08-step-01-preview.png；.codex-tmp/independent-symptom-tracking-acceptance/TIME-08/TIME-08-step-01-refresh.png


## 5. 基础症状与属性

ST-09 的 38～39℃范围、ST-04 的偶尔/两声、ST-05 的三次在 API 中正确；但日期级 UI 均把无具体时刻显示为 00:00。ST-02 丢右侧，ST-03 丢程度，ST-06 丢腹部与两小时，ST-08 丢轻微，ST-10 咽喉部位退化，ST-11 左右侧别均丢。属性链未达到接受标准。

## 6. 连续症状跟踪

CTX-01、SPEECH-02/03/04 的简单持续/复发/消失/改善链可用；复杂链大量失败。TRACK-01～12 无一严格 PASS：精确时刻被压成时段起点、加重/缓解/持续/复发状态缺失、症状原子丢失或出现反向阳性。TRACK-05 的“没有再发烧”同时生成发热 affirmed active 与发热消失，构成明确矛盾。

## 7. 上下文、否定与纠正

CTX-03 的歧义目标被 409 正确阻断；CTX-05 的“又有了”零事实，复发上下文失败。NEG-05 只留下左腿阴性而没有右腿当前阳性；NEG-06 最终 38.2℃正确但没有纠正关系；NEG-07 保留了被纠正的今天早上而丢昨天晚上；TRACK-08 没有 superseded/revised 关系。NEG-08 没有头痛阳性，但生成两条语义相近的头部阴性事实，判 PARTIAL。

## 8. 时间语义

浏览器 Date 在每步提交前固定为执行机 UTC 当前时间前 5 秒，服务端保持真实时间；报告保存 selectedOccurredAt 与 HTTP Date。全天序列仅把时间锚点等价改写到 2026-08-30，症状、顺序、数值和状态未改。

TIME-01 的“刚刚”被解析为当天 00:00；TIME-02/03、TRACK-01/04、UI-07 的明确时分被压成时段起点或提交时间；TIME-05/08 的有效当前输入被 FUTURE_OCCURRED_AT 错误拒绝。额外真正未来用例正确返回 FUTURE_OCCURRED_AT、中文错误、零记录。日期级事实在最终 UI 显示 00:00，违反“日期或具体时间未记录”的要求。

## 9. 跨人物安全

PERSON-01、02、03、04 全部 PASS。明确人物不匹配和多人物输入均整次阻断并零写入；奶奶仅作为信息来源，宝宝为 uncertain 主体且未虚构温度。全部 133 条 Preview 事实的 subjectMemberId 均属于当前事件人物，跨人物污染为 0。

## 10. 假设、问句、担忧、引用门禁

FILTER-01～05 与 TIME-06 全部零阳性入库。假设、知识问句、诊断担忧、天气闲聊和未来条件句均没有 Records/Organizations，门禁结论通过。

## 11. 多事实原子保存

94 个成功确认步骤的 Preview、Confirm、Refresh API 事实 JSON 全部一致，且均恰好新增 1 Record 与 1 Organization。然而一致地保存错误事实不等于业务正确：ST-10、CTX-04、TRACK-05/06/07 等仍发生实体或状态原子丢失；最终 UI 又经常隐藏部位、侧别、状态和日期精度。因此端到端业务一致性不成立。

## 12. 离线、双击与幂等

UI-06 真实 context offline：中文“网络连接失败”，无英文 Failed to fetch，离线期间零写入；恢复网络后仅写入一次。UI-01 真实双击后再以同一 Confirm 请求重放，服务端返回 idempotent=true，Records/Organizations/事实和 UI 未重复。两项 PASS。

## 13. Staging 黑盒结果

Staging / 与 /api/health 均为 200，页面、JavaScript、CSS 与 API 来自同一部署。执行 65 个正式用例、107 个正式步骤和 1 个额外未来用例；完整截图和脱敏响应位于本地证据包。Staging 产品结论 FAIL。

## 14. Production 只读检查

Railway Production 部署 23e31c77-0004-4c00-8b86-4a07aa5dcb37 / SUCCESS，commit c4ebef775c61add55d8a3c2eee2d7a4ab2b04870。/api/health 200；/ 与未登录 /health-events/read-only-route-probe 均 200 并进入 /login，静态页面可打开。正式留档复跑拦截全部非 GET；页面尝试的 Cloudflare RUM POST 被浏览器阻断。未登录、未访问用户数据、未调用 Preview/Confirm、未产生健康数据。

## 15. 与第一次 35/100 的对比

第一次为 18/65 严格 PASS（27.7%）；本轮为 20/65（30.8%），仅增加 2 条、提升 3.1 个百分点。跨人物污染、假设/问句门禁、幂等、离线与基础状态链有明显改善；但原 P1 的时间、否定、复杂状态、多事实和纠正关系仍广泛存在，不能视为专项修复完成。

## 16. 对“65/65、100%”声明的核验

- 65/65：**被推翻**。逐字段严格结果为 20/65。
- 跨人物污染 0：**本轮证实**。
- Preview—Confirm—Refresh API 一致率 100%：**本轮证实为 94/94**，但只证明错误结果也被一致保存。
- 明确主体准确率 100%：**本轮 133/133 证实**。
- 最终 UI 与 API 100% 一致：**未证实并被多项反例推翻**。
- 否定、时间、多事实、状态链均已修复：**被推翻**。

## 17. 缺陷清单

### P1（6 个缺陷簇）

1. 显式否定反转：TRACK-05 第三步“没有再发烧”生成发热 affirmed active；同类见 TRACK-02/04。
2. 语义时刻丢失或错位：TIME-01/02/03、TRACK-01/04、UI-07；TRACK-01 还新增无依据 30℃。
3. 有效当前输入误判未来：TIME-05、TIME-08 返回 FUTURE_OCCURRED_AT 且零保存。
4. 状态链缺失/反向：CTX-04/05、SPEECH-05/07、TRACK-01～12 多处加重、缓解、持续、消失、复发未形成。
5. 纠正关系和当前值失败：NEG-05/06/07、TRACK-08 无 superseded/revised，或保留被纠正值。
6. 多事实静默丢失：CTX-04、TRACK-05/06/07 等省略症状或状态原子。

### P2（4 个缺陷簇）

1. 部位、侧别、程度、持续时间等属性丢失：ST-02/03/06/08/10/11、TIME-04。
2. 日期级时间在最终 UI 伪装成 00:00：ST-01/04/05/07、NEG-01、SPEECH-08。
3. 最终时间轴不显示 API 已有的部位、侧别、次数或状态细节。
4. NEG-08 对同一头部否定产生重复/近义阴性事实。

### P0

0。未观察到跨人物健康事实写入。

## 18. 剩余 BLOCKED 项

- 真实麦克风 E2E：BLOCKED（本轮环境无真实麦克风）；SPEECH-* 仅验证文字入口后的公共事实链路，不计作真实语音采集 PASS。
- 照片入口：不在本轮范围。
- Production 写入链路：按安全边界禁止，不是 Staging 结论的阻塞项。

## 19. 最终产品建议

**需要关闭/回滚快捷记录用于真实家庭连续症状跟踪的入口，至少在 P1 修复并通过同等黑盒复验前不得正式接受。** 可以保留受限的简单单事实试用，但必须阻断复杂多事实、否定、纠正和语义时间确认；下一步应另开修复任务，不能在本验收任务中修改业务代码。

关键截图位于本目录 evidence/；完整证据仅保存在 .codex-tmp/independent-symptom-tracking-acceptance/ 及其 ZIP，未提交账号、Token、Cookie、验证码或完整认证响应。
