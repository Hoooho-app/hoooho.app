# Hoooho 百炼接入追踪与主环境验收

本报告逐项核对 `ai-business-integration.md` 原 20 项编号（不是补造新 20 项）。最初百炼接入基线为 `ed0d7dcb63664eefc71536a19b2c32fa2225e07d`；2026-10-03 质量修复基线为远端 `production/main` 的 `effbfb0bc62602aa7da607032df7501e1ad7e0b0`，包含已发布的百炼与账号隔离补丁。保留现有分支及提交，没有合入未知功能分支。当前用户明确授权 **Production 主环境，不使用 Staging**。

真实调用累计 **2 次**（bailian / qwen3.7-plus）：文字已收到真实响应，但分类/日期质量未达标；图片上游 HTTP 200，应用 `AI_OUTPUT_INVALID`。真实摘要和 AI 导出**未执行**。本轮质量修复的真实模型请求 **0 次**，仅离线测试；发布修复不等于真实复验通过。Production 现有密钥、Base URL、文字/图片模型与消费限制原值保留，不再要求重新配置。

状态定义：**已完成**=相应代码/文档已落实；**代码验证通过**=本地替身/回归通过，不能代表真实调用；**真实调用验证通过**=收到百炼真实响应并核对供应商与诊断；**主环境验证通过**=已发布版本的实际隔离账号业务验收通过。未达到后两种状态不得称 AI 全部接通。

## 1. 原 20 项追踪表

所有百炼模型项：本地采用替身验证；真实验收状态逐项如下，不将收到 HTTP 200 等同业务通过。用户已确认有可用额度，工具未读取阿里云私有余额/限额。确定性项不新增模型调用。ASR/TTS 单列，不用文字模型伪装实现。

