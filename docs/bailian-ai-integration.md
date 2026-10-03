# Hoooho 百炼接入追踪与主环境验收

## 录音失败路径修复（2026-10-03，覆盖下文历史 ASR 未接通状态）

实际故障：Production `ASR_PROVIDER=none`，语音接口返回 `ASR_NOT_CONFIGURED`，而界面仍可勾选未接通的“AI合成语音”。本次独立接入北京同步 `qwen3-asr-flash`，不使用 qwen3.7-plus 冒充 ASR，不扩展 TTS。

- 文字输入明确置于录音/图片操作之前，可直接编辑；语音错误与整理错误分开，原文字、图片、已有草稿/初步结果不清空。转写过程中允许编辑文字/选择图片，结束后才主动整理。
- 停止录音 → 明确转写状态 → 转写文字追加并可编辑 → 用户主动点击整理 → 百炼 qwen3.7-plus 现有草稿/预览 → 用户点击确认保存。不将转写内容中的“保存/取消”当授权命令，不隐藏自动整理/保存/重试。
- Safari MP4/AAC、Chrome WebM/Opus 从实际录音字节经 AudioContext 解码，转16kHz单声道PCM WAV；官方 Qwen3-ASR格式表未列MP4，因此不仅更名或假定直传支持。最长90秒，编码后10MB供应商限制；音频只在当前窗口/当前请求内存使用，失败录音仅供主动重试，取消或关闭清理。
- 新增认证后只读 `/api/ai/audio/capabilities`，用于禁用未配置TTS，查询不调用供应商。转写请求包含当前memberId，服务端重新验证账号成员归属。ASR复用账号限流/并发，自动重试0；日志只有任务/模型/请求标识/用量/耗时/安全错误，不含音频、转写原文、密钥。

| Railway production → hoooho.app 变量 | 值 | 说明 |
| --- | --- | --- |
| ASR_PROVIDER | bailian | 显式开启独立ASR，本次由已有Railway授权配置 |
| BAILIAN_ASR_MODEL | qwen3-asr-flash | 独立同步语音模型，仅允许该模型或官方已核对快照 |
| BAILIAN_ASR_TIMEOUT_MS | 可选，默认60000 | 1000–120000毫秒，重启/重新部署生效 |
| BAILIAN_API_KEY / BAILIAN_BASE_URL | 保留原值 | 同一北京业务空间凭据与兼容地址，不展示/轮换 |
| BAILIAN_MODEL / BAILIAN_VISION_MODEL | qwen3.7-plus，保留 | 本次不改文字/图片模型 |
| TTS_PROVIDER | none，保留 | 语音回复尚未接通，checkbox禁用 |

