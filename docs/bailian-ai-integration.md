# Hoooho 百炼接入追踪与主环境验收

本报告逐项核对 `ai-business-integration.md` 原 20 项编号（不是补造新 20 项）。发布基线：远端 `production/main` 的 `ed0d7dcb63664eefc71536a19b2c32fa2225e07d`，包含上一轮 AI 业务提交。工作分支从该基线创建，没有合入未知功能分支。当前用户明确授权 **Production 主环境，不使用 Staging**。

状态定义：**已完成**=相应代码/文档已落实；**代码验证通过**=本地替身/回归通过，不能代表真实调用；**真实调用验证通过**=收到百炼真实响应并核对供应商与诊断；**主环境验证通过**=已发布版本的实际隔离账号业务验收通过。未达到后两种状态不得称 AI 全部接通。

## 1. 原 20 项追踪表

所有百炼模型项：本地采用替身验证；真实调用和主环境模型验收均待新配置及当前免费额度确认。确定性项不新增模型调用。ASR/TTS 单列，不用文字模型伪装实现。

| 原编号 | 功能与已有入口 | 实际 Provider / OpenAI 专属依赖 | 本次适配及验证范围 | 当前限制 / 尚需配置 |
| --- | --- | --- | --- | --- |
| 01 | 健康随记→就诊情况单→病情摘要、重生成、版本与导出 | OpenAI Responses → 可切 Bailian Chat；本地事实独立 | 共用原摘要提示词、来源/不确定性校验和保存事务；百炼显示/文本/离线 HTML；失败保留旧版 | 百炼新密钥、兼容 Base URL；真实/主环境摘要待验 |
| 03 | 情况单可编辑复制给 AI 的问诊提示词 | 本地确定性模板，无专属接口 | 复用保存报告与复制机制，零新增模型调用 | 外部医生/其他 AI 的回答不属于本项目接入结果 |
| 04 | 草稿时间解析、病程整理 | 字段抽取可百炼；TimeResolver 本地规则 | 原始时间、未知精度、时区、来源与过去时间约束回归 | 不以创建/上传时间补成发病时间 |
| 05 | 健康随记“智能记录”文字草稿 | OpenAI Responses → Bailian Chat | 严格 schema；确认后保存、编辑、失败原稿保留 | 百炼配置与真实文字验收待完成 |
| 06 | 智能记录录音→文字 | 独立 OpenAI `/audio/transcriptions` | 保留现有 ASR；百炼模式默认 none，不使用旧 OpenAI 密钥 | 百炼 ASR **未接通**；qwen3.7-plus 无此能力，需另确认 ASR 供应商/模型/接口/权限 |
| 07 | 草稿补充问题和跳过 | 百炼抽取 + 本地最多 3 个必要问题规则 | 原有多轮编辑/历史及跳过保留，不新增问答聊天系统 | 百炼配置；问题不是诊断建议 |
| 08 | 多事项分类、一次确认保存 | 百炼抽取 + 本地枚举/事务 | 严格结构、引用、幂等与重复提交、全量回滚 | 限 30 项，不静默漏存 |
| 10 | 睡眠、排便、户外等表单预填 | 百炼提取；时长等后台确定性计算 | 原 journal 结构复用，不把统计改由模型生成 | 缺失字段保持未知 |
| 11 | 图片、单页/多页 PDF 资料识别 | OpenAI input_file/input_image → 百炼图片输入 | PDF 在后端逐页转 PNG，保留原文件/页码/hash；逐页 OCR 再抽取；缺页/冲突待确认 | 12 文件/12 页/15 MB；真实图片待验；复杂 PDF 仍需人工核对，不公开原件 |
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

## 4. 免费额度与一次性用户确认

已连接工具没有读取阿里云当前私有免费额度与停止开关的能力；未声称已检查余额或额度。配置后真实调用前，请用户一次性确认：

