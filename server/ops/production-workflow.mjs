import { createAudioProvider, createAIProvider } from '../ai/providers/provider-factory.mjs'
import { createDialogueProvider } from '../ai/providers/dialogue-provider.mjs'
import { LiveAudioPreviewService } from '../ai/live-audio-preview.mjs'

const modelName = value => typeof value === 'string' && /^[a-z0-9][a-z0-9._:/-]{0,149}$/i.test(value) ? value : null
const providers = new Map([['bailian', '阿里云百炼'], ['bailian-asr', '阿里云百炼'], ['openai', 'OpenAI'], ['openrouter', 'OpenRouter']])
const snapshotDay = '2026-11-07'
const stage = (title, ...nodes) => ({ title, nodes })
const node = (title, term, state, detail, evidence, next = [], link) => ({ title, term, state, detail, evidence, next, ...(link ? { link } : {}) })

function describe(provider, { model, models, unconfigured } = {}) {
  if (!provider) return { state: unconfigured ?? 'off', provider: null, models: [] }
  const name = providers.get(provider.name) ?? null
  if (provider.configurationError || provider.name === 'unconfigured') {
    return { state: provider.configurationError?.code === 'AI_NOT_CONFIGURED' ? 'off' : 'invalid', provider: name, models: [] }
  }
  return { state: provider.apiKey ? 'configured' : 'off', provider: name, models: [...new Set((models ?? [model ?? provider.model]).map(modelName).filter(Boolean))] }
}

