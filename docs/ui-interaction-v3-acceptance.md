# 前台录音与记录交互 V3

基线：`84a1e4b004433b126b49df929ae109496a4e53f7`，独立分支 `codex/ui-interaction-v3-20261026`，开始时工作树干净。用户于 2026-10-26 明确要求按附件 V3 实施并发布。以下清单同时作为实现与验收范围，未运行的检查不记 PASS。

## 范围与边界

- 前台 / 智能记录的当前按住录音、实时用户气泡、文字整理、失败恢复、对象确认、核对、成功回执和对应详情。
- 保留当前录音按钮、外壳、主色、位置、计时、波形、遮罩、按住/松手/上滑取消机制；不新增另一套录音 UI。
- 新麦克风音频只在本次采集/转写过程中临时使用，不进入本地持久草稿、recognition-assets、对话原件或正式记录附件。现有 ASR 可能使用会在 finally 清理的转码临时文件；不承诺第三方零留存。
- 图片、报告、PDF、视频和已有历史音频/记录保持数据兼容；不批量删除历史、不改供应商/模型/密钥、不新增对象体系或生产依赖。
- 收据及记录来源元数据增加实际保存条目的可选标题/条目定位字段，仅为按真实 recordId 显示已保存内容；旧回执兼容。权限、保存事务、幂等与医学语义保持既有边界。
- 按仓库当前 Production-only 流程交付，不恢复已退役 Staging。用户当前明确发布授权优先于附件中仅本地实施的默认限制。

## 实际调用映射

`HoldToTalkButton` → `DialogueComposer` → `useSmartRecordVoice` → 既有 `/api/ai/audio/live`（PCM 中间快照）及 `/api/ai/audio/transcriptions`（松手最终文字）→ `SmartRecordWorkspace` 的同一 text turn → 既有 recognition job / review / save receipt。

原有持久化链是 onRecorded → pendingVoice/files → IDB → recognition 原音/WAV 资产 → front.voices → business.voices → 正式附件。本轮仅从新麦克风入口切断，不清理历史数据。中间通道已实现供应商 partial/completed 到完整快照的转换，实际连通能力另行实测。

## P0（本地程序与浏览器验收）

- [x] 实际开始录音后才创建一个用户草稿；真实中间快照原位替换，松手定稿仍为同一可见 ID，不重复正文/气泡/模型整理。
- [x] 移除遮罩白色转写正文和重复护士收音卡；保留录音模板、计时、波形、取消文字和手势。
- [x] 取消、重录、对象/对话切换、编辑及采用部分文字后，旧 ASR 不能覆盖。转写中断立即可见，不能继续假正常收音。
- [x] 无字不建空记录；部分文字明确未完成，可编辑/采用/重录；最终文字形成后才整理，整理失败只重试当前有效文字。
- [x] 新音频不写 IDB/原件资产/正式附件，无音频 URL、播放器或保存原录音兜底；处理完成/取消/失败退出清理临时资源。
- [x] 图片/PDF 上传、来源、预览、保存不回归，旧音频字段兼容且历史字节不删除。
- [x] 失败按转写/整理/保存区分，单一主恢复入口；保存未知先核回执，编辑和草稿保留，无伪成功/重复保存。
- [x] 当前孩子可见；待确认对象不与成功并存，核对和收据明确实际对象。
- [x] 核对顺序：对象 → 标题/描述 → 发生时间 → 类型 → 用户原话 → 确有的相关资料 → 保存。未知发生时间不取创建时间代替。
- [x] 收据稳定紧凑、始终可查看精确记录、可直接继续输入；跟进可选；详情与核对标题/正文连续。
- [x] 详情删除低强调；编辑返回详情、关闭详情回原对话/日历，逐次只退一层；脏编辑沿既有确认机制。

## P1（边界与实机限制）