1. 在上述 Railway Production 后端 Variables 填入新 key、自己的兼容 Base URL 与表中供应商/两种模型值，Apply Changes；不要把 key 发回聊天。
2. 访问[北京免费额度页](https://bailian.console.aliyun.com/cn-beijing/costing-balance/free-quota)，刷新，搜索 **qwen3.7-plus**：核对模型 Code、剩余 Token、到期时间、状态、**免费额度用完即停仍为已开启**。只需告知余量/有效期/已开启，截图必须遮住凭据。不以旧截图推断仍有 100 万。
3. 在[北京模型广场](https://bailian.console.aliyun.com/cn-beijing/model/market)确认当前业务空间有该模型访问权限。专门的验收账号仅创建虚构家庭成员/记录，不上传真实儿童资料。

**50 元余额不是消费硬上限**。免费额度即停可防继续按量调用，但会让生产 AI 在额度耗尽/过期后中断；普通记录、本地整理、导出仍可用。预算预警只通知，不能等同停止。不会为绕过停止开关自动切模型、切供应商、充值或提高消费限额。阿里云说明开关同步存在延迟，须确认已生效后再验收。[官方规则](https://help.aliyun.com/zh/model-studio/new-free-quota)

## 5. 主环境验收（真实调用预算最多 4 次，首个失败即停）

部署 adapter 本身不发送模型请求。待用户完成配置/免费额度确认后再执行，每次没有自动重试：

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
- 发布前生产：Deployment `08ee5fc1-e63e-4384-80fa-4a330d6eea35`，SUCCESS，提交 `ed0d7dcb63664eefc71536a19b2c32fa2225e07d`。本次无数据库迁移，无生产数据覆盖/清库。
- 本地检查→secret/front/history 检查→聚焦 commit→push `codex/bailian-ai-20261002`→正常 PR 合入远端 main→Railway main 触发 Production→核对 deployed commit/SUCCESS/health/页面和资源。不 force push，不混入未知分支。缺 key 时只部署 adapter，保持原供应商配置，不自动启用百炼或调用旧模型。
- 配置/模型故障但手动流程健康：可把 `AI_PROVIDER=local` Apply Changes 重新部署，只停外部 AI，不改数据；保留新密钥变量，不复制回聊天。
- 应用回归：立即停止调用，优先 Railway 在上述旧 SUCCESS Deployment 的菜单执行 **Rollback**。若 CLI 只有 redeploy-latest，不把它误称旧版回滚：创建独立 worktree `git worktree add --detach D:/projects/hoooho/.worktrees/bailian-rollback-ed0d7dcb ed0d7dcb63664eefc71536a19b2c32fa2225e07d`，从该路径执行 `railway up --project d8855fe3-c785-4b8c-825b-bdb10a941850 --service aa308ba0-d7da-4771-9c94-ccdcd110f636 --environment production --detach --message rollback-to-ed0d7dcb`，确认 SUCCESS/旧 commit/health。不删卷，不 reset main。随后通过正常 revert PR 保持 main 与回滚产物一致。

## 7. 验证记录

已通过：百炼专项 10/10；AI/业务/附件/摘要相关领域综合 **119/119**（包含百炼专项）；客户端 **549/549**；百炼手机 E2E **8/8**（后端 mock，仅表示代码验证）；原 OpenAI 手机业务 **9/9**（含独立语音链路）、摘要 **1/1**；TypeScript PASS；生产 build 与已有 viewport/auth/install-assets guards PASS；LocalFactProvider 30/30、匹配 48/48，无 parser 变更。后续部署证据补入发布记录，不将本地截图当生产模型成功。

全量服务端：198/199；既有 `ops-service.test.mjs` 固定 2026-09-02 样例在当前时间超过 30 天，`history()` 按真实现在保留期清除失败快照，测试还期待失败快照首位。main 中该服务/测试与本次零差异，原 AI 工作树亦独立复现 10/11。此项不是 AI 回归，未删除/跳过/弱化测试，未夹带 Operations 修复；完整服务器检查如实标 FAIL（已知基线问题）。无独立 lint 命令，N/A（项目未提供）；不是假称 lint PASS。

## 8. 既有 5 项 high 审计（单独后续任务，不运行 audit fix）

本轮 npm audit 仍为 5 high、0 critical。13 个新增包来自锁定的 PDF.js/Canvas 平台依赖及 Ajv 的直接声明；**既有包版本未升级**。

| 依赖 | 影响 | 后续建议 |
| --- | --- | --- |
| `@playwright/test 1.55.0` | 继承 playwright 浏览器下载证书认证问题，主要测试/CI 安装链 | 与 playwright 同步升级至 >=1.55.1，经移动/媒体 E2E 验证；本次使用已有 Chrome，不下载浏览器 |
| `playwright 1.55.0` | 下载/安装浏览器时不能可靠验证 SSL 证书，[公告](https://github.com/advisories/GHSA-7mvr-c777-76hp) | >=1.55.1；不能用关闭 TLS 来规避 |
| `brace-expansion 2.1.4 / 5.0.9` | 恶意嵌套大括号触发递归/CPU DoS，[公告](https://github.com/advisories/GHSA-qhr7-859c-m2p7) | 相关上游升级，2.x>=2.1.7 / 5.x>=5.0.12 后复测构建/文件匹配 |
| `fast-uri 3.1.5` | URI 主机混淆/SSRF 等，[公告](https://github.com/advisories/GHSA-f65p-4m7j-42xc)；Ajv 本轮成为运行依赖，所以此传递依赖也进入后端 | >=3.1.8 后独立回归 Ajv/构建；本代码只编译服务端固定 schema，不接收用户 schema/外部 `$ref`，实际 AI Host 用 WHATWG URL 固定北京白名单，不由 fast-uri 决定路由 |
| `nanoid 3.3.16` | custom generator size=0 可能无限循环，[公告](https://github.com/advisories/GHSA-2v37-7h3g-55p8) | >=3.3.18，复测 PWA/构建；业务 ID 仍用 node randomUUID |