export function readProductionWorkflow({ env = process.env, audioTranscription, liveAudioPreview, captureWorker, now = () => new Date() } = {}) {
  // Construction/configuration only; none of these calls invokes a model or submits an asset.
  const primary = createAIProvider({ env })
  const dialogue = createDialogueProvider({ env })
  const audio = audioTranscription ? audioTranscription.provider : createAudioProvider('ASR', { env })
  const live = (liveAudioPreview ?? new LiveAudioPreviewService({ env })).capabilities()
  const explicitSite = env.OPS_WORKFLOW_SITE
  const site = explicitSite === 'aliyun-hangzhou' ? '阿里云 ECS · 杭州'
    : explicitSite === 'railway' ? 'Railway · 当前实例' : null
  // Variables copied during a migration are not reliable location or release evidence.
  const revision = [env.OPS_WORKFLOW_RELEASE_SHA, explicitSite === 'railway' ? env.RAILWAY_GIT_COMMIT_SHA : null].find(value => /^[0-9a-f]{40}$/i.test(value ?? '')) ?? null
  const context = env.NODE_ENV === 'production' || env.RAILWAY_ENVIRONMENT_ID ? 'production' : 'development'
  const openAI = primary?.name === 'openai'
  const ai = [
    { id: 'live', title: '录音中字幕', usage: '实时 ASR：临时文字预览，不作为正式转写或保存回执。', ...(live.configured ? { state: 'configured', provider: '阿里云百炼', models: [modelName(live.model)].filter(Boolean) } : { state: 'off', provider: null, models: [] }) },
    { id: 'asr', title: '松手后完整转写', usage: '音频校验／必要时转换格式 → 独立 ASR → 转写文字交给记录流程。', ...describe(audio, { model: audio?.name === 'openai' ? env.ASR_MODEL ?? 'gpt-4o-mini-transcribe' : audio?.model }) },
    { id: 'dialogue', title: '星舰对话与追问', usage: '独立对话路由；对话编排读取已知事实和缺口，不是医疗诊断。', ...describe(dialogue) },
    { id: 'vision', title: '图片、文档与画面识别', usage: '识别可见内容／可读文字；用户核对后才进入正式记录。', ...describe(primary, { models: openAI ? [env.AI_VISION_MODEL || primary.model, primary.model] : [primary?.visionModel ?? primary?.model] }) },
    { id: 'draft', title: '结构化整理与摘要', usage: '提取结构化内容、生成核对草稿或就诊摘要；部分场景使用不同模型。', ...describe(primary, { models: openAI ? [env.AI_DRAFT_MODEL || primary.model, primary.model] : [primary?.model] }) },
    { id: 'local', title: '本地规则与手动路径', usage: '记录核对、手动保存、检索与导出不以外部模型在线为前提。', state: 'local', provider: null, models: [] },
  ]
  const nodes = {
    web: node('网页 / PWA', 'Web · PWA', 'recorded', '浏览器打开护护记录；主站入口与总控台共用正式域名。', '已登记正式产品入口。PWA 安装态不等于独立后台。', ['domain'], ['打开正式网页', 'https://hoooho.com/nurse-station']),
    ios: node('iPhone 内测', 'iOS · WKWebView · TestFlight', 'recorded', '原生外壳承载网页与录音等能力。现有源码入口可经旧 Railway 域名；已安装版本和最终跳转仍需分别核对。', `北京时间 ${snapshotDay} 产品负责人反馈 TestFlight 可以访问；未接入手机或 TestFlight 的实时版本回执。`, ['legacy', 'domain'], ['App Store Connect', 'https://appstoreconnect.apple.com/']),
    mini: node('微信小程序', 'WeChat Mini Program', 'planned', '独立发布渠道；目前没有已核验的正式入口或生产 API 接入。', '发布说明；无正式发布回执。', [], ['微信公众平台', 'https://mp.weixin.qq.com/']),
    domain: node('域名与入口', 'hoooho.com · DNS · HTTPS', 'recorded', '正式域名和 www 由 Cloudflare 管理 DNS / HTTPS 入口；域名负责把访问引到生产服务，不等于服务器本身。', `北京时间 ${snapshotDay} 迁移回执：主域名与 www 指向杭州链路。此页不从不同地区重做 DNS 探测。`, ['origin']),
    origin: node('生产服务器', '阿里云 ECS · 反向代理 · Node.js', 'recorded', '杭州 ECS 承接正式域名流量，反向代理再转给 Web / API 服务。', `北京时间 ${snapshotDay} 迁移回执。当前应答实例的身份另见顶部；此处不是多地探活。`, ['api', 'monitor']),
    legacy: node('旧服务 / 保留链路', 'Railway · 旧入口 / 数据保留', 'retained', '保留旧服务与资料；旧域名的跳转用于兼容历史入口。不作为新的海外生产、双写或自动故障切换。', `北京时间 ${snapshotDay} 迁移回执；具体已安装 iOS 包仍需真机核验。`, ['domain']),
    overseas: node('海外独立链路', '独立域名 / 地区路由 / 数据边界', 'pending', '目前没有独立海外生产域名或自动分流的已核验回执；访问正式域名的设计目标仍是同一个正式入口。', '没有海外探针或地域流量回执，不声明跨区速度、AI 可用性或数据地域。', ['domain', 'legacy']),
    api: node('账户与业务 API', 'Node.js · Auth · Resend · API', 'running', '当前已鉴权控制台由应用 API 应答。正式用户侧包括邮箱验证、孩子档案与权限、记录/附件、健康日历、随访与就诊情况单。', '当前应答仅证明此进程；未发邮件，也未写正式健康数据。', ['agent', 'store', 'delivery']),
    agent: node('Agent AI 编排', 'ASR · 对话模型 · Vision · 本地规则', 'config', '不同功能可以走不同供应商；单个密钥或模型无法代表整条链路。下表读取当前进程所用配置。', '生产代码的供应商选择与实例配置；不发真实请求，不代表供应商在线。', ['store', 'delivery', 'monitor'], ['资源监控 · 用量回执', '/ops/resources?project=hoooho']),
    store: node('记录与原件', '持久化卷 · SQLite / 文件 · 附件', 'recorded', '正式数据、健康记录、原始资料和附件应以唯一正式写入端为准；旧备份不是实时同步的第二个写入端。', '代码与迁移回执；此页不写盘，也不宣称备份实时同步。', ['delivery', 'monitor'], ['查看容量与用量', '/ops/resources?project=hoooho']),
    delivery: node('核对、保存与交接', '记录单 · 健康日历 · 就诊情况单', 'implemented', '模型整理是草稿；用户核对并保存后，结果可在正式记录中回看，并按产品提供的入口整理或导出。', '当前应用功能和路由；不做真实儿童数据写入。', ['monitor']),
    monitor: node('运营与观测', 'Ops · 资源采样 · AI 用量 · 账单采集', 'implemented', '总控台分别查看费用、资源、服务与版本。采集与业务写入隔离。AI 用量是聚合观测，不是逐条健康记录或地域探针。', captureWorker?.configured ? '当前实例检测到独立采集连接配置；各费用来源的授权和回执仍需单看。' : '采集连接状态此处未确认；请到费用监控查看实际回执。', [], ['打开资源监控', '/ops/resources?project=hoooho']),
    code: node('代码与验证', 'GitHub · main · CI', 'implemented', '网页与共享 API 代码经验证后合入主分支，再发布到当前正式服务。GitHub 不负责承载用户健康数据。', '仓库发布约定；main 最新提交不能当作运行版本。', ['release', 'testflight', 'wechat'], ['打开代码仓库', 'https://github.com/Hoooho-app/hoooho.app']),
    release: node('Web 正式发布', '构建 · 部署 · /api/health · 线上核对', 'recorded', '更新同一个正式应用实例的 Web / API；已安装且使用该站的 iPhone 外壳也会读取更新。', revision ? `当前服务报告提交 ${revision}。` : '当前实例未提供提交回执，不能用 GitHub 最新提交代替。', ['domain', 'monitor']),
    testflight: node('TestFlight 内测', 'App Store Connect · 真机验证', 'pending', '只有原生变更或明确需要时另行上传构建；真机确认安装与正式入口，合格构建可以继续用于商店送审。', '未接入当前构建的自动回执，普通网页部署不会自动上传。', ['appstore'], ['App Store Connect', 'https://appstoreconnect.apple.com/']),
    appstore: node('App Store 正式版', '审核 · 发布', 'pending', 'iOS 正式发布是独立审核步骤，不能从网页在线或内测可装推断已在商店发布。', '未接入正式审核与发布回执。', [], ['App Store Connect', 'https://appstoreconnect.apple.com/']),
    wechat: node('小程序发布', '开发版 · 体验版 · 审核', 'planned', '需独立核对体验版、审核结果、服务端依赖及正式发布；不随 Web 或 iOS 一起发布。', '仓库未接入小程序发布链。', [], ['微信公众平台', 'https://mp.weixin.qq.com/']),
  }
  return {
    project: 'hoooho', checkedAt: now().toISOString(), runtime: { context, site, revision },
    nodes, ai,
    aiEvaluation: '独立验证方案：豆包语音转写、私有 PaddleOCR 识别检查单、Seed 对话／普通图片。该方案只用合成资料验证，不能视为生产已切换；当前启用情况以上方进程配置为准。',
    views: [
      { id: 'domestic', title: '中国大陆', detail: '正式主链：产品端 → 公网入口 → 杭州生产 → 应用与数据 → 保存和交接。', stages: [
        stage('01 · 产品入口', 'web', 'ios', 'mini'), stage('02 · 域名与接入', 'domain', 'legacy'), stage('03 · 生产与业务', 'origin', 'api'), stage('04 · 处理与存储', 'agent', 'store'), stage('05 · 结果与运营', 'delivery', 'monitor'),
      ] },
      { id: 'overseas', title: '海外', detail: '未核验海外独立分流。下方区分待核验入口、共享主链和历史保留项，不是海外实测。', stages: [
        stage('01 · 海外访问', 'overseas', 'web', 'ios'), stage('02 · 共享入口', 'domain', 'legacy'), stage('03 · 共享生产', 'origin', 'api'), stage('04 · 共享模块', 'agent', 'store'), stage('05 · 结果与运营', 'delivery', 'monitor'),
      ] },
      { id: 'release', title: '生产发布', detail: '网页、iOS 内测、App Store 与小程序分别核对；发布渠道不等于多套后台。', stages: [
        stage('代码来源', 'code'), stage('分支 · Web / API', 'release', 'domain', 'monitor'), stage('分支 · iOS', 'testflight', 'appstore'), stage('分支 · 微信', 'wechat'),
      ] },
    ],
  }
}