- 无中间结果、迟到最终结果、短录音、无文字、部分文字、连接失败、权限拒绝、切后台/锁屏、上滑移回与取消。
- 历史阅读不强拉到底，长转写与英文 URL 正常换行；录音层/键盘/安全区避让；开始对话后欢迎区紧凑。
- 320×568、375×667、390×844、430px、大字 200%；20 字姓名；真实 iPhone/Safari 与软键盘单独标记，浏览器模拟不冒充实机。
- 失败 → 编辑/重新整理/手动核对 → 保存；保存失败重试；连续两条旧收据仍精确打开原条目；返回不丢新输入与滚动。

## 验证记录

复核日期：2026-10-27。上方勾选代表实现和本地协议/浏览器测试覆盖，不代表真实供应商转写已经通过。

| 检查 | 实际结果 |
| --- | --- |
| Client | PASS 784/784 |
| Server | PASS 244/244 |
| AI 全程序集 | PASS 1617；1 项需显式开启的 OpenAI live 测试未运行 |
| TypeScript / Production build / diff check | PASS |
| V3 手机 | PASS 28/28，320×568、375×667、390×844、430×932 |
| 原前台手机 | PASS 远端完整45/45 |
| 对话与退出 | PASS 31/31；既有配置排除的旧 pending-ASR 自动保存样本保持原排除规则 |
| 症状跟进 / 快速查找 | PASS 4/4、9/9；症状补充沿用原原话保存，新录音退出不写音频并校验历史字节不变 |
| 首页 | PASS 最终完整23/23（含服务端历史原音精确字节检查） |
| 首次建档 / 纯记录 / 浅色页面 | PASS 5/5、4/4、2/2 |
| 实机 iPhone / Safari / 软键盘 / 锁屏 | NOT_RUN，当前仅桌面 Chrome 后台设备模拟 |
| 200% 字体 | PASS 四宽度的计算字号翻倍模拟；不冒充 OS 或 Safari 文本缩放 |
| 真实 ASR | BLOCKED，见下文 |
| Git / CI / Production | PASS PR #548已合入main，最终两项CI成功，Production部署和实际合成验收通过 |

V3浏览器测试的 MediaRecorder、WebAudio、编码、应用 API、IDB、保存事务和记录详情均走真实本地路径；中间 ASR 快照与理解模型为显式替身。失败、丢回执和迟到响应由测试控制。没有向测试中注入保存成功结果。历史录音用升级前 IDB 字节夹具，经失败、刷新、重试、另开对话后，按真实上下文 ID 读取并比较服务端原音 data URL。图片、PDF、视频沿用首页原回归。

新增必要边界：手动核对仅给既有 save_original 增加可选 reviewText。保留来源原文，并将核对后的文字写为中性“原话记录”；签名与既有版本/事务/回执绑定。同一操作改字不能复用旧回执。既有未传reviewText的原操作仍可重试；已编辑操作不能通过省略或更换文字复用原回执。原话保存回执额外返回可选sourceMessageIds，来自事务内实际接受且保存的消息集合；只移除这些消息的旧失败操作，无关失败保持可恢复。旧回执缺失来源ID不猜测、不批量修改状态。保存结果可选 title/itemId 和来源 title/sourceTextEdited 都有旧值兜底，不做历史迁移。只有明确提交有效发生时间，才同步原有未知时间标志；仅改文字保留原时间。

### 真实供应商与调用预算

用户先前授权200次本地合成评测，原任务已用197次；本轮其后实际3次达到200。用户明确追加10次后，又使用8次，当前累计208/210，剩余2次。启动环境失败、缺 ws 和路径错误的运行由计数器确认供应商请求为0，不计入消耗。配置仅经 Railway CLI 只读传给白名单本地进程，没有保存密钥，没有读取或复制生产健康数据。

真实 WS 握手为101并收到 session.created，随后供应商返回 AccessDenied.Unpurchased；真实 batch ASR 也返回403和相同权限码。用户报告开通后多次复核仍未放行。没有真实中间文字或真实最终转写通过的证据，不报实时能力、准确率或延迟达标。暂留2次额度待同一北京工作空间/密钥的模型权限真正生效后复测，不更换供应商/模型/密钥。