| 原编号 | 功能与已有入口 | 实际 Provider / OpenAI 专属依赖 | 本次适配及验证范围 | 当前限制 / 尚需配置 |
| --- | --- | --- | --- | --- |
| 01 | 健康随记→就诊情况单→病情摘要、重生成、版本与导出 | Production Bailian Chat；保留 OpenAI Responses 与本地事实 | 共用原摘要提示词、来源/不确定性校验和保存事务；百炼显示/文本/离线 HTML；失败保留旧版 | 配置已保存；真实摘要、AI 文本/HTML 导出未执行；本地导出已通过 |
| 03 | 情况单可编辑复制给 AI 的问诊提示词 | 本地确定性模板，无专属接口 | 复用保存报告与复制机制，零新增模型调用 | 外部医生/其他 AI 的回答不属于本项目接入结果 |
| 04 | 草稿时间解析、病程整理 | 字段抽取百炼；TimeResolver 本地规则 | 修复原文明确日期被遗漏；参考日期/用户时区、日级精度和来源保留，冲突拒绝保存 | 历史真实“今天”未提取；离线修复通过，真实复验待执行；不以保存时间代替发病时间 |
| 05 | 健康随记“智能记录”文字草稿 | Production Bailian Chat，OpenAI 保留 | 严格 schema；确认后保存、编辑、失败原稿保留；分类元数据校正与否定保留检查 | 真实响应已有，但“恶心”误归检查，文字质量未达标；本轮离线修复通过，待真实复验 |
| 06 | 智能记录录音→文字 | 独立 OpenAI `/audio/transcriptions` | 保留现有 ASR；百炼模式默认 none，不使用旧 OpenAI 密钥 | 百炼 ASR **未接通**；qwen3.7-plus 无此能力，需另确认 ASR 供应商/模型/接口/权限 |
| 07 | 草稿补充问题和跳过 | 百炼抽取 + 本地最多 3 个必要问题规则 | 原有多轮编辑/历史及跳过保留，不新增问答聊天系统 | 配置已保存，真实多轮路径未验；问题不是诊断建议 |
| 08 | 多事项分类、一次确认保存 | 百炼抽取 + 本地枚举/事务 | 严格结构、引用、幂等与重复提交、全量回滚 | 限 30 项，不静默漏存 |
| 10 | 睡眠、排便、户外等表单预填 | 百炼提取；时长等后台确定性计算 | 原 journal 结构复用，不把统计改由模型生成 | 缺失字段保持未知 |
| 11 | 图片、单页/多页 PDF 资料识别 | OpenAI input_file/input_image → 百炼图片输入 | PDF 后端逐页转 PNG，原件/页码/hash保留；补齐 OCR 输出契约与分阶段安全诊断；严格校验未放宽 | 真实一页 OCR 失败，未进入后续抽取；原响应未保留，具体 JSON/schema 子因待证据；12 文件/12 页/15 MB |
| 12 | 报告、处方、病历→就诊记录 | 同一百炼 OCR/抽取链 | 原诊断、药名、原剂量/单位、医生陈述及用户确认，保留旧手动入口 | 识别不清须待确认；不自行开药或修改剂量 |
| 13 | 健康档案/过敏资料历史归档 | 百炼抽取 + 本地归档 | 复用现有栏目、来源附件与归档冲突确认，成员隔离 | 无明确事实不新增确诊/住院栏目 |
| 14 | 重复资料、合并、保存与撤销 | 本地规则，不调用模型 | 原哈希/引用合并/异日和冲突并列/撤销保护回归 | 用户保存后又修改的记录不由撤销删除 |
| 15 | 疑似过敏与检测阳性资料 | 百炼抽取 + 本地归档规则 | 原诊断确定性与来源保留，不将检测阳性当确诊 | 不按皮疹照片确诊，不自动扩大忌口 |
| 16 | 食物和症状时间关联 | 本地规则/当前成员资料 | 保留 4 小时时间窗及“关联不等于因果”，零模型调用 | 不提供病因确诊 |
| 17 | ABC 输入及统计 | 百炼可抽取原 ABC 字段；数字由本地规则 | 不猜数字；缺失不补 0 | **ABC 百分比计算规则未确认，未完成**；不阻塞其他发布 |
| 22 | 排敏记录事实摘要 | 本地 memberInsights | 当前成员既有记录整理，原入口/来源不变，零模型调用 | 不宣称模型生成或已临床排除 |
| 24 | 有限自然语言搜索 | 本地有限词表与成员过滤 | 原搜索及无结果状态，零新增模型调用 | 不是语义向量搜索；未扩展范围 |
| 30 | 对话式语音记录与语音反馈 | 独立 ASR→文字抽取→OpenAI TTS | 文字抽取可百炼；原多轮确认机制保留；百炼模式默认 ASR/TTS none | **百炼语音未接通**，不可宣称 Realtime 或自动收费替代 |
| 02 | 问诊问题模板 | 本地模板与保存摘要 | 复用问诊模板，零新增模型调用 | 不代替医生诊疗 |
| 18 | 双语饮食说明卡/有限翻译 | 本地已确认词典/人工说明 | 复用已批准有限翻译，零新增模型调用 | 没有开放模型翻译接口，不扩大承诺 |

## 2. 接口与安全边界

- 后端仍沿用 `OpenAIProvider` 的领域提示词与病情摘要引用校验。新增 `BailianProvider` 只在传输边界把内部输入映射成 **Chat Completions**：`POST <控制台 Base URL>/chat/completions`；并没有把 `/responses` 直接发给百炼。
- Base URL 必须来自**用户自己的北京业务空间控制台**，HTTPS、无账号密码、查询参数或 fragment，以 `/compatible-mode/v1` 结尾。拒绝原生 `/api/v1`、API Host、外部供应商 URL 或已经追加 `/chat/completions` 的地址；绝不硬编码业务空间 ID。
- 使用既有 Node fetch，不新增 OpenAI SDK 自动重试；**自动重试固定为 0**，`stream:false`、`enable_thinking:false`、`json_schema`。官方支持 function calling 和 SSE，但本业务未授权工具执行、未采用流式入库，因此不发送工具/联网参数，收到工具调用拒绝。
- 模型输出经 Ajv 严格结构校验，再通过原引用、数字、单位、否定、主体与时间校验后才可进入确认保存。文档文字只能是用户资料，不能设置 system/tool 角色或执行工具。
- PDF 的现有 OpenAI `file_data` 不适用于 qwen3.7-plus：后端使用锁定的 PDF.js 与 Canvas 本地转图；不使用文件公开外链或擅自换成 qwen3.5-ocr。逐页图上限 2000px，转图限时 15 秒、并发 2；保留原 PDF 和页码供核对。
- 权限仍由服务端验证 `accountId/currentMemberId`。调用限流按实际出站请求计数（失败也计入），账号每小时默认 30 次，全服务并发 2；现有单草稿最大 14 次、去重缓存与幂等继续生效。当前是单实例内存限流；扩到多实例前须共享限流状态。
- 仅记录 provider/model/task/耗时/Token/请求标识/成功状态与脱敏错误；不记录 key、Authorization、输入原文、完整上游响应。没有请求头标识时如实记录 null，不能把本地测试 ID 当真实证据。
- 手动记录默认本地整理，即使存在服务端密钥也不暗中付费调用。AI 配置错误不会阻止应用启动/手动记录/本地情况单/导出；显式 AI 操作报可定位错误，不能用本地结果伪装 AI 成功。

