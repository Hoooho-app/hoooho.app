# 护护前台对话与记录评测

本目录保留用户附件的 96 项场景原始预期，提供 **121 个回放样本（96 项原始场景、24 个上下文对照和 1 个独立 ASR01 诊断；其中 56 个有完整固定多轮前文）和独立的 12 个组合 holdout**。生产代码不导入这些数据。对照上下文用于检查同一句“39”“没有”“好”“120ml”在不同问题后的不同含义，不计为新的独立临床案例。ASR01 只使用明确声明的离线合成清晰语音，不能代替原 96 项中的语音错误、哭声、歧义或真实临床录音覆盖。

目前新增的是可执行评测设施和未运行的数据，不能据此宣称模型理解正确率达到 95%、不必要追问低于 5%、已经超越阿福或通过专业审核。

## 文件

- `source-scenarios.json`：T32、C16、I30、V12、Q6，合计 96 项原始标题与验收预期，从用户 TXT 附录逐项提取，并与 Word 方案的同一清单核对。
- `scenarios.mjs`：逐项输入、完整适用前文、事实变化、未知、允许动作、禁止写入和风险边界；额外 24 个上下文对照回放、独立 ASR01 清晰语音诊断及 holdout 组合。
- `coverage.test.mjs`：检查全 ID、样本数、前文、来源、负面写入边界、默认不发模型请求、独立评分约束。
- `assets.mjs`：可核对的合成几何图、报告、药盒标签、处方、预约、截图、黑图、损坏字节及静音 WAV。身体照片、餐食/睡眠照片、HEIC 和有语义的录音必须显式提供合成或已获授权的素材；缺少时 `NOT_RUN`，不以固定模型回答替代。
- `run-live.mjs`：显式授权后启动一次性本地 HTTP 应用，真实调用现有 Bailian 模型及上传/读图链路，不接受生产目标 URL。
- `model-budget.mjs`：只被本地评测子进程加载，限制真实对外请求次数并记录安全的请求/耗时/token 元数据，不修改供应商、密钥、账单或应用已有调用限额。
- `environment.mjs`：只向本地应用传入既有模型选项和必要系统环境；不继承 Production 数据库、邮件、认证、平台及家庭桥接凭据。
- `budget-plan.mjs`：只输出推荐的 52 regression + 8 holdout 分批命令，不执行命令、不读取凭据；八批合计硬上限 188 次请求。
- `run-flow.mjs`：无固定前文、候选或回执注入的连续真实保存链；睡眠文字与实际 PNG 疫苗资料分别经历识别任务、真实候选、必要时用户归属确认、聊天保存指令、回执和精确条目读回。默认 `NOT_RUN`，整次最多 20 个对外请求。
- `runtime.mjs`：每次报告保留当前 git HEAD 和实际 front/understanding/jobs/service/model、对话策略及保存引导源码 SHA256，避免混用不同工作树修改版本的结果。
- `score-review.mjs`：在完整独立人工审阅后计算分组指标；无审阅、审阅不全或关键错误时不能声明达标。
- [96 场景映射](../../docs/nurse-conversation-upgrade-96-scenarios.md)。

## 程序检查

```powershell
node --test tests/nurse-conversation-upgrade/coverage.test.mjs tests/nurse-conversation-upgrade/budget.test.mjs tests/nurse-conversation-upgrade/seed-context.test.mjs tests/nurse-conversation-upgrade/flow.test.mjs tests/nurse-conversation-upgrade/screenshots.test.mjs
node tests/nurse-conversation-upgrade/run-live.mjs --help
node tests/nurse-conversation-upgrade/run-live.mjs '--ids=T01,T03,T09,I11' --max-cases=4
```

最后一条命令默认只生成 `NOT_RUN` 报告，不启动应用、不检查密钥值、不调用模型，不请求生产站点。`results/` 被忽略，不会提交输出、会话或合成原件。

