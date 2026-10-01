# Hoooho AI 业务接入交付报告

日期：2026-10-01。分支：`codex/ai-medical-summary`；保留 `4d83c368` 和之前的摘要、安全诊断、成员就诊闭环提交。

状态：本次全部 20 项的开发代码与隔离测试替身验收已交付；真实 OpenAI 模型验收仍待账户问题确认。此报告不将测试替身称为真实 AI 通过。不合并 main，不部署 Staging / Production，不充值、不更改消费限额。

## 1. 全范围追踪表

表内“待验证”指实际 OpenAI 账户与模型调用，不代表业务链路停止。“规则”不依赖模型。所有图片均来自隔离、虚构家庭成员的手机浏览器测试，非真实患者数据。公共失败、取消和保存规则见第 2 节；每项另外列出特有边界。

| 项目 / 原有能力映射 | 实际入口与已实现能力 | 数据、保存与来源 | 成功 / 失败 / 取消 | 自动验证 | 真实 API | 手机证据 | 具体限制 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 01 就诊摘要：已有，增强 | 健康随记 → 就诊情况单；围绕主诉及明确关联筛选症状、处理、就医与检查，更新版本、来源标记、文本/HTML/打印导出 | 服务端仅当前账号成员；主诉相关来源、资料截至、重点逐条引文；继承现有快照与导出 | 成功展示新版本；失败保留旧版；资料变化标记旧版；不完整结果不保存 | 摘要/来源 44 项、摘要手机 1 项；多日期、删除、否定、重生成及导出 | 待验证 | [摘要](ai-business/screenshots/iphone-se-ai-success.png)、[失败](ai-business/screenshots/iphone-se-ai-failure.png)、[导出](ai-business/screenshots/iphone-se-export.png) | 不能以确定性守卫证明任何真实模型输出绝无遗漏；未进行真实医学资料质量评估 |
| 03 问诊提示词：已有入口，增强 | 就医准备 → 复制问诊提示词；可编辑，含主诉、相关背景、时间线、来源、未知/冲突及问题；外部科室/原因问题只在提示词中 | 使用当前就诊情况单已确认内容；不发送家庭全量资料，不另存诊断 | 复制成功反馈；剪贴板拒绝提供完整手动复制；关闭不写记录 | 客户端 helper、手机模板/复制失败测试 | 规则，无需 API | [问诊准备](ai-business/screenshots/iphone-se-consultation.png) | 外部 AI/医生回答不在本产品接入范围 |
| 04 时间线：已有，增强 | 健康随记和就诊情况单；发生/录入时间分开，相对日期固定在输入参考时间，未知单独展示 | 复用 TimeResolver、既有 record/event；区间结束及原话存 provenance，不借创建时间伪称发生日期 | 时间有效进入现有排序；含糊保留未知；取消无新增 | 时间单测、业务时间/跨日/异日合并、摘要来源测试 | 时间计算规则；提取待验证 | [记录](ai-business/screenshots/iphone-se-saved.png)、[搜索](ai-business/screenshots/iphone-se-search.png) | 旧记录必需日期字段使用参考时刻作为存储兼容值，但明确 unknown，不展示为临床发生时间 |
| 05 自由描述：新增共享编排，复用记录入口 | 记一下 → 说一说 / 上传资料整理；原文到可编辑草稿，再保存到实际记录 | 同一个成员级草稿，字段原文/来源/编辑者；调用既有保存服务 | 已核对一次保存；失败原文和上一版留存，重试不重写；取消删除临时草稿 | 业务31、手机文字成功/429/重试/撤销 | 待验证 | [草稿](ai-business/screenshots/iphone-se-draft.png)、[保存](ai-business/screenshots/iphone-se-saved.png) | 原文15,000字符；未知字段不补默认事实 |
| 06 单次语音：增强为真实音频适配 | 同一整理入口 / 快速语音；主动开始、停止，实际 MediaRecorder 音频发服务端 ASR | 音频二进制带真实格式扩展名；转写进入相同草稿；音频仅请求内存，不默认永久存储 | 权限拒绝、静音、录音中断提示；取消不转写/保存；可转文字修正 | ASR3项、Chrome真实音频采集+替身ASR、拒绝/静音手机测试 | ASR待验证，非浏览器识别冒充 | [语音](ai-business/screenshots/iphone-se-voice.png)、[取消](ai-business/screenshots/iphone-se-cancelled.png) | 单轮90秒/15MB；WebAudio不可用时由空转写守卫兜底；真实手机麦克风和Safari待人工验收 |
| 07 必要补充：新增共享机制 | 草稿内最多3个必要短问题；同份草稿补充，可不知道/跳过/直接保存 | 已有相关上下文仅辅助理解，不变新记录证据；已问与跳过问题记入草稿 | 回答更新同一版本；失败保留；跳过不循环；已可保存不强制问答 | 业务跳过/历史问题/版本测试 | 提取待验证，问题选择规则 | [草稿](ai-business/screenshots/iphone-se-draft.png) | 总问题上限3；不能保证模型理解所有口语 |
| 08 分类拆分：新增编排，复用真实枚举 | 同一草稿显示多事项，可调类型/移除，批量保存 | 只允许现有 record category；原时间、主体、字段来源；账号事务写入多记录/关联事件 | 一次确认事务保存；中途失败全部回滚；幂等重试；取消不写入 | 业务分类/多事项/回滚/并发/身份校验 | 待验证 | [预览](ai-business/screenshots/iphone-se-draft.png)、[保存](ai-business/screenshots/iphone-se-saved.png) | 最多29事项；达到结构上限保守拒绝而不保存可能截断结果 |
| 10 睡眠/排便/运动：已有表单，增强预填 | 记一下整理单事项 → 现有睡眠、排便、运动表单 | 原文与人工确认内容一起保存；睡眠程序算时长；排便真实枚举；运动精确分钟不猜强度 | 进入原表单继续修改；人工已填不被旧AI覆盖；普通手动录入不受AI影响 | 业务结构、客户端表单/分钟/排便contract回归 | 提取待验证，计算规则 | [共享入口](ai-business/screenshots/iphone-se-draft.png) | 原表单无排便次数字段，次数保留来源字段；图片/PDF草稿经共享保存以保留附件，不走无附件的表单预填 |
| 11 检查识别：已有上传，新增结构化全页能力 | 整理入口 / 既有上传；图片、多页PDF，逐页OCR、字段核对与局部重识别 | 真实PDF拆页，所有页视觉输入；机构/日期/项目/结果/单位/范围/原标记引用具体页、原文字段及字符位置；存实际 examination 与原件 | 完整且字段数值覆盖才保存；缺页须明确按不完整材料保存；取消不写；局部失败保留输入 | PDF/真图解码/模糊与不同单位/数字守卫，手机两页及局部重跑/原件权限 | Vision待验证 | [PDF](ai-business/screenshots/iphone-se-pdf.png)、[原件](ai-business/screenshots/iphone-se-original.png) | 12文件/12页/15MB，合计OCR60,000字符；无印刷页码不能保证材料齐全；页级而非图像框坐标定位；数字行守卫非通用语义遗漏检测 |
| 12 就医识别：已有记录入口，增强上传 | 现有就医记录 → 上传整理；日期、机构、科室、主诉、已记录诊断/疑似/排除/处置/复诊原文 | 复用就医 record；多个日期不合并；原单位和附件留存；不创建提醒或医嘱任务 | 正常确认保存；读取不明留空；失败手动表单仍用；取消不写 | 结构/否定/归档守卫、共同文档与保存服务测试 | 待验证 | [共用文档流程](ai-business/screenshots/iphone-se-pdf.png) | 共用文档手机证据，不声称完成真实病历版式验收 |
| 13 历史归档：已有栏目，新增适配 | 过敏史 → 上传旧资料 / 共享archive任务 | 过敏、既往病史、长期药、手术、检查适配已有栏目；未匹配栏目只保存真实历史记录，原件关联 | 预览后沿用保存；不明不新增确诊；失败保留；取消不写 | archive适配、未知历史、生命周期和事务测试 | 待验证 | [过敏史](ai-business/screenshots/iphone-se-insights.png)、[原件](ai-business/screenshots/iphone-se-original.png) | 未明确的泛化历史不强行映射住院/慢病；原档案需要的额外字段仍手动完善 |
| 14 去重合并：新增安全执行规则 | 共享保存自动执行，无逐条强制选择框 | 确定性指纹/同日期同机构同报告互补；冲突同事项并列，保留来源、旧值；不同日期/剂量/结果不删除 | 去重与补齐真实保存；冲突提示差异而不选真值；一次撤销保护后续人工修改 | 完全重复/互补/冲突/异日/不同成员/撤销/回滚 | 规则，无需额外模型 | [保存与撤销](ai-business/screenshots/iphone-se-saved.png)、[原件](ai-business/screenshots/iphone-se-original.png) | 不明确匹配保留不同事项；撤销窗口受草稿24小时保留期限制，之后历史/原件仍在；后续编辑导致撤销拒绝以免丢数据 |
| 15 过敏提取：已有维度，新增原文适配 | 过敏史 / 共享整理；食物、表现、时间、处理、状态与来源 | 检测阳性归待排查，不等同确诊/新增忌口；疑似、阴性、排除、耐受分开；已确认状态保留 | 随实际记录确认进入既有档案；无明确过敏原保留未知；失败手动仍可用 | 状态/否定/阳性/合并/原文来源回归 | 待验证 | [过敏证据](ai-business/screenshots/iphone-se-insights.png) | 不推断临床确诊；未知食物不自动扩大范围 |
| 16 食物时间关联：新增规则整理 | 原过敏史页 → 摄入与反应依据 | 仅当前成员实际饮食/症状/处理；4小时观察窗口或显式关联，保留同时食物、无反应和缺失记录 | 展示记录引用；无资料说明为空；读取失败不显示假零；无写操作 | 混合/无反应/时间关联与手机真实列表 | 规则，无需 API | [关联](ai-business/screenshots/iphone-se-insights.png) | 时间关系不是因果/概率；4小时仅产品检索窗口，不是医学诊断阈值；不建议自行复试 |
| 17 ABC输入：原页面，增强有据输入 | 原过敏史页 → ABC输入依据 | A实际表现/医生原分级；B同一次反应处理；C明确诱发量；来源、食物、时间、缺失项；不以维持药/耐受量代替 | 有据输入正常展示，未知为null，评分未伪造；页面不整页停用，无写诊断 | 混合食物/未知剂量/日常药/耐受排除单测和手机 | 规则；评分定义待提供 | [ABC依据](ai-business/screenshots/iphone-se-insights.png) | 缺完整ABC到百分比规则，详见第7节；不标称WAO官方指数 |
| 22 排敏执行摘要：已有结果区，增强事实摘要 | 护士站 → 现有排敏测试详情/结果 | 原方案与实际记录分开；有效、草稿、撤销执行分开；原量单位/时间/观察/处理 | 就地查看，未知不当无反应；失败不更改方案；无生成写操作 | 客户端摘要helper、手机已有计划与执行记录 | 规则，无需 API | [排敏摘要](ai-business/screenshots/iphone-se-desensitization.png) | 不决定加量、继续或安全；未执行不是执行结果 |
| 24 自然搜索：已有搜索，增强规则解析 | 健康随记 → 搜索 | 当前成员实际records，别名、上月/最近范围、类型、否定排除、显式关联；真实标题/时间/匹配片段可打开 | 查询解释与结果分开；无结果明确；查询不写；切成员不复用结果 | 搜索语义/unknown时间客户端回归和手机 | 规则，无需 API | [搜索](ai-business/screenshots/iphone-se-search.png) | 有限词表/时间表达，不是任意语义向量搜索；无外部网页检索 |
| 30 对话语音：新增多轮，复用草稿/保存 | 主动勾选对话式记录；逐轮开始停止、改口、打断、文字接管、明确“保存” | API ASR→共享编排→API TTS；服务端绑定成员；真正保存后才返回已保存；朗读关键时间/量和必要问题 | 失败保留；TTS失败仍可文字；取消/换成员停止麦克风与迟到响应；保存失败不说成功 | Chrome音频采集3轮，纠正同草稿、真实业务保存后TTS、拒绝/静音/取消测试 | ASR/提取/TTS均待真实验证 | [对话](ai-business/screenshots/iphone-se-voice.png) | 非连续Realtime：选择分轮ASR+结构化编排+TTS便于复用权限与保存事务；真手机/Safari、真实模型听辨仍待验收 |
| 02 医生问题：已有能力，增强模板 | 就医准备 → 常用问题勾选/编辑 | 本次问题随既有情况单编辑保存；不读无关档案 | 勾选编辑及提示词同步；普通保存失败留输入；取消不改 | 模板helper和手机复制流程 | 规则，无需 API | [模板](ai-business/screenshots/iphone-se-consultation.png) | 模板非个体医疗建议，不自动诊断 |
| 18 忌口翻译：已有卡，有限增强 | 现有忌口出示卡 | 仅已确认食物/过敏原名称，可维护词表；默认中文+英文；人工译名同步保存并保留 | 正常显示对应名；未收录保留原文并可手工填写；不改忌口范围 | 客户端人工译名保留/词表、手机Milk卡 | 规则，无需 API | [双语卡](ai-business/screenshots/iphone-se-dietary.png) | 未收录/歧义名称需人工准确译名，不新增AI短句/判断 |

