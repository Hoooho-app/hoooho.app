import { createAudioProvider, createAIProvider } from '../ai/providers/provider-factory.mjs'
import { createDialogueProvider } from '../ai/providers/dialogue-provider.mjs'
import { LiveAudioPreviewService } from '../ai/live-audio-preview.mjs'

const modelName = value => typeof value === 'string' && /^[a-z0-9][a-z0-9._:/-]{0,149}$/i.test(value) ? value : null
const providers = new Map([['bailian', '阿里云百炼'], ['bailian-asr', '阿里云百炼'], ['openai', 'OpenAI'], ['openrouter', 'OpenRouter']])
const snapshotDay = '2026-11-07'
const stage = (title, ...nodes) => ({ title, nodes })
const node = (title, term, state, detail, evidence, next = [], link) => ({ title, term, state, detail, evidence, next, ...(link ? { link } : {}) })
const lane = (title, note, tone, first, ...transitions) => ({
  title, note, tone, steps: [{ node: first }, ...transitions.map(([via, node]) => ({ node, via }))],
})

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
    godaddy: node('GoDaddy', '原域名注册商', 'history', '护护域名转入阿里云之前的注册商。保留在图上用来说明域名管理历史，不承接现有用户流量。', '域名迁移记录；当前注册商单独以 .com 注册局查询结果为准。', ['registrar', 'domain']),
    registrar: node('阿里云域名', '当前注册商 · 注册 / 续费', 'recorded', '负责域名注册和续期，不负责处理用户的 HTTPS 请求。', `北京时间 ${snapshotDay} 核对 .com 官方 RDAP，注册商为 Alibaba Cloud Computing Ltd. d/b/a HiChina。`, ['domain'], ['查看注册局记录', 'https://rdap.verisign.com/com/v1/domain/hoooho.com']),
    domain: node('正式域名', 'hoooho.com / www.hoooho.com', 'recorded', '这是产品地址，与注册商、DNS/代理和计算服务器是不同模块。', `北京时间 ${snapshotDay} 核对正式域名和迁移回执。`, ['gateway']),
    gateway: node('公网访问入口', 'Cloudflare · DNS / HTTPS 代理', 'recorded', '解析域名并承接公开 HTTPS 请求，再把流量转给杭州生产服务器；注册商不在请求链路上。', `北京时间 ${snapshotDay} 的主域名切换回执；本图不从多个地区重新探测。`, ['origin']),
    origin: node('生产环境', '阿里云 ECS · 杭州 · Nginx / Docker', 'recorded', '承接 Cloudflare 转发的请求，Nginx 将流量送给 Node.js 应用。服务器运行位置不等于模型或用户的位置。', `北京时间 ${snapshotDay} 迁移回执。当前应答实例的身份另见顶部；此处不是多地探活。`, ['api', 'monitor']),
    legacy: node('旧服务 / 保留链路', 'Railway · 旧入口 / 数据保留', 'retained', '保留旧服务与资料；旧域名的跳转用于兼容历史入口。不作为新的海外生产、双写或自动故障切换。', `北京时间 ${snapshotDay} 迁移回执；具体已安装 iOS 包仍需真机核验。`, ['domain']),
    overseas: node('海外独立链路', '独立域名 / 地区路由 / 数据边界', 'pending', '目前没有独立海外生产域名或自动分流的已核验回执；访问正式域名的设计目标仍是同一个正式入口。', '没有海外探针或地域流量回执，不声明跨区速度、AI 可用性或数据地域。', ['domain', 'legacy']),
    api: node('业务 API', 'Node.js · 健康记录 / 档案 / 日历', 'running', '负责健康记录、档案、随访和就诊等业务。AI 与手动路径都是可选业务分支，不是每笔请求都调用模型。', '当前应答仅证明此进程；未写正式健康数据。', ['auth', 'agent', 'manual', 'store', 'delivery']),
    auth: node('账户与鉴权', '邮箱验证 · Resend · 会话 / 对象权限', 'implemented', '登录和会话核验是访问约束；未通过鉴权不会读取孩子档案或进入管理员数据接口。', '代码实现；此页不发送邮箱验证码。', ['api']),
    agent: node('Agent AI 编排', 'ASR · 对话模型 · Vision · 本地规则', 'config', '不同功能可以走不同供应商；单个密钥或模型无法代表整条链路。下表读取当前进程所用配置。', '生产代码的供应商选择与实例配置；不发真实请求，不代表供应商在线。', ['subtitle', 'review', 'monitor'], ['资源监控 · 用量回执', '/ops/resources?project=hoooho']),
    subtitle: node('录音中字幕', '实时 ASR · 临时预览', 'implemented', '录音过程中返回临时字幕；与松手后的完整转写是不同的路径，字幕不会直接保存为健康记录。', '代码实现；是否配置见 Agent 节点，未发起真实语音请求。', ['agent']),
    manual: node('手动记录', '手动表单 · 本地规则', 'implemented', '用户可以不经过模型，直接填写记录；校验后经业务 API 保存。', '代码实现；不在图上写入健康资料。', ['store']),
    review: node('核对草稿', '识别结果 · 草稿 · 确认', 'implemented', '完整转写、图片识别或结构化整理先提供待核对内容。用户确认保存才形成正式记录。', '模型输出不是存储成功回执。', ['store']),
    store: node('数据存储', '持久化卷 · SQLite / 文件 · 原件', 'recorded', '正式记录、草稿与原件按业务规则存放。历史备份不是第二个正式写入端。', '代码与迁移回执；此页不写盘，也不宣称备份实时同步。', ['delivery', 'monitor'], ['查看容量与用量', '/ops/resources?project=hoooho']),
    delivery: node('结果与交接', '正式记录 · 健康日历 · 就诊情况单', 'implemented', '可回看正式记录、整理就诊情况单或按现有入口导出。保存成功与导出交付是两个不同结果。', '当前应用功能和路由；不做真实儿童数据写入。', []),
    monitor: node('运营与观测', 'Ops · 资源采样 · AI 用量 · 账单采集', 'implemented', '总控台分别查看费用、资源、服务与版本。采集与业务写入隔离。AI 用量是聚合观测，不是逐条健康记录或地域探针。', captureWorker?.configured ? '当前实例检测到独立采集连接配置；各费用来源的授权和回执仍需单看。' : '采集连接状态此处未确认；请到费用监控查看实际回执。', [], ['打开资源监控', '/ops/resources?project=hoooho']),
    code: node('代码与验证', 'GitHub · main · CI', 'implemented', '网页与共享 API 代码经验证后合入主分支，再发布到当前正式服务。GitHub 不负责承载用户健康数据。', '仓库发布约定；main 最新提交不能当作运行版本。', ['release', 'testflight', 'wechat'], ['打开代码仓库', 'https://github.com/Hoooho-app/hoooho.app']),
    release: node('Web 正式发布', '构建 · 部署 · /api/health · 线上核对', 'recorded', '更新同一个正式应用实例的 Web / API；已安装且使用该站的 iPhone 外壳也会读取更新。', revision ? `当前服务报告提交 ${revision}。` : '当前实例未提供提交回执，不能用 GitHub 最新提交代替。', ['domain', 'monitor']),
    testflight: node('TestFlight 内测', 'App Store Connect · 真机验证', 'pending', '只有原生变更或明确需要时另行上传构建；真机确认安装与正式入口，合格构建可以继续用于商店送审。', '未接入当前构建的自动回执，普通网页部署不会自动上传。', ['appstore'], ['App Store Connect', 'https://appstoreconnect.apple.com/']),
    appstore: node('App Store 正式版', '审核 · 发布', 'pending', 'iOS 正式发布是独立审核步骤，不能从网页在线或内测可装推断已在商店发布。', '未接入正式审核与发布回执。', [], ['App Store Connect', 'https://appstoreconnect.apple.com/']),
    wechat: node('小程序发布', '开发版 · 体验版 · 审核', 'planned', '需独立核对体验版、审核结果、服务端依赖及正式发布；不随 Web 或 iOS 一起发布。', '仓库未接入小程序发布链。', [], ['微信公众平台', 'https://mp.weixin.qq.com/']),
  }
  const moduleStages = [
    stage('产品端', 'web', 'ios', 'mini'),
    stage('域名', 'domain', 'registrar', 'godaddy'),
    stage('访问入口', 'gateway', 'legacy'),
    stage('生产环境', 'origin'),
    stage('业务', 'auth', 'api'),
    stage('处理', 'agent', 'subtitle', 'manual', 'review'),
    stage('存储', 'store'),
    stage('结果', 'delivery'),
    stage('运营', 'monitor'),
  ]
  const workflowLanes = [
    lane('域名注册与迁移', '管理关系，不是请求流量。', 'history', 'godaddy', ['历史转入', 'registrar'], ['现行注册与续期', 'domain']),
    lane('网页访问', '正式公网路径；鉴权在应用层执行。', 'traffic', 'web', ['访问地址', 'domain'], ['解析 / HTTPS', 'gateway'], ['转发', 'origin'], ['处理请求', 'api']),
    lane('旧版 iPhone 入口', '兼容旧包，实际安装版本和最终跳转仍需核对。', 'pending', 'ios', ['旧包可能访问', 'legacy'], ['兼容跳转', 'domain']),
    lane('登录与业务访问', '复用同一生产应用；访问孩子资料还要核对对象权限。', 'business', 'origin', ['校验会话', 'auth'], ['鉴权通过', 'api']),
    lane('录音中字幕', '只预览，不进入正式保存链。', 'business', 'api', ['按住录音', 'agent'], ['返回临时文字', 'subtitle']),
    lane('AI 整理后保存', '完整转写、对话整理、图片和文档识别按场景分流。', 'business', 'api', ['送待处理内容', 'agent'], ['返回草稿', 'review'], ['确认保存', 'store'], ['读取 / 导出', 'delivery']),
    lane('手动记录', '不调用外部模型。', 'business', 'api', ['提交表单', 'manual'], ['校验并保存', 'store'], ['回看 / 交接', 'delivery']),
    lane('运营观测：服务', '查看运行情况，不影响业务或切流。', 'observe', 'origin', ['健康与资源检查', 'monitor']),
    lane('运营观测：存储', '存储用量独立采样，不是业务的最后一步。', 'observe', 'store', ['容量和文件用量', 'monitor']),
    lane('运营观测：模型', '仅聚合用量，不展示个人内容。', 'observe', 'agent', ['用量回执', 'monitor']),
  ]
  return {
    project: 'hoooho', checkedAt: now().toISOString(), runtime: { context, site, revision },
    nodes, ai,
    aiEvaluation: '独立验证方案：豆包语音转写、私有 PaddleOCR 识别检查单、Seed 对话／普通图片。该方案只用合成资料验证，不能视为生产已切换；当前启用情况以上方进程配置为准。',
    views: [
      { id: 'domestic', title: '中国大陆', detail: '下面按用途拆开画：域名管理、用户访问、处理与保存、运营观测。每个箭头标出传递或读取的内容。', stages: moduleStages, lanes: workflowLanes },
      { id: 'overseas', title: '海外', detail: '未核验独立海外生产路由。共享链路表示当前设计，不代表海外实测；旧 Railway 不是海外主站。', stages: [stage('海外分流', 'overseas'), ...moduleStages], lanes: [
        lane('海外共享入口', '按正式域名设计路径展示，未做海外探活。', 'pending', 'web', ['共用地址', 'domain'], ['解析 / HTTPS', 'gateway'], ['转发到杭州', 'origin'], ['处理请求', 'api']),
        ...workflowLanes.filter(item => item.tone !== 'traffic'),
      ] },
      { id: 'release', title: '生产发布', detail: '网页、iOS 内测、App Store 与小程序分别核对；发布渠道不等于多套后台。', stages: [
        stage('代码来源', 'code'), stage('分支 · Web / API', 'release', 'domain', 'monitor'), stage('分支 · iOS', 'testflight', 'appstore'), stage('分支 · 微信', 'wechat'),
      ], lanes: [
        lane('Web 与 API 发布', '共享网页和后端，不会自动上传商店包。', 'traffic', 'code', ['构建 / 部署', 'release'], ['核对线上', 'domain']),
        lane('iOS 发布', '内测和正式审核分别确认。', 'pending', 'code', ['上传原生构建', 'testflight'], ['选版本送审', 'appstore']),
        lane('微信小程序发布', '独立发布渠道，当前未接入。', 'pending', 'code', ['上传 / 体验 / 送审', 'wechat']),
      ] },
    ],
  }
}