`--help` 不创建结果目录。帮助参数列出的默认值与实际解析一致；所有计数开关使用 `--name=value`。PowerShell 中含逗号的参数必须整体用单引号包住，例如 `'--ids=T02,T03,I11'`，包括通过 Railway CLI 转发时；否则逗号可能丢失而选中零例。`--ids` 在选定 split 中精确匹配 ID，仍按数据集顺序执行，不按参数中 ID 顺序重排。

## 真实模型回放

仅在当前进程已经有用户授权使用的 **既有 Bailian 配置**时运行。不得从其他环境复制密钥、扩大授权或通过此脚本创建凭据。

```powershell
node tests/nurse-conversation-upgrade/run-live.mjs --live '--ids=T02,T03,T09,I11' --max-cases=4 --max-model-requests=8
node tests/nurse-conversation-upgrade/run-live.mjs --live --split=holdout --max-cases=4 --max-model-requests=8
```

需要 `AI_PROVIDER=bailian`，以及非空的既有 `BAILIAN_API_KEY`、`BAILIAN_BASE_URL`。语音还需现有 `ASR_PROVIDER=bailian` 和有效素材。配置不可用时直接 `NOT_RUN`，只报告配置名的存在性，不输出值。不会更换模型、跨区域、重试供应商失败、增加应用限额或取消 TLS 验证。默认最多 8 个样本、12 次对外模型请求；OCR、理解、提取及失败请求都计入预算，实际 token 和耗时保存在报告中。未查实时价格，不能把 token 统计说成实际账单金额。

ASR01 的 latest 只有 `clear-observation-speech` 原音，没有标准转写或主体前文注入。它经相同的真实上传与 recognition job 链路，人工核对转写及候选是否保留牛奶量 120ml、否定呕吐，以及主体未说明时仍为 unknown；不正式保存。使用显式资产 manifest 提供绝对 WAV 路径及 `synthetic:true`、`allowModelTransmission:true` 声明；临时生成的音频和 manifest 不提交。该样本沿用独立人工语义审阅模板，未执行或未审阅时没有理解正确率分数。

```powershell
node tests/nurse-conversation-upgrade/run-live.mjs --live '--ids=ASR01' --max-cases=1 --max-model-requests=4 --asset-manifest=.codex-tmp/synthetic-voice-manifest.json --output=tests/nurse-conversation-upgrade/results/asr01-synthetic-clear
```

现有 Bailian 使用 `node:https.request`，预算钩子同时拦截该真实传输边界和 `fetch`，共用一个计数器；错误和成功请求都计数，超预算在传输前阻止。程序测试使用既有 Bailian transport 与合成响应流检验预算、响应字节及 token 元数据，不把该测试称为真实模型调用。

原始 completion `outputText` 仅在 runner 的显式 capture + synthetic 标记、development、回环 Host 和本次新建临时合成 data 目录同时满足时采集，最多 120000 字符；仅从已收到的供应商响应中抽取模型输出，不记录请求 Authorization、环境值或整个供应商响应。数据只进入忽略的 `results/` 报告，不向 stdout 打印。它用于定位契约失败，不能将未通过程序校验的模型字段当成事实。

## 连续真实保存链

```powershell
node tests/nurse-conversation-upgrade/run-flow.mjs
node tests/nurse-conversation-upgrade/run-flow.mjs --live --max-model-requests=20
node tests/nurse-conversation-upgrade/run-flow.mjs --live --screenshots --max-model-requests=20
```

第一条默认 `NOT_RUN`。第二条仅由控制实际模型预算的执行者运行，可加前述 Railway run 前缀；独立写入 `results/flow-*`，不覆盖固定前文回放。20 次是整次流程共享硬上限，不是每条记录各 20 次。不会改变应用已有供应商/模型/限额。