## 2. 共同数据与交互契约

- 身份来自现有服务端认证会话；每次工具执行重新验证账号/成员。模型不接收可执行的任意身份或数据库命令。附件读取重新验证所有权及删除状态。
- 文字、图片、单轮/多轮语音共用一份服务端草稿；模型只提供严格Schema内的候选结构。来源必须匹配原文页、原句和字段子串，再执行枚举、数字、单位、时间、否定/疑似和主体校验。确定日期、分钟和睡眠时长由程序处理。
- 模型拒绝、截断、无输出、解析失败、失真引用不能保存为有效结果。禁止缩短引文去掉紧邻否定前缀；摘要概览不能补造数值或反转否定。
- 用户可改字段/时间/类型、去掉某事项；字段标记用户编辑，重新识别按原文来源匹配保留。当前不允许把已有字段改成空字符串；不在允许字段表的新增项需改原文重新整理或进入原手动表单。
- 草稿加载与保存都有版本验证；相同并发请求共享一个调用，不同输入返回409，不重复计费。取消/切成员/关闭会中止请求、录音、定时器、播放，迟到响应不能写回新会话。
- 生成失败保留原文与上一版草稿/摘要；旧草稿可查看，但不能把失败中的旧版本直接标作新有效识别。手动记录、LocalFactProvider本地事实整理、查看和导出继续可用，明确区分“本地整理”和“AI生成”。
- 保存只由正常点击确认或明确语音保存执行，复用账号事务，记录、档案、事件和附件一起提交或回滚。模型不自己声明写入成功。取消不建正式数据。
- 临时草稿/文档存在服务端私有JsonStore，24小时到期，15分钟周期清理及每次读取清理；取消、账号/成员删除或合并同步处理。已保存附件转入既有附件存储，临时数据清理；删原记录使派生草稿失效。原始音频不默认落盘。
- 使用 `store:false`，但这不等于OpenAI所有基础设施零留存。普通日志只允许任务、耗时、用量、安全错误诊断，不记录病情文本/音频、密钥、Authorization或完整响应。