官方端点核对：[Qwen-ASR-Realtime连接流程](https://help.aliyun.com/en/model-studio/qwen-asr-realtime-interaction-process)。当前workspace专属域名符合官方模板，本轮未修改端点。

脱敏本地证据：.codex-tmp/asr-v3-real-smoke-1793038991122-bac54fad/report.json、.codex-tmp/asr-v3-diagnosis.json。上述真实 ASR 评测的隔离临时目录均已清理；供应商日志只保留安全错误码和状态。截图中的病情与对象均为合成测试资料。

### 交付与回退

不含数据库迁移、依赖版本变更、素材重绘或供应商配置变更。保留 HoldToTalkButton 源码及样式。首次建档仅将既有图片导入明确标记为url与inline，维持相同字节、内嵌和无新图片请求契约。

发布走远端main→Railway Production单环境。源码PR [#548](https://github.com/Hoooho-app/hoooho.app/pull/548)，源分支codex/ui-interaction-v3-20261026；聚焦提交bd24ecac、91b6abd3、853d97e6，发布合并提交110a8a904b0cfb478dabff8590a4f633e932a92e。

最终CI：[Smart record verification #97](https://github.com/Hoooho-app/hoooho.app/actions/runs/40375881045)及[Quick search verification #25](https://github.com/Hoooho-app/hoooho.app/actions/runs/40375880789)均成功，完整浏览器场景共151项（含不同手机尺寸，不是151个独立业务规则）。

Railway Production部署2d5d2e82-f4cd-44eb-9688-789bff12c3a7为SUCCESS；来源main、commit110a8a904b0cfb478dabff8590a4f633e932a92e。服务online，1/1副本、0崩溃、0warning/critical、无待应用变更。正式地址[服务前台](https://hoooho.com/nurse-station)。Staging按现有单生产政策维持退役。

生产验收PASS_MANUAL_API_AND_RESTORED_UI：使用用户单独授权的一次全新合成账号、1位虚构成员及1条原话记录。真实API明确确认对象，保存用户核对文字，精确回执重放仍为原recordId；正文与原始来源分别保留，未知发生时间仍未知，无音频附件或活跃症状。浏览器恢复这份真实API回执，收起后仍可查看精确条目，返回前台保留未发送输入，记录删除后旧链接只提示不可用。此生产验收证明手动原话API和真实回执恢复/详情/返回，不代表生产模型理解或ASR链路通过。

生产/、/api/health、版本化JS、受影响页面实际内容均通过；认证/api/ai/audio/capabilities.runtime.commit与发布commit完全一致。后台iPhone SE和375/390/430无横向溢出，无pageerror或5xx。生产模型请求0。

本次生产合成记录1条、事件1项和成员1位均已按精确回执ID删除，会话已撤销。保留1个无健康数据的空合成账号（本次授权清理范围不含绕过身份验证删除账号），没有访问/更改原用户健康数据。脱敏报告：.codex-tmp/production-v3-1793039795195/report.json。

实际截图：.codex-tmp/production-v3-1793039795195/production-receipt-iphone-se.png（生产真实API收据恢复）；同目录production-exact-detail-iphone-se.png（生产精确详情）；.codex-tmp/asr-v3-real-smoke-1793038991122-bac54fad/real-asr-failure-iphone-se.png（真实权限失败）。本地协议/保存截图另存.codex-tmp/v3-ui-evidence，明确使用模型替身，不作为真实ASR成功证据。

回退：git revert -m 1 110a8a904b0cfb478dabff8590a4f633e932a92e，经同一测试、PR和Production发布流程执行。不回滚持久卷，不删除正式记录或历史附件。

最终状态：BLOCKED（真实ASR模型权限）。实现、测试、commit/push、main集成、Production部署与上述生产验收已通过；真实ASR仍被现有百炼密钥权限拒绝，实机Safari/软键盘等未执行项保持NOT_RUN。