流程使用新的合成账号与 SYNTHETIC-CHILD：先真实表达已结束的睡眠区间，等待既有 recognition job 生成真实候选；只在需要时调用真实 `confirm_subject` API，模拟“这是当前成员的记录”按钮。随后携带实际 context.version、presentedDraft ID/version 发送“保存这条”。第二次通过真实 recognition-assets 上传可核对 PNG 接种资料，再经历相同读取、候选、确认与保存过程。上海凌晨运行时采用已结束的绝对日期，避免“今天7点醒”成为未来时间；不调整系统时钟或补造发生日期。

每轮保留实际 user input/job/reply/source/candidate/receipt；缺候选、来源/时间未确认、保存失败时如实 `FAIL`，不补候选、不改模型输出、不伪造保存结果。成功条件还包括：通过现有 event-record API 找到回执中的原记录、类别为 sleep/vaccination、没有活跃症状卡；接种通过既有 profile-list 验证实际 entryId。保存引导使用应用 `savedRecordGuide.ts` 的真实代码在内存中编译验证，包含精确记录/档案 URL 和“知道了”只改对应 guide；原任务幂等重放不得新增模型请求或改变 record IDs。

不带 `--screenshots` 时只验证 HTTP/持久化与引导数据，状态为 `API_FLOW_PASS_UI_NOT_RUN` 或 `BLOCKED`。带该参数的新进程在实际保存成功后，用后台 headless Chrome 和完整 iPhone SE 设备预设（包括 viewport/DPR/UA/touch）打开本地 `/nurse-station`；不会选择或改变右侧可视预览。运行前由主 agent 构建真实 `dist`；报告保存入口 HTML 哈希。Chrome 未安装或浏览器失败如实记 UI `FAIL`，不使用设计图替代。

浏览器恢复只向该合成账号/成员的既有 capture checkpoint 写入实际 job/context 标识及空输入；不注入 `savedGuides`、聊天、候选或保存回执。页面必须 GET 真实 job/receipt 才能渲染成功气泡。截图前检查真实引导和“查看记录”“知道了”可见、按钮在手机视口内、无横溢；随后验证查看原始 record/profile ID、返回保留未提交输入、“知道了”留在原页且记录仍可读。每条保存的浏览器结果单独为 `PASS/FAIL`，只有全部真实 API 和浏览器检查通过才用 `API_AND_BROWSER_FLOW_PASS`；仅 API 通过但截图失败为 `API_FLOW_PASS_UI_FAIL`。本脚本阻止浏览器发起新的识别/模型提交，界面恢复不应新增模型调用。

`screenshots.test.mjs` 的四项检查使用明确的 inert browser 单元替身验证选项、真实标识恢复、导航/输入/收起边界和失败分类；它们不生成真实截图，不证明页面通过。默认运行 0 调用或单元构造回执也不能算真实保存链通过。新增参数只对启动后的新 runner 进程生效；此前已启动的流程不能回溯标记截图通过。

## 200 次集中预算内的推荐选择

```powershell
node tests/nurse-conversation-upgrade/budget-plan.mjs
```

当前没有外部素材时，94 个 regression 和 9 个 holdout 具备基础输入/素材；这是可尝试执行数量，仍取决于真实供应商配置和应用校验。推荐清单为其中 52 + 8 共 60 例：35 个文本、15 个图片和 2 个静音/图片组合 regression，另有 8 个独立 holdout。它覆盖极简输入、短答、否定未知、更正撤回、多主体、多事项、咨询、药盒/处方/预约、多页和附件指令；不以几何图冒充皮肤照片。

输出八批准确命令：前六批各最多 24 次，第七批最多 12 次，holdout 最多 32 次，总计 188 次，为 200 次集中预算留 12 次。每次 runner 启动仅使用新的合成账号和临时本地库；原有每账号小时限额保留。上限不保证每例完成，达到预算或应用限额后如实 `NOT_RUN`/失败，不提高限额。先执行第一批检查基础链路，出现基础链路错误先定位，不能把八批全部重复执行。重跑也消耗集中预算，须从剩余额度扣除。