## 3. 架构与文件清单

`现有入口 → AIBusinessComposer → 已认证成员API → AIBusinessService → OCR/ASR/结构化提取 → 确定性校验 → 原保存事务 → 原页面/来源/情况单/导出`。

新增：

- `server/ai/business/{service,contract,model,documents,archive,insights}.mjs`：共享编排、草稿、文档全页、归档/合并、事实关联。
- `server/ai/business/{service,contract,documents,adversarial}.test.mjs`；`server/visit-sheets/visit-ai-summary.test.mjs`。
- `src/features/ai-business/{AIBusinessComposer,HealthInsights,RecordOriginals}.tsx`、`aiBusiness.css`、`consultationPrompt.ts`、`desensitizationSummary.ts`、`businessHelpers.test.ts`。
- `shared/ai-business-field-labels.json`：客户端与保存内容共用中文字段标签。
- `tests/ai-business/{business.spec.ts,playwright.config.ts}`：隔离手机业务验收；使用已安装Chrome，不下载浏览器。
- `scripts/{check-ai-runtime-config,ai-runtime-config-check-preload,check-ai-secret-boundary}.mjs`：安全配置启动核对、阻止对外模型请求、密钥边界检查。
- 本报告及16张手机证据；固定测试报告更新。

修改：

- 接口/生命周期：`server/app.mjs`、`server/account/account-data-service.mjs`、`server/members/family-member-service.mjs`、`server/events/event-attachment-service.mjs`。
- Provider/语音：`server/ai/providers/{openai-provider,local-fact-provider}.mjs`及对应tests、`server/ai/audio-transcription-service.mjs`及test。
- 摘要/资料：`server/visit-sheets/{visit-ai-summary,v5-projection}.mjs`、`visit-sheet-service.test.mjs`、`src/types/{index,visitSheet}.ts`。
- 原页面：`src/pages/VisitSummary/{index,MedicalAISummary}.tsx`；`HealthEvents/{JournalRecorder,JournalRecordDetail,JournalSearchPage,BowelRecordFlow,OutdoorActivityRecordFlow,VisitRecordFlow}.tsx`及`timeViewModel.ts`/tests/排便contract；`HealthEventDetail/components/{QuickVoiceRecordFlow,SymptomRecordSheet}.tsx`；`HealthProfile/{AllergyProfilePage,HealthProfileSectionPage}.tsx`；`NurseStation/DesensitizationTaskSheet.tsx`；`DietaryCard/{index.tsx,dietaryCardModel.ts,dietaryCardModel.test.ts}`。
- 验收辅助：`tests/ai-medical-summary/medical-summary.spec.ts`、`tests/visit-sheet/serve.mjs`、本地评估/攻击性runner和固定报告。
- `server/ops/ops-service.test.mjs`仅修正固定9月1/2日fixture超出30天保留期的问题，改为当前/前一天，保留原断言，未修改Ops业务。
- `package.json`/lock：仅新增固定`pdf-lib@1.17.1`支持真正PDF拆页和两条可复跑业务测试命令；未自动升级已有依赖。