ASR最终接口为现有 `BAILIAN_BASE_URL + /chat/completions`，请求仅input_audio Data URL、stream=false、asr_options.enable_itn=false；不带文字模型的JSON schema、thinking或max_tokens。见[官方ASR API](https://help.aliyun.com/zh/model-studio/qwen-asr-api-reference)和[格式/限制表](https://help.aliyun.com/zh/model-studio/asr-model/)。

核对官方[北京价格](https://help.aliyun.com/zh/model-studio/model-pricing)：qwen3-asr-flash输入音频0.00022元/秒，输出不计费；列示免费额度36000秒/90天，但这是模型公开政策，不是用户当前私有余额或ASR额度。文字模型100万Token额度不能推断为ASR额度。未读取用户ASR私有额度/到期/即停状态，不自行充值、开通付费套餐或修改停止开关。权限以本轮最小实际ASR请求结果核实；权限/额度/持续网络失败停止模型调用。

沿用总预算12，开始本轮已耗7、余5。优先计划录音ASR1次+同一转写文字整理1次（共2），其余3仅保留必要复验；每次真实供应商出站含失败均记账，无自动重试。调用前完成相关离线检查和Production发布，最终实际次数/请求标识/截图另存忽略的 `outputs/bailian-ai/asr-acceptance/`。不把替身、入口存在、Chrome手机模拟或Windows WebKit当真实iPhone Safari硬件麦克风验收：当前工具没有连接实体iPhone，Windows WebKit不提供MediaRecorder/AudioContext/getUserMedia；硬件权限交互如无法取得设备，只能明确列为待实际手机验证。

回滚基线：生产main `0c709c16b465a2b7aee1db54d242235395f39a50`，部署`95fe4d94-b7d6-42fa-8e75-17249705e05f`。正常revert本次ASR聚焦merge进入main；如需撤ASR开关恢复先前ASR_PROVIDER=none并撤本次新增BAILIAN_ASR_MODEL，仅动本次两项，原密钥/兼容地址/文字模型/TTS/消费设置不变。无数据库迁移或用户记录覆盖。

## 当前交付：独立开放的真实 AI 体验（2026-10-03）

本节覆盖下文历史的“整体阻塞即关闭体验/下一轮单次”条件；不将入口开放或替身通过当作真实验收通过。当前手机入口独立开放：健康随记 `/health-events` → 智能记录（文字/上传图片）；健康档案 → 智能记录 → 上传与智能识别；病情数据 `/visit-summary` → 生成 AI 病情摘要。原手动入口继续保留，某功能失败不关闭其他功能。

本版第一组 Production 实验已执行3次（不是0次）：文字 `b7015023-8ae0-9c67-9295-1aed27646fb9`，502输入/123输出Token，草稿类别symptom、今天按Asia/Shanghai日精度、否定与恶心原话保留，用户确认保存通过；图片 `c8b57aea-ea1d-95c6-80a9-586829d51515`，741/68Token，上游200，OCR返回单元素数组，严格object schema在 `/` 因type拒绝，抽取未发请求；摘要 `1e07bcf3-9347-9803-aafc-eb439bbc5f0d`，447/360Token，真实可读但语义校验未通过，独立待核对预览/TXT/离线HTML打开通过，旧报告未改。供应商全部bailian，模型全部qwen3.7-plus。孩子切换隔离通过，本次正常删除2位虚构成员及测试记录/事件/草稿，会话已退出。

图片完整合成响应现在已保留并离线回放，fixture `server/ai/providers/fixtures/bailian-synthetic-ocr-array-20261003.json` 与安全日志请求标识匹配。仅补数组OCR的可读文字投影，结构仍拒绝、不能直接保存，不变成“真实自动识别入库成功”。这不是此前丢失的图片响应回放。后续仅图片体验补验预算最多2请求，总任务已耗6/12、余6；不会重复已通过的文字/摘要模型调用。新展示兼容补丁相关17项通过，手机真实内容离线回放与构建复核；最终图片实际状态见验收产物。

| 功能 | 本次展示与保存契约 | 代码/离线状态 | 本版真实生产状态 |
| --- | --- | --- | --- |
| 文字整理 | 合格草稿可逐项编辑、确认保存；可读但未通过校验单独标为「AI初步整理，需核对」，显示失败字段路径，不升级为 ready | 服务端权限/否定/来源/幂等保持，回归通过 | 发布后独立验证，不能沿用历史失败当成功 |
| 图片资料 | 已识别文字在后续抽取失败时仍展示；协议失败只投影可读字段，不展示内部 JSON；原稿/原件保留 | OCR 成功/提取失败与结构失败预览回归通过 | 发布后独立验证，单页最多 OCR+抽取 2 次 |
| 手动承接 | 可编辑预览或原文带入既有快捷手动表单，用户核对发生时间再确认；普通 text_record/other，无 AI 已验证标识、不自动档案关联 | iPhone SE 真交互用本地供应商替身验证，保存0额外模型请求 | 发布后验证正常保存与成员隔离 |
| 病情摘要 | 手机先生成独立待确认草稿，概述可编辑；服务端缓存候选按账号/成员/来源指纹/版本/24h隔离；确认再次校验来源与修改后的概述，不追加模型调用；失败不覆盖旧摘要 | 候选确认、来源变化、跨账号拒绝、旧版保留、缓存幂等回归通过 | 发布后独立验证，不以文字失败阻塞 |
| 初步摘要导出 | 未验证预览单独导出 TXT/离线 HTML，永久「待核对·非已确认报告」，转义 HTML、禁用脚本/外部资源；不混入正式报告 | 手机替身下载/离线打开通过 | 必须获得本版真实预览后才能标为真实通过 |
| 正式/本地导出 | 沿用就诊情况单布局和已有导出；本地明确标为本地事实整理 | 原导出手机回归通过 | 无 AI 响应也可使用本地导出 |

预览内容是用户本次授权请求的私人结果，不是医疗事实：仅按权限返回/存入现有临时草稿，不进入普通日志、正式记录、过敏史、医嘱或任务。错误对象预览不可枚举；日志仅安全诊断。合成回放仍受固定白名单约束，普通用户不返回原供应商 JSON。没有可读响应/超时/鉴权失败不制造预览、不用本地事实假冒模型输出；用户可主动重试，自动重试0。

本版必要验证：相关服务端145/145、手机本地替身E2E12/12、类型与生产构建通过（发布前复核受最后调整影响的检查），HTML转义及待核对标识测试通过。替身与真实调用严格区分，历史丢失响应未被伪造为真实回放。没有依赖升级、数据库迁移或环境变量/消费限制变化。

本任务预算仍总共12，已耗3；本次真实体验验收优先预算4：文字1、单页图片OCR+抽取2、摘要1，余下5保留，所有请求自动重试0。网络持续失败或鉴权/权限/额度问题停止模型调用，但不阻止这份体验代码发布。各请求与可获得的 requestId/Token、手机截图和部署版本记录在忽略的 `outputs/bailian-ai/experience-acceptance/`，实际次数同步持续任务 ledger；不得重置已耗3次。

发布与回滚：仅从已验证聚焦PR进入 canonical `Hoooho-app/hoooho.app` main → Railway creative-nurturing / production / hoooho.app。发布前生产基线 `09faf2a965455206fe1e53ade652cfb618d1cfa9`，部署 `98881e56-b72d-4395-b6ea-8abf4999875d`。紧急可在该服务 Deployments 对该基线成功版本执行 Rollback；正常可 revert 本版聚焦PR后走 main 部署。不 reset、不清库、不改密钥或免费额度停止开关。新候选文件为24h临时数据，账号/成员正常删除会清理，不要求数据库迁移。ASR/TTS仍未接通。

本报告逐项核对 `ai-business-integration.md` 原 20 项编号（不是补造新 20 项）。最初百炼接入基线为 `ed0d7dcb63664eefc71536a19b2c32fa2225e07d`；2026-10-03 质量修复基线为远端 `production/main` 的 `effbfb0bc62602aa7da607032df7501e1ad7e0b0`，包含已发布的百炼与账号隔离补丁。保留现有分支及提交，没有合入未知功能分支。当前用户明确授权 **Production 主环境，不使用 Staging**。

历史真实响应 **3 次**（bailian / qwen3.7-plus）：初轮文字分类/日期质量未达标、图片HTTP200但应用 `AI_OUTPUT_INVALID`（共2次）；随后文字复验1次，`422 / AI_EVIDENCE_MISMATCH`。当前持续业务任务新增 **3 次供应商出站尝试/12次预算**：1次获真实结构化响应但journal业务映射失败，2次ETIMEDOUT未获供应商HTTP响应；保守全部计入预算，自动重试0，按持续网络故障停止条件不继续消耗剩余9次。真实文字保存、图片全链路、摘要和AI导出尚未通过。Production密钥、Base URL、模型与消费限制原值保留。

状态定义：**已完成**=相应代码/文档已落实；**代码验证通过**=本地替身/回归通过，不能代表真实调用；**真实调用验证通过**=收到百炼真实响应并核对供应商与诊断；**主环境验证通过**=已发布版本的实际隔离账号业务验收通过。未达到后两种状态不得称 AI 全部接通。

## 1. 原 20 项追踪表

所有百炼模型项：本地采用替身验证；真实验收状态逐项如下，不将收到 HTTP 200 等同业务通过。用户已确认有可用额度，工具未读取阿里云私有余额/限额。确定性项不新增模型调用。ASR/TTS 单列，不用文字模型伪装实现。

| 原编号 | 功能与已有入口 | 实际 Provider / OpenAI 专属依赖 | 本次适配及验证范围 | 当前限制 / 尚需配置 |
| --- | --- | --- | --- | --- |
| 01 | 健康随记→就诊情况单→病情摘要、重生成、版本与导出 | Production Bailian Chat；保留 OpenAI Responses 与本地事实 | 共用原摘要提示词、来源/不确定性校验和保存事务；百炼显示/文本/离线 HTML；失败保留旧版 | 配置已保存；真实摘要、AI 文本/HTML 导出未执行；本地导出已通过 |
| 03 | 情况单可编辑复制给 AI 的问诊提示词 | 本地确定性模板，无专属接口 | 复用保存报告与复制机制，零新增模型调用 | 外部医生/其他 AI 的回答不属于本项目接入结果 |
| 04 | 草稿时间解析、病程整理 | 字段抽取百炼；TimeResolver 本地规则 | 修复原文明确日期被遗漏；参考日期/用户时区、日级精度和来源保留，冲突拒绝保存 | 历史真实“今天”未提取；离线修复通过，真实复验待执行；不以保存时间代替发病时间 |
| 05 | 健康随记“智能记录”文字草稿 | Production Bailian Chat，OpenAI 保留 | 严格 schema；确认保存、失败原稿保留；新增固定合成取证/回放和具体拒绝规则，未放宽校验 | 修复后真实文字422/source_validation未过，items/引文未保留；本轮只补取证，不能声称已修复真实失败 |
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

最新来源取证轮：相关综合回归 **200/200 PASS**（含新增合成回放13项）、TypeScript/build/guards/diff check PASS；HTTP与iPhone SE替身E2E **10/10 PASS**。客户端、parser统计及全量服务端未重复运行，沿用下述历史结果，不冒称本轮重跑。真实模型请求0，真实响应回放0；7个人工对照不代表原模型输出，判定结果与改前完全一致，只新增诊断路径/规则。当前诊断发布基线为856e73822d66dcfad5b9dade7fd4e1f379f8a485，生产配置不变；可正常revert本轮聚焦诊断提交，或从该基线干净worktree恢复代码，无数据迁移。

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

### 7.2 cdcd3b13 来源校验取证（不是已修复声明）

请求`cdcd3b13-0461-95f0-8dbb-141a58f6470a`：bailian/qwen3.7-plus，502输入/173输出Token。供应商结构化返回通过，应用422/AI_EVIDENCE_MISMATCH，旧诊断source_validation → /items → source_mismatch。合成输入“今天没有呕吐，只是恶心”可从验收脚本恢复；具体items、value、quote、来源映射、完整响应、错误message与精确referenceNow未保留。失败草稿items=0、原稿保留，随后通过已有API清理。因此不能指出原请求失败item或在模型错误、提示词、引用映射、误拒绝之间作唯一归因。

人工对照（不是原响应回放）：

| 对照 | 引文/字段 | 原判定 | 新诊断，判定不变 |
| --- | --- | --- | --- |
| 正确引用 | 否定字段value/quote=没有呕吐；阳性字段value/quote=恶心 | 通过，呕吐保持否定，恶心阳性 | 通过 |
| 整段引用范围 | item1/field0：value=恶心，quote=今天没有呕吐，只是恶心；另有否定字段 | /items拒绝 | /items/1/fields/0，negation_scope；可复现的整句否定误拒绝候选，未认定是原请求原因，本轮未修判定 |
| 错引文 | value=呕吐，quote=今天呕吐（原文不存在） | 拒绝 | /items/1/fields/0，quote_not_in_source |
| 删除字段否定 | value=呕吐，quote=没有呕吐 | /items拒绝 | /items/0/fields/0，negation_scope |
| 裁去引用否定 | value/quote=呕吐，前文为没有 | /items拒绝 | /items/0/fields/0，negation_prefix |
| 遗漏否定事实 | 仅value/quote=恶心 | /items拒绝 | /items，negated_fact_coverage，sourceIndex/factIndex/page；不存在被遗漏的item，不编造item索引 |
| 新增模型事实 | value=发热，quote为完整原话 | 拒绝 | /items/2/fields/0，value_not_in_quote |

**取证安全契约**：只有已通过现有accountId/memberId权限验证的请求，显式设置`syntheticReplay=negation-nausea-v1`，且原文逐字等于上面的固定合成句、task=record、无附件/已有草稿ID、timezone=Asia/Shanghai、实际发送的existingContext为空，才允许捕获。其他原文/上下文在模型调用前拒绝；普通请求不附回放。只在成功响应的syntheticReplay或失败响应的error.syntheticReplay返回该固定任务的结构化模型输出、来源、参考日期/时区、requestId及hash；不记录到console或服务端草稿/正式用户数据，不返回headers、密钥、账户/成员ID或完整HTTP响应。模型仍真实调用原Provider，捕获不影响校验判定，没有生产测试替身。schema和24KB限制/疑似凭据过滤也应用于捕获；来源校验失败仍不能保存。

`scripts/replay-ai-synthetic.mjs <capture.json>`只读取64KB以内合成包并离线重跑原来源/否定/时间链路，校验输入白名单和hash，不调用网络；原模型body没有保留时不得制造该requestId对应的“原响应fixture”。`scripts/ai-synthetic-demos.mjs`生成7个人工对照到忽略的outputs目录，与实际捕获明确标记区分。

**下一轮最小取证预算1次**：`scripts/capture-production-ai-synthetic.mjs`有显式ONE_CALL_AUTHORIZED门槛，复用隔离验收会话，在新虚构成员用手机UI提交固定合成句并开启上述诊断。无论成功/失败，取得这一次响应即停止，不保存正式记录、不执行图片/摘要，重试0。合成结构化包保存在忽略的`outputs/bailian-ai/synthetic-capture/captured-response.json`，随后可离线找出具体item/quote/value再修校验；模型请求ID须与安全provider日志相互核对。脚本准备完成但本轮未执行；不沿用旧4次脚本继续探测，不改密钥/消费设置。

## 8. 既有 5 项 high 审计（单独后续任务，不运行 audit fix）

### 2026-10-03 持续业务验收授权（覆盖前文单次/首败即结束约束）

新增供应商HTTP请求总预算12、自动重试0、最多3轮修复发布。先文字取证/确认保存，再固定哈希合成PNG的OCR/抽取/确认保存，再同一虚构成员摘要/文本与HTML导出；业务校验失败留证据、离线修复后继续，鉴权/额度/权限或持续网络故障停止外部调用。本任务不扩展ASR/TTS。

第一请求（本任务1/12）：HTTP400/INVALID_JOURNAL_SYMPTOM，旧捕获只在error.validation存在时附输出，导致journal映射错误未捕获，不据此猜事实根因。补齐所有业务错误的固定合成包出口、离线journal映射回放，以及仅固定PNG SHA256可启用的OCR/抽取阶段证据：进程内Symbol能力、不进入请求body/日志、24KB/疑似凭据过滤、成员权限和空existingContext检查。普通请求无原文日志或回放，校验判断不放宽。详细本任务预算与实际结果持续保存在忽略的outputs/bailian-ai/continuous-acceptance。

第1次标识`0c492e63-ef80-9c2d-a9fc-0557565b9e34`，502输入/115输出Token；第2、3次间隔人工复验均AI_NETWORK_ERROR/ETIMEDOUT，没有供应商HTTP响应、标识或Token数据，不能猜DNS/TCP/TLS子阶段或认定额度问题。第3次后停止所有模型请求，失败原稿保留，无错误结果自动保存。图片、摘要未发请求。首个真实结构化输出仍缺失，不称已修复真实journal或旧cdcd3b13错误。

当前离线综合206/206、客户端549/549、Bailian替身E2E10/10、typecheck/build/guards PASS；人工stage回放覆盖OCR JSON/schema、抽取引用/否定、新增事实、journal映射失败及来源不一致拒绝，所有均人工fixture不是原响应。阶段CLI `node scripts/replay-ai-business-stages.mjs <artifact.json>`重跑OCR→抽取→来源→领域/journal；原文不打印，0网络。已有单阶段CLI继续保留。

手机入口：健康随记 `/health-events` →“智能记录”（文字输入或上传资料，生成后必须点击核对保存）；病情数据 `/visit-summary` →“生成 AI 病情摘要”→“导出情况单”→文本/完整离线HTML。当前AI真实业务阻塞，不建议将入口存在视为功能验收通过；普通手动记录/本地事实整理/导出继续可用。ASR/TTS未配置，不能用文字模型替代。

本任务发布前生产基线914411544073e8f0baf5c12cafad601a355e6c8d；第1轮取证发布main=3b062902dfa5da96abd7edea862aa585069337e0。无数据库或消费配置变更。需回滚时对本任务聚焦PR逐个逆序正常revert合入main/Production，不reset、不改密钥/变量、不清库。现有源/否定/日精度规则没有放宽。解除真实阻塞仅需恢复Railway Production后端到已配置北京百炼兼容域名的出站HTTPS；桌面代理切换不能证明服务端恢复。不要重新输入密钥或充值。

本轮 npm audit 仍为 5 high、0 critical。13 个新增包来自锁定的 PDF.js/Canvas 平台依赖及 Ajv 的直接声明；**既有包版本未升级**。

| 依赖 | 影响 | 后续建议 |
| --- | --- | --- |
| `@playwright/test 1.55.0` | 继承 playwright 浏览器下载证书认证问题，主要测试/CI 安装链 | 与 playwright 同步升级至 >=1.55.1，经移动/媒体 E2E 验证；本次使用已有 Chrome，不下载浏览器 |
| `playwright 1.55.0` | 下载/安装浏览器时不能可靠验证 SSL 证书，[公告](https://github.com/advisories/GHSA-7mvr-c777-76hp) | >=1.55.1；不能用关闭 TLS 来规避 |
| `brace-expansion 2.1.4 / 5.0.9` | 恶意嵌套大括号触发递归/CPU DoS，[公告](https://github.com/advisories/GHSA-qhr7-859c-m2p7) | 相关上游升级，2.x>=2.1.7 / 5.x>=5.0.12 后复测构建/文件匹配 |
| `fast-uri 3.1.5` | URI 主机混淆/SSRF 等，[公告](https://github.com/advisories/GHSA-f65p-4m7j-42xc)；Ajv 本轮成为运行依赖，所以此传递依赖也进入后端 | >=3.1.8 后独立回归 Ajv/构建；本代码只编译服务端固定 schema，不接收用户 schema/外部 `$ref`，实际 AI Host 用 WHATWG URL 固定北京白名单，不由 fast-uri 决定路由 |
| `nanoid 3.3.16` | custom generator size=0 可能无限循环，[公告](https://github.com/advisories/GHSA-2v37-7h3g-55p8) | >=3.3.18，复测 PWA/构建；业务 ID 仍用 node randomUUID |