Railway CLI 5.45.0 的 `run --help` 已核对，能直接将既有服务变量注入子进程，无需打印或保存变量值。只在现有会话已授权使用该配置时，将下方显式 project/environment/service 替换为核验过的健康产品 Production 关联，再在命令尾部使用 `budget-plan.mjs` 输出的单批参数：

```powershell
railway run --project <project-id> --environment <production-environment-id> --service <health-service-id> --no-local -- node tests/nurse-conversation-upgrade/run-live.mjs --live --split=regression '--ids=T01,T02,T03,T06,T07,T08,T09,T10' --max-cases=8 --max-model-requests=24 --output=tests/nurse-conversation-upgrade/results/bounded-60/regression-01
```

Railway 标志放在子命令前；不使用 `--verbose`、`run env`、`run printenv`、裸 `variable list --json/--kv` 或将配置重定向到文件。`run` 本身不部署、不设置变量；本地应用随后通过 `environment.mjs` 仅接收必要既有模型选项，认证秘密与数据目录始终由 runner 重新生成。此命令尚未在本轮执行，不将 CLI 帮助核对写成凭据注入或模型成功。

本地服务使用新的临时数据目录、合成认证秘密、合成账号/成员和随机回环端口。拒绝外部应用 API URL；只有现有配置的模型主机可被评测子进程调用。不会创建/删除/修改生产成员或健康数据，也不会恢复已停用的 Staging。结束时只清理本次新建的临时目录。

前文是固定、来源明确的合成评测上下文，种入本地测试存储，以保证不同版本在相同前文下回答**最新一轮**。这些前文中的护士句子不是本次真实模型的历史输出，不可把本回放说成“56 场由模型自行完整完成的对话”。有效上一问及其目标来自给定前文；既有事实只按显式 `setup.activeFactSourceIds` 种入；绝不把 `expectedChanges` 或标准答案注入模型。真实自然多轮浏览器流程仍由应用 E2E 单独验证。

夹具文件由评测父进程写入，随后等待 1100ms，超过现有 JsonStore 的 1000ms 快照 TTL，再 GET 精确 context ID 核对消息、上一问与事实来源，确认可见后才提交最新消息。校验失败记 `NOT_RUN` 且不调用模型；不修改应用缓存实现，不通过注入标准答案“修复”夹具。

文本通过本地 `/front-desk-record` 处理。图片和语音先 POST 真实二进制到 `/recognition-assets`，再进入既有 `/recognition-jobs` 并等待有界终态。不是将预设 OCR/模型回答注入服务。读取失败、转换失败、预算、供应商或应用校验失败如实记录。无原件或依赖专门浏览器、迟到、丢回执、版本/保存夹具的用例标记 `NOT_RUN`；现有程序测试的对应映射不能替代这些用例的真实模型执行。缺少身体照片不能用几何图冒充身体照片；合成报告的像素文字可以用于 OCR 来源校验，但不证明真实临床图像诊断能力。

`run-live.mjs --via-jobs` 可选让文本也通过同一真实 recognition job + 后续提取，原直接 front-desk-record API 默认不变。报告用 `textTransport` 区分；固定前文仍如实标记。该路径可能增加真实模型请求，全部计入同一次预算；达到上限不补造候选。示例：`node tests/nurse-conversation-upgrade/run-live.mjs --live --via-jobs '--ids=T08,T09,T15' --max-cases=3 --max-model-requests=12`。

如需额外素材，传 `--asset-manifest=<绝对或工作区相对JSON>`。每项结构如下；路径必须为明确媒体文件，并且不得是配置/密钥文件：

```json
{
  "skin-photo": {
    "path": "D:/evaluation-fixtures/consented-synthetic-skin.png",
    "mimeType": "image/png",
    "synthetic": true,
    "allowModelTransmission": true
  }
}
```

仅提供路径不构成真实健康资料的上传授权；真实个人资料不应进入本评测。默认素材均为可追溯的人工合成数据。报告保留实际上传文件哈希和相应像素原件，便于独立复查。