共享端点：`/api/members/:memberId/ai-drafts`、`/:id`、`/:id/save`、`/:id/undo`、`/:id/speech`、`/health-insights`，均走现有认证；ASR和附件复用既有接口。未新增独立聊天产品、底部导航、诊断/治疗、处方提醒、付费或动画功能。

## 4. 实际配置与调用边界

已经用当前 `.env.local` 启动实际服务，通过健康接口确认加载；启动诊断使用全新空临时数据目录，并强制禁止任何对外fetch。

| 项目 | 本次实际配置 / 行为 |
| --- | --- |
| 服务端密钥 | 存在；只在服务端安全配置，未输出值；`.env.local`被忽略且没有进入分支历史 |
| API endpoint | 官方 `https://api.openai.com/v1`，不关闭TLS验证 |
| 摘要 | `AI_MODEL=gpt-5-mini`；Responses严格结构化输出，输出动态3000–12000，不沿用800固定上限 |
| 草稿/视觉 | `AI_DRAFT_MODEL` / `AI_VISION_MODEL`可独立配置，当前回落到`gpt-5-mini`；Responses严格Schema；`AI_BUSINESS_MAX_OUTPUT_TOKENS`默认16000，可配置3000–32000；动态预算，60秒超时 |
| ASR | `ASR_MODEL=gpt-4o-mini-transcribe`；`/audio/transcriptions`，真实文件MIME及扩展名；默认每账号每小时60次，可用`AI_ASR_MAX_CALLS_PER_HOUR`调整；进程内计数，重启清零 |
| TTS | `AI_SPEECH_MODEL=gpt-4o-mini-tts`；`AI_SPEECH_VOICE`默认coral；`/audio/speech`，明确AI语音，30秒，600字符/2MB限制 |
| 草稿调用上限 | `AI_DRAFT_MAX_CALLS`默认14，2–100可配置；OCR+提取共享累计；TTS另有同数值的独立上限；ASR另有上述小时限制，不能把14说成全部接口的合计上限 |
| 文件/录音 | 12文件、12总页、单请求15MB；每轮录音90秒；不支持文件/真图解码失败拒绝；累计OCR60k字符拒绝而非截断 |
| 幂等/重试 | 输入指纹、缓存、版本、在途去重；自动重试0；页局部重识别只重OCR对应页再重结构化提取；新识别不能沿用旧缺页确认 |
| 项目/组织请求头 | 当前没有显式项目/组织设置；依赖所存项目密钥的归属。不能从“已加载密钥”推断具体项目正确 |