官方依据：[模型能力](https://help.aliyun.com/zh/model-studio/qwen3-7-plus)、[Chat 参数](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions)、[结构化输出](https://help.aliyun.com/zh/model-studio/qwen-structured-output)、[Responses 文件限制](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-responses)、[地域与兼容地址](https://help.aliyun.com/zh/model-studio/regions/)、[错误码](https://help.aliyun.com/zh/model-studio/error-code)。模型能力不等于当前账户权限/免费额度已验证。

## 3. Railway Production 变量契约（一次配置）

项目 **creative-nurturing** → 环境 **production** → 后端服务 **hoooho.app** → **Variables**。所有变量均为该服务的后端环境变量，无 `VITE_` 前缀。任何变更需 Apply Changes 并触发该服务重新部署/启动后生效；运行进程不热读取新值。

当前已配置并收到真实百炼响应。本轮仅检查存在性与安全边界，**不写入或重新配置任何变量**。下表保留作为配置契约，不是新的用户操作要求。

| 精确变量名 | 必填/默认 | 用户填写值或说明 |
| --- | --- | --- |
| `AI_PROVIDER` | 开启百炼必填 | `bailian`。可选 `openai`/`local`；不设置时保留旧逻辑：存在 OpenAI 密钥则 OpenAI，否则 local |
| `BAILIAN_API_KEY` | 百炼必填 | **由用户自行填入新通用 API Key**，不要发送聊天或截图 |
| `BAILIAN_BASE_URL` | 百炼必填，无默认 URL | 粘贴自己控制台提供的**华北2（北京）OpenAI 兼容 Base URL**；不是请求 endpoint |
| `BAILIAN_MODEL` | 可选，建议明确填入 | `qwen3.7-plus`；不读取旧 `AI_MODEL`，不自动换模型 |
| `BAILIAN_VISION_MODEL` | 可选，默认文字模型 | `qwen3.7-plus`；本次不改用其他图片付费模型 |
| `BAILIAN_TIMEOUT_MS` | 可选，默认 60000 | `60000`；范围 1000–120000 毫秒 |
| `BAILIAN_MAX_OUTPUT_TOKENS` | 可选，默认 8000 | `8000`；范围 3000–16000，超限结果拒绝而不是保存截断事实 |
| `BAILIAN_MAX_INPUT_CHARACTERS` | 可选，默认 65000 | `65000`；1000–120000，超过拒绝而非静默截断 |
| `BAILIAN_MAX_IMAGES_PER_REQUEST` | 可选，默认 1 | `1`；1–12；本业务资料逐页请求，总量仍受 12 页限制 |
| `AI_MAX_CALLS_PER_ACCOUNT_HOUR` | 可选，默认 30 | `30`；1–1000，失败也计数，按账号而非孩子重复计算 |
| `AI_MAX_CONCURRENT_CALLS` | 可选，默认 2 | `2`；1–10，多余请求直接提示繁忙，无无限队列/重试 |
| `AI_DRAFT_MAX_CALLS` | 既有，可选默认 14 | `14`；2–100，完整 12 页+抽取至少需要 13 次 |
| `ASR_PROVIDER` | 百炼模式默认 none，建议明确 | `none`；保留 `openai` 选项需独立 OpenAI 配置和用户授权，不复用百炼 key |
| `TTS_PROVIDER` | 百炼模式默认 none，建议明确 | `none`；同上，qwen3.7-plus 不是语音回复模型 |

无密钥形状示例：`https://<你的业务空间>.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`。这**不是可直接复制的实际地址**，应粘贴控制台原值；若控制台明确提供旧北京域名 `dashscope.aliyuncs.com/compatible-mode/v1`，同样可用。不要追加 `/chat/completions`，代码只追加一次。

保留 OpenAI 服务端变量 `OPENAI_API_KEY/OPENAI_BASE_URL/AI_MODEL/AI_DRAFT_MODEL/AI_VISION_MODEL/ASR_MODEL/AI_SPEECH_MODEL`，本次不删除/输出/轮换旧密钥。百炼模式不读取旧文字/图片模型变量。ASR/TTS `none` 是明确未配置，不标称语音接通。

## 4. 免费额度与配置状态

已连接工具没有读取阿里云当前私有免费额度与停止开关的能力；未声称已检查余额或额度。用户已确认可用额度，Production 已有新密钥与兼容 Base URL 且收到真实响应，本轮不重复索要配置、网络或鉴权确认。额度未来变动可在[北京免费额度页](https://bailian.console.aliyun.com/cn-beijing/costing-balance/free-quota)查看模型 Code、剩余 Token、到期时间、状态及“免费额度用完即停”；权限入口为[北京模型广场](https://bailian.console.aliyun.com/cn-beijing/model/market)。本轮没有读取这些私有字段，也不根据旧截图编造余量。

**50 元余额不是消费硬上限**。免费额度即停可防继续按量调用，但会让生产 AI 在额度耗尽/过期后中断；普通记录、本地整理、导出仍可用。预算预警只通知，不能等同停止。不会为绕过停止开关自动切模型、切供应商、充值或提高消费限额。阿里云说明开关同步存在延迟，须确认已生效后再验收。[官方规则](https://help.aliyun.com/zh/model-studio/new-free-quota)

## 5. 主环境验收（真实调用预算最多 4 次，首个失败即停）

本轮发布/验证不发送模型请求。修复后下一轮最小完整真实复验预算如下：最多 **4 次**（文字1 + 图片OCR/抽取2 + 摘要1），自动重试 **0 次**，首个失败即停；不是本轮执行记录：

1. 专门验收账号下虚构孩子 A：合成文字“今天没有呕吐，只是恶心”→可核对草稿→确认保存，**1 次**；核对 supplier=bailian、model=qwen3.7-plus、供应商请求标识（若供应商不返回则如实说明）。
2. 不含个人信息的合成资料 PNG→一页 OCR→结构化草稿→用户确认保存，**2 次**。合成图片只能含虚构资料/标明测试，不能借真实儿童报告。
3. 同一孩子 A 的已保存测试记录→病情摘要，**1 次**。核对来源、阴性/疑似保留、当前成员与账户、版本保存。
4. 摘要文本与离线 HTML 导出、复制问诊提示词、孩子 B 无串数据、手动记录与本地整理均 **0 次**。
5. 失败保留草稿/旧摘要由本地替身覆盖；生产不注入测试替身、不故意制造付费失败调用。若真实验收遇到失败，自然验证保留行为并立即停止。之后仅报告具体码/请求标识与唯一下一步，不追加探测。

最多 4 次供应商 HTTP 请求；总输入/输出 Token 由 safe usage 日志实际统计，不凭字符编造费用。多页 PDF 替身覆盖，本轮真实预算不额外上传多页扩大调用量。ASR/TTS 未配置不发真实请求。

清理仅针对该验收账号下本次创建的记录、附件、虚构成员，通过已有 API/页面撤销/删除；不得重置数据库或直接批量修改 `/data` JSON。没有可删除报告/账号授权入口时如实保留隔离测试数据并报告，不能假称全清理。

## 6. 发布与回滚

- Canonical：`https://github.com/Hoooho-app/hoooho.app.git`，Git remote **production**（origin 是外层文档库），正式发布源 **main**。
- Railway 项目 `d8855fe3-c785-4b8c-825b-bdb10a941850`，Production 环境 `68b9b73f-1401-4658-a315-6d333ec31728`，服务 `aa308ba0-d7da-4771-9c94-ccdcd110f636`（hoooho.app），入口 `https://hoooho.com`，持久卷 `/data`。
- 本轮质量修复发布前生产：Deployment `bdfe1572-8d81-4f3f-a64e-49e49ff170c2`，SUCCESS，提交 `effbfb0bc62602aa7da607032df7501e1ad7e0b0`。无数据库迁移，无生产数据覆盖/清库；不修改现有密钥、Base URL、模型、额度/消费限制。
- 本地检查→secret/front/history 检查→聚焦 commit→push `codex/bailian-ai-20261002`→正常 PR 合入远端 main→Railway main 触发 Production→核对 deployed commit/SUCCESS/health/页面和资源。不 force push，不混入未知分支。本轮只做零模型调用的手动记录/本地整理/导出/成员隔离主环境回归。
- 应用回归：停止扩大修改，优先对本轮聚焦修复提交创建正常 revert PR 进入 main，重新发布；不改 Provider/变量、不删卷。若需立即恢复旧产物且旧 Deployment 已 REMOVED 或无 Rollback 菜单，使用独立干净 worktree：`git worktree add --detach D:/projects/hoooho/.worktrees/bailian-rollback-effbfb0b effbfb0bc62602aa7da607032df7501e1ad7e0b0`；在该路径执行 `railway up --project d8855fe3-c785-4b8c-825b-bdb10a941850 --service aa308ba0-d7da-4771-9c94-ccdcd110f636 --environment production --detach --message rollback-to-effbfb0b`，核对 SUCCESS、产物来自该旧提交及 health。随后正常 revert PR 保持 main/生产一致。不 reset main，不重置数据库；回滚不重写既有用户记录。

## 7. 验证记录

2026-10-03 本轮离线验证：AI/业务/附件/摘要/百炼/OpenAI/时间/来源及 parser 相关综合 **187/187 PASS**；客户端 **549/549 PASS**；百炼 iPhone SE E2E **9/9 PASS**（后端 mock，包含分类/时间校正→确认→保存→撤销，保存不增加模型调用）；TypeScript 与生产 build/viewport/auth/install-assets guards PASS；diff check PASS。新增质量与诊断测试 **22/22** 包含在综合测试中。LocalFactProvider P0 **30/30、48/48 匹配**，修复前后无退化；65项症状追踪回归全部通过。本轮无独立 lint 命令（N/A），未升级依赖。

新增病例基于合成输入及重建的供应商测试替身：修复前同组9例 **1通过/8失败**，修复后9例全通过，另加2例时间/否定边界；覆盖否定、今天/昨天/昨日、跨午夜、上海/洛杉矶时区、多症状、分事项日期、时间冲突、未说时间不补保存时刻、明确检查不改分类。协议诊断另覆盖响应解包、JSON解析、schema required/type/enum/额外字段、截断、精确来源字段路径和未知字段脱敏。**真实响应回放0例**：历史原始响应未保留，不将重建替身称为原响应复现。主环境不注入这些替身。

历史真实请求记录：`d88b51db-959e-9abf-a687-c69daa04f37c`（文字响应，质量未过）、`bcc450ac-b8da-95ad-820f-29dc33eeb6ad`（图片HTTP200，应用失败）。累计真实2次，首个失败停止；图片后续抽取、真实摘要、AI导出均未执行。以前的本地生产手动记录/本地导出/孩子隔离通过，不代表AI真实验收通过。

此前全量服务端：198/199（既有基线 FAIL）；本轮只运行与修复相关的综合回归，未重复全量服务端。既有 `ops-service.test.mjs` 固定 2026-09-02 样例在当前时间超过 30 天，`history()` 按真实现在保留期清除失败快照，测试还期待失败快照首位。main 中该服务/测试与本次零差异，原 AI 工作树亦独立复现 10/11。未删除/跳过/弱化测试，未夹带 Operations 修复；不把相关测试通过写成全量服务器通过。

### 7.1 两项问题的证据与修复边界

**图片**：读取本地 `outputs/bailian-ai/production-bailian-acceptance-20261003.md` 与脱敏 provider 证据，历史错误同时具备 HTTP200/AI_OUTPUT_INVALID。当时代码只在解包 JSON 成功之后设置 HTTP状态；错误可定位为 `choices[0].message.content` 的 **JSON解析或Ajv结构校验** 两个子阶段之一，不能进一步判定哪个字段。缺内容对应 AI_OUTPUT_EMPTY，截断对应 AI_OUTPUT_INCOMPLETE；资料页尚未进入来源/语义校验。没有保留本次合成资料完整上游响应，不能声称复现真实原响应。旧日志没有阶段/路径，Ajv原因被统一错误码丢弃，导致无法再精确追溯。官方确认qwen3.7-plus支持json_schema，故不假设兼容协议需换成另一接口或宽松格式。

本次补齐固定OCR `text:string/status:readable|uncertain|blank` 明确指令，**不更改严格schema，不剥离代码围栏、不加默认值、不接受不合格输出**；新增安全诊断 `validation.stage/fieldPath/reason` 覆盖解包、JSON、schema、来源、语义及截断。日志单行JSON保留requestId/HTTP状态/Token等已有元数据，路径只取固定schema字段及索引，未知键脱敏，绝不输出Ajv原始message/data/JSON异常原文。无“模型再修一次”请求。此次可确认修复的是诊断与指令契约缺口，历史图片具体子因仍待下一轮真实证据。

**文字**：真实截图展示“检查”和未知时间；现有前端按服务端category/time忠实展示。原schema只有分类枚举、缺身体症状分类规则；领域层接受“只有symptom字段的examination”以及显式日期被遗漏的null，未利用来源核对这些元数据。既有LocalFactProvider可识别“没有呕吐”为否定、“恶心”为阳性并提取“今天”，TimeResolver能按参考日期/时区解析日范围。因此修复服务层提示词及领域元数据一致性，而非重做页面或特判单句。

经严格原文引用校验后，仅当全部字段属于症状字段且没有检查字段时校正误分类；日期只从同句、同页、唯一原话及已有本地解析取得，按草稿的referenceNow/timezone解析并保留原文、日精度和来源。保存的occurredAt是既有存储契约中的日范围锚点，来源time.precision=day/resolvedStart/resolvedEnd明确不是编造发病时刻。不跨句继承时间；冲突拒绝保存。否定已存在则保留，模型漏掉否定事实则拒绝，不自动补生成临床字段。确认后保存、成员隔离、事务/幂等、失败保留草稿及旧摘要沿用原流程；可追溯categoryResolution/timeResolution保存在既有aiProvenance中。

收尾补齐旧事件分享摘要入口：再次校验当前事件的成员归属、将账号传入模型限流、保留已脱敏的错误类型供页面反馈。补丁相关事件/摘要/百炼回归 21/21（含新增成员失效零调用案例）；未重复运行与该后端补丁无关的客户端/build。

## 8. 既有 5 项 high 审计（单独后续任务，不运行 audit fix）

本轮 npm audit 仍为 5 high、0 critical。13 个新增包来自锁定的 PDF.js/Canvas 平台依赖及 Ajv 的直接声明；**既有包版本未升级**。

| 依赖 | 影响 | 后续建议 |
| --- | --- | --- |
| `@playwright/test 1.55.0` | 继承 playwright 浏览器下载证书认证问题，主要测试/CI 安装链 | 与 playwright 同步升级至 >=1.55.1，经移动/媒体 E2E 验证；本次使用已有 Chrome，不下载浏览器 |
| `playwright 1.55.0` | 下载/安装浏览器时不能可靠验证 SSL 证书，[公告](https://github.com/advisories/GHSA-7mvr-c777-76hp) | >=1.55.1；不能用关闭 TLS 来规避 |
| `brace-expansion 2.1.4 / 5.0.9` | 恶意嵌套大括号触发递归/CPU DoS，[公告](https://github.com/advisories/GHSA-qhr7-859c-m2p7) | 相关上游升级，2.x>=2.1.7 / 5.x>=5.0.12 后复测构建/文件匹配 |
| `fast-uri 3.1.5` | URI 主机混淆/SSRF 等，[公告](https://github.com/advisories/GHSA-f65p-4m7j-42xc)；Ajv 本轮成为运行依赖，所以此传递依赖也进入后端 | >=3.1.8 后独立回归 Ajv/构建；本代码只编译服务端固定 schema，不接收用户 schema/外部 `$ref`，实际 AI Host 用 WHATWG URL 固定北京白名单，不由 fast-uri 决定路由 |
| `nanoid 3.3.16` | custom generator size=0 可能无限循环，[公告](https://github.com/advisories/GHSA-2v37-7h3g-55p8) | >=3.3.18，复测 PWA/构建；业务 ID 仍用 node randomUUID |