## 结果、关键错误和质量评分

`report.json` 区分 `NOT_RUN`、`APPLICATION_FAILURE`、`PROGRAM_INVARIANTS_FAIL`、`PROGRAM_INVARIANTS_PASS` 和 `MODEL_OUTPUT_CAPTURED`。只有真实响应被捕获后才能进入语义审阅；`MODEL_OUTPUT_CAPTURED` 不是“理解通过”。结构/JSON 正确不等于事实正确。

每例通用风险边界包含错主体、编造、未经确认保存、空内容成功、重复保存、旧结果覆盖和附件指令执行。`risk=blocker` 指这些写入不变量，**不表示每个非关键措辞差异都被算作阻断错误**。回放检查实际事件数量、操作回执、候选状态与来源引用；这些不变量也不能替代服务端权限、事务、版本和幂等测试。更正与撤回必须区分受影响旧来源和本轮授权来源。

程序可以检出确定的来源/状态错误，临床归纳、上下文理解是否充分、问题是否必要等需要独立审阅。请在 `review-template.json` 的每个已捕获输出中填写审阅人，以及输入理解、上下文关系、事实变化、回应适宜性、是否追问、是否不必要追问和关键错误。不得仅因文本更长或术语更多判为专业。

`expected.responseMode` 使用现有 v2 契约枚举；`responseIntent` 保留“解释、观察、更正”等细分审阅意图，不能把它当作额外合法模型枚举。`expectedChanges` 是语义验收依据，不是给模型的输出示例或生产领域 Schema。

```powershell
node tests/nurse-conversation-upgrade/score-review.mjs <report.json> <completed-review.json> <score.json>
```

评分分别给出 T/C/I/V/Q 分组理解正确率、不必要问题数/有追问轮数，以及不必要问题数/所有审阅轮数。四项理解维度均正确才记该轮理解正确；未填写的审阅不是通过。任何关键错误或程序失败都阻断结果；部分样本达标不能转成全清单达标。regression 与 holdout 必须分开回放、分开独立审阅；holdout 不用于提示词调试。95% 和 5% 均为待验证目标。

仅有 schema、固定替身或手工构造的输出不能声明真实模型达标：评分器另核实报告中有实际对外模型请求及成功回执。单份评分的 `fullChecklistAcceptance` 始终为 false。只有同时提供完整 121 regression 和 12 holdout 的独立审阅且无阻断/未执行时，才能合并判断全清单目标；新增 ASR01 仍不能替代原 96 项中的语音错误场景，此结论依然不是临床审核或阿福比较：

```powershell
node tests/nurse-conversation-upgrade/score-review.mjs <regression-report.json> <regression-review.json> <combined-score.json> <holdout-report.json> <holdout-review.json>
```

没有阿福同条件原始输出、同附件和盲评审阅，本设施不报告比较胜率。没有有资质人员专业审阅和真实设备操作，不报告临床审核或实体 iPhone/Safari 通过。

本轮设施检查：五个测试文件包含 27 项程序测试；真实模型与保存链结果需查看各次独立运行报告。默认执行得到 `NOT_RUN`、0 条真实模型请求。回环 HTTP 夹具在默认沙箱遇到 EACCES 后，已使用获准的本地测试权限运行成功。

主 agent 首批真实模型调用已产生 3 条输出，独立审阅保存在该次忽略目录的 `independent-review.json` / `independent-score.json`：T02 单轮轻引导可接受；T06 不必要地转入孩子不适问询且问句未形成 nextQuestion；T08 将无主体“疼”扩写为孩子说疼，同时无待核对事实变化，属于阻断性主体错误。另 4 例是修复前的 seed 缓存夹具 404，不能作为模型理解结果或已证实应用回归。仅有这 3 例不能声明任何总体正确率、追问率目标或全清单达标。本子任务没有额外模型调用，主 agent 单独维护真实调用预算。