这些名称只在服务端配置/开发报告，产品不展示模型、Agent分工或token。模型实际访问权限与真实输出质量尚未验证。接口能力参考：[结构化输出](https://developers.openai.com/api/docs/guides/structured-outputs)、[PDF文件输入](https://developers.openai.com/api/docs/guides/file-inputs)、[语音转写](https://developers.openai.com/api/docs/guides/speech-to-text)、[语音生成](https://developers.openai.com/api/docs/guides/text-to-speech)。

## 5. 验收结果与准确率边界

| 检查 | 结果 | 范围 |
| --- | --- | --- |
| 客户端全量 | PASS 537/537 | 现有业务与新增helper、搜索、分钟、译名保留 |
| 服务端全量 | PASS 197/197，前置guest21/21 | 原数据/认证/记录/语音/Provider等回归 |
| 新业务单测 | PASS 31/31 | 身份、来源、时间、否定、文件、合并、事务、预算、取消与新缺页确认 |
| 摘要及来源 | PASS 44/44 | 主诉范围、引用、版本、删除、原件权限、旧结果保护和诊断 |
| 手机业务 | PASS 6/6 | 实际Chrome、音频采集、隔离服务保存、PDF两页、局部重跑、复制失败、关联搜索/双语卡；320/375/390无横向溢出 |
| 手机摘要 | PASS 1/1 | 本地→替身AI→新版本→429保留→恢复→文本/HTML导出内容与版本 |
| 冻结本地解析评估 | PASS 30/30 | 原事实匹配48/48、时间17/17、禁止事实15/15 |
| 固定攻击/变形集 | PASS 314/314 | 之前313/314；FUZZ-175的否定/疑似在非日期纠正时错误转阳性，已修复；未观察冻结集退化 |
| 类型/Build/资源 | PASS | TypeScript、Vite、冻结人体定位资源/头像、viewport、认证产物、PWA配置 |
| lint | N/A | 项目未提供lint命令；不伪报已运行 |
| Git diff/Secret | PASS | `.env.local`不跟踪、不在本分支祖先历史；实际密钥比对工作区、前端产物与历史均无命中；最终提交前再次执行 |

反映的是固定样例通过率与来源一致性，不是全体医学资料的Precision/Recall/F1。真实模型准确率、遗漏率、成本、token与延时：没有实测，不能用替身的10/20 token宣称真实用量。无法判断的信息保留未知；模型真实抽取的漏项仍需账户恢复后的代表性验收和用户核对。

测试替身请求量：文字成功+429+用户手动重试共3次模型替身调用，无自动重试；两页PDF先OCR2+提取1=3，单页重识别再2=累计5；语音3轮=3ASR+2提取+3TTS=8接口替身调用。规则模板/翻译/检索/事实关联为0。业务单测最终用时约0.75秒，摘要来源44项约0.97秒；手机场景约1.5–7秒，受本地浏览器/固定400ms替身延迟影响，不是线上API延时。

复跑：`npm run test:ai:business`；`npm run test:e2e:ai-business`；`npm run test:e2e:medical-summary`；`npm run test:client`；`npm run test:server`；`npm run build`。手机测试服务不加载正式用户数据，测试代码之外没有测试模式后门。所有展示截图使用独立后台iPhone SE上下文320×568、DPR2；未改变用户右侧固定预览。真实手机输入法、真实人声麦克风、Safari兼容仍待人工设备验收。

## 6. 429、插件能力与一次账户操作清单

现有网络/TLS和基础鉴权已通过，本次未重新诊断。旧429的具体code、body和headers已被旧异常适配路径丢弃，现有安全日志无法恢复；不是本次读取到了余额不足的证据。替身`insufficient_quota`只证明错误路径可工作，不代表上次真实失败原因。

当前安全错误链：Provider/ASR/业务适配 → `readOpenAIErrorDetails` → `MedicalSummaryError`安全诊断，提取HTTP状态、error.type/code、白名单脱敏message、x-request-id、Retry-After；不保留密钥、Authorization、病情输入或完整响应。非JSON/无合法headers明确留null，不猜测。分类：

| 安全code | 归类与唯一下一步 |
| --- | --- |
| rate_limit_exceeded / rate_limit_error / slow_down | 频率限制；按Retry-After等待并减少并发，不轮换密钥 |
| credit_balance_exhausted | API余额耗尽；用户在正确组织核对余额/付款，助手不充值 |
| project_spend_limit_exceeded | 项目硬消费控制；项目管理员核对该项目限制，不由助手提高 |
| organization_spend_limit_exceeded / organization_usage_limit_exceeded | 组织硬消费/用量控制；组织管理员核对实际额度，不自行提高 |
| insufficient_quota，缺更具体code | 仅quota_unknown；不能明确区分余额/项目/组织，不再猜测 |

已连接OpenAI Platform插件只提供目标列表、创建加密密钥、打开设置/控制台。读到了hoooho与Personal组织的Default项目候选；这不能确定本地已存密钥归属。插件没有余额、使用量、模型限额、组织/项目额度读取工具；这些信息没有被助手检查。

请一次完成以下核对并一次回复结果，只给名称、状态/数值，不给密钥、代理凭据或含秘密截图。无需重新建钥匙，不要求先充值或提高上限。

| 操作入口 | 需核对字段 |
| --- | --- |
| [API余额/账单](https://platform.openai.com/settings/organization/billing/overview) | 切换到**实际密钥所属组织**，确认API credit balance、credit是否有效/到期、计费状态；不是ChatGPT订阅额度 |
| [组织Limits](https://platform.openai.com/settings/organization/limits) | 组织名称、usage tier、当前月已用/可用的硬用量/消费控制，相关模型RPM/TPM；无该字段就说明未显示 |
| [Projects](https://platform.openai.com/settings/organization/projects) → 实际项目 → API Keys / Limits | 项目名称；按已建key名称核对项目归属与权限（不复制key值）；文本/vision/ASR/TTS模型是否可用，RPM/TPM及真正硬限制；预算报警单独记，不把soft budget当强制429 |
| [Usage](https://platform.openai.com/usage) | 选相同组织/项目及上次失败日期，核对使用量/花费与控制；页面是否提供失败明细，没有则不推断 |

项目预算通常是软报警而非自动拒绝，可参阅[项目管理说明](https://help.openai.com/en/articles/9186755-managing-projects-in-the-api-platform)。当前不能确认哪个组织/项目控制导致429，不改变付款设置。

本次真实模型调用：**0次**。账户明确恢复后，预告最多5次代表性调用：真实摘要1次、草稿提取1次、单页视觉1次、短音频ASR1次、短TTS1次，复用已有结果，不逐功能反复调用，不自动重试。任一步失败就停止，报告精确安全错误和唯一下一步；摘要真实验证最多1次。调用前再次报告预期数量，不以通过配置核对替代模型访问验收。

## 7. 一次需补齐的ABC业务定义

仓库没有完整ABC→百分比公式；已完成有据输入与缺失校验，不编造0、权重或WAO身份。请与账户结果一并提供此前确定的参考定义（若目前没有，直接说明尚未确定）：

1. A各表现/已记录分级对应的产品分档和取值。
2. B同一次反应各处理的分档/取值；多处理如何汇总。
3. C适用的剂量单位、是否按食物重量/蛋白量/体重归一及具体换算、分档阈值。
4. 简化版启用A/B/C哪些维度；未启用和未知输入的计算行为。
5. 百分比公式、权重、上下限、舍入方法及已确认参考样例。

这些定义缺失只阻塞“百分比计算”，不阻塞资料提取、来源查看、原记录、排敏摘要或本次其他已选业务。

## 8. 依赖审计：5个high，单独处理

本次只读审计，没有执行`npm audit fix`或升级上述依赖。仅为真PDF全页功能加入`pdf-lib`固定版本。下表描述审计风险，不声称每项均能从产品请求直接利用。

| 审计依赖 / 已安装版本 | 影响与实际链路 | 后续修复建议 |
| --- | --- | --- |
| @playwright/test 1.55.0 | 开发测试直接依赖；经playwright受浏览器下载安装TLS来源校验缺陷影响；本次使用已安装Chrome，不运行下载 | 单独升级配套Playwright工具到兼容的≥1.55.1安全版本，重跑手机验收 |
| playwright 1.55.0 | @playwright/test间接依赖，同一下载安装真实性风险，不应重复算成两个不同漏洞根因 | 与@playwright/test一起升级，核对下载验证与Chrome兼容 |
| brace-expansion 2.1.4 / 5.0.9 | workbox/ejs/jake/filelist/minimatch及glob链；构建/测试相关；恶意展开可CPU/栈DoS | 调整相容上游，使用修复的2.1.7+或5.0.12+；检查锁文件两条版本链，重跑构建 |
| fast-uri 3.1.5 | vite-plugin-pwa→workbox-build→ajv链；URI authority/IDN/IPv6/编码规范化风险，依使用方式可导致主机校验混淆/SSRF | 独立评估升级上游至含fast-uri3.1.8+；本项目未证明存在在线可利用路径，不盲目跨大版升级 |
| nanoid 3.3.16 | postcss8.5.25间接依赖；custom size为0可无限循环/DoS | 相容更新到3.3.18+并验证PostCSS/构建，不改业务ID机制 |

## 9. Git、安全与可查看交付

- [远端分支](https://github.com/Hoooho-app/hoooho.app/tree/codex/ai-medical-summary)。该分支不是正式main发布来源，没有触发任何人为部署操作。
- 已保留原有提交；聚焦提交包含本报告、代码、测试及虚构手机证据。精确提交链接在本次会话最终回复中。
- 提交前运行实际密钥的内存精确比对：工作区跟踪及非忽略新文件、dist前端文本产物、此分支全部祖先文本blob；输出仅安全计数，不打印密钥。`.env.local`在工作树/分支历史均不被跟踪。
- 未夹带本地数据、测试数据库、日志、音频、trace、构建dist或账户截图。报告手机PNG作为项目允许的Git交付材料，能在远端打开，不仅是本机路径。
- Merge：未执行（用户边界）。Staging/Production：未执行（用户边界）。真实AI：待账户恢复验证。

截图索引：[草稿](ai-business/screenshots/iphone-se-draft.png)、[失败](ai-business/screenshots/iphone-se-failure.png)、[保存](ai-business/screenshots/iphone-se-saved.png)、[语音](ai-business/screenshots/iphone-se-voice.png)、[PDF](ai-business/screenshots/iphone-se-pdf.png)、[原件](ai-business/screenshots/iphone-se-original.png)、[取消](ai-business/screenshots/iphone-se-cancelled.png)、[问诊准备](ai-business/screenshots/iphone-se-consultation.png)、[过敏/ABC](ai-business/screenshots/iphone-se-insights.png)、[搜索](ai-business/screenshots/iphone-se-search.png)、[排敏](ai-business/screenshots/iphone-se-desensitization.png)、[忌口卡](ai-business/screenshots/iphone-se-dietary.png)、[本地摘要](ai-business/screenshots/iphone-se-local.png)、[替身AI](ai-business/screenshots/iphone-se-ai-success.png)、[摘要失败](ai-business/screenshots/iphone-se-ai-failure.png)、[导出](ai-business/screenshots/iphone-se-export.png)。
