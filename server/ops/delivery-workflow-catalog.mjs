import path from 'node:path'
import { readFile } from 'node:fs/promises'

const apple = 'https://appstoreconnect.apple.com'
const developer = 'https://developer.apple.com/account/resources'
const appleApiHelp = 'https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api/'
const githubSecretsHelp = 'https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets'
const link = (label, href) => ({ label, href })
const step = (id, title, location, check, recovery, options = {}) => ({ id, title, location, check, recovery, ...options })
const group = (title, ...steps) => ({ title, steps })
const variableName = /^[A-Z][A-Z0-9_]{2,80}$/
const projectId = /^[a-z][a-z0-9-]{1,40}$/
const keyPattern = /^[a-zA-Z0-9_.-]{1,90}$/

const records = {
  id: 'hoooho', title: '护护记录', repository: 'Hoooho-app/hoooho.app', directory: 'ios/Hoooho',
  uploadWorkflow: 'ios-testflight.yml', checkWorkflow: 'ios-build.yml', trigger: 'manual',
  apiNames: ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_API_KEY_P8'],
  variableNames: ['IOS_BUNDLE_ID', 'IOS_TEAM_ID', 'ASC_APP_ID'],
  signingNames: ['IOS_DISTRIBUTION_P12_BASE64', 'IOS_DISTRIBUTION_P12_PASSWORD', 'IOS_PROVISION_PROFILE_BASE64'],
}

export function makeDeliveryProject(profile) {
  const { id, title, repository, directory, bundleId, uploadWorkflow, checkWorkflow, environment, automaticVariable, trigger, apiNames, variableNames, signingNames } = profile
  const repo = `https://github.com/${repository}`, actions = `${repo}/actions`
  const secrets = environment ? `${repo}/settings/environments` : `${repo}/settings/secrets/actions`
  const settings = environment ? `仓库 → Settings → Environments → ${environment}` : '仓库 → Settings → Secrets and variables → Actions'
  const checkAction = link('构建检查', `${actions}/workflows/${checkWorkflow}`)
  const uploadAction = link('上传与内测工作流', `${actions}/workflows/${uploadWorkflow}`)
  const secretsLink = link(environment ? 'GitHub 环境设置' : 'GitHub Actions Secrets', secrets)
  const uploadEntry = `GitHub → Actions → ${uploadWorkflow} → main${trigger === 'cards' ? ' → Run workflow，勾选 upload_testflight' : ' → Run workflow'}`
  const internalCheck = trigger === 'cards'
    ? '同一个版本和构建号已分配到该 App 的现有内部组，确认 IN_BETA_TESTING；工作流应有 INTERNAL_TESTFLIGHT_VERIFIED 回执。'
    : '核对同一个版本和构建号已分配到该 App 的现有内部组，测试者在 TestFlight 中可见且可安装。'
  return {
    id, title, repository, directory, ...(bundleId ? { bundleId } : {}),
    setup: [
      group('项目与账号',
        step('repository', '项目仓库与发布目标', 'GitHub → 仓库、默认分支与 iOS 工程', '仓库、iOS 工程、目标 App 与负责人相符；确定此次交付是 Web、iOS 内测还是正式上架。', '先核对项目名与仓库，切错项目不要继续填配置。', { links: [link('项目仓库', repo)] }),
        step('apple-access', 'Apple 团队、角色与协议', 'App Store Connect → 用户与访问权限；Apple Developer → Membership', '确认在正确的开发者团队，操作者与发布使用的权限都已授权，所需协议已处理。', '账号不对先切换团队；API 尚不可用时检查是否需要账号持有人申请或接受协议。', { links: [link('用户与访问权限', `${apple}/access/users`), link('开发者账号', 'https://developer.apple.com/account/')] }),
        step('app-identity', 'App ID 与 App Store Connect 应用', 'Apple Developer → Identifiers；App Store Connect → 我的 App → App 信息', 'Bundle ID、Team 与 App Store Connect 应用记录相互匹配。记录应用身份与配置位置。', '查错 App、错团队、Bundle ID 不匹配或应用尚未创建；测试包和发布包不能混用标识。', { links: [link('Apple 标识符', `${developer}/identifiers/list`), link('我的 App', `${apple}/apps`)] })),
      group('授权与 GitHub 配置',
        step('apple-api-key', 'App Store Connect API', 'App Store Connect → 用户与访问权限 → 集成 → App Store Connect API → 团队密钥', '在正确团队看到用于该流程的有效密钥，核对所需权限。Key ID、Issuer ID 与 .p8 来自同一团队密钥设置，.p8 妥善保存。', '入口不可见先查团队与角色；鉴权失败先查三项是否对应、密钥是否已撤销。下载或创建密钥不代表 CI 已接通。', { links: [link('App Store Connect', `${apple}/access/users`), link('Apple API 设置说明', appleApiHelp)] }),
        step('github-api-secrets', 'GitHub · Apple API Secrets', `${settings} → Secrets`, '核对三个 Secret 名称，并在首次发布运行中确认 Apple 鉴权通过；录入后页面只能核对名称。', '缺项核对名称与作用域；401 查密钥是否成套；403 查角色、团队和目标 App。仅在 GitHub 的 Secrets 页面填值。', {
          fields: apiNames.map((name, i) => ({ name, source: ['Apple 团队密钥列表 → Key ID', 'Apple 团队密钥页 → Issuer ID', '同一个 Key 下载的 .p8 内容'][i], destination: 'Secret' })),
          links: [secretsLink, link('GitHub Secrets 说明', githubSecretsHelp)],
        }),
        step('github-app-variables', 'GitHub · 应用标识 Variables', `${settings} → Variables`, '工作流可读取需要的应用标识变量；App ID 是 App Store Connect 中的应用数字 ID，Team ID、Bundle ID 各自核对。', 'Secret 和 Variable 不要填反；查看工作流缺项日志，再核对分支、仓库和环境作用域。', {
          fields: variableNames.map(name => ({ name, source: name.endsWith('BUNDLE_ID') ? 'Apple Developer → Identifiers 中的 Bundle ID' : name.endsWith('TEAM_ID') ? 'Apple Developer → Membership 中的 Team ID' : 'App Store Connect → App 信息中的 Apple ID', destination: 'Variable' })),
          links: [secretsLink, uploadAction],
        })),
      group('签名与运行',
        step('distribution-certificate', 'Apple Distribution 证书', 'Apple Developer → Certificates；签名机的钥匙串', '证书有效，属于对应团队；签名可导入有私钥的分发证书，且与描述文件包含的证书一致。', '先查有效期、配对私钥、导出密码和所属团队，再重新验证；不要把签名文件提交到仓库。', { links: [link('证书管理', `${developer}/certificates/list`)] }),
        step('provisioning', 'App Store 分发描述文件', 'Apple Developer → Profiles', '针对正确的显式 App ID，描述文件有效、授权所需能力并包含对应分发证书。', '签名失败逐项对照 Bundle ID、Team、证书及描述文件有效期。重建描述文件后同步 GitHub Secret。', { links: [link('描述文件', `${developer}/profiles/list`)] }),
        step('github-signing', 'GitHub · 签名材料 Secrets', `${settings} → Secrets`, '分发证书、证书密码、描述文件的配置名称都在正确位置；首次签名运行中全部通过。', '检查是否漏项、Base64 格式、证书密码、有效期和描述文件。证书轮换后先验签名再上传。', {
          fields: signingNames.map((name, i) => ({ name, source: ['Apple Distribution 证书 .p12 的 Base64', '导出该 .p12 时设定的密码', '该 App 的分发描述文件 Base64'][i], destination: 'Secret' })),
          links: [secretsLink, uploadAction],
        }),
        step('github-actions', 'Actions 触发、分支与审批', 'GitHub → Actions / Settings → Actions；如有环境规则，核对该环境', automaticVariable
          ? `先手动通过内测，再核对是否启用 ${automaticVariable}；模拟器检查和内测发布的触发条件各自确认。`
          : '核对构建与上传工作流触发条件。普通网页提交不等于需要发新 iOS 包；确认 main 与发布权限。', '先看运行是否被跳过、排队、待审批、分支不符或 CI 未通过，不把没有运行当作运行失败。', { links: [checkAction, uploadAction] }),
        step('internal-group', '内测组与测试者', 'App Store Connect → 该 App → TestFlight → 内部测试', '现有内测组和成员正确，手机 TestFlight 使用受邀 Apple 账号。', '找不到 App 时先核对邀请、身份和内测组；不要重复建测试组。', { links: [link('TestFlight 管理入口', `${apple}/apps`)] })),
    ],
    release: [
      group('需求、代码与检查',
        step('scope', '需求、影响范围与验收', '需求 / PR 说明 → 本轮交付目标', '明确改动、影响页面、验证范围；区分共享网页改动与必须重新打包的原生改动。', '先对照现有流程和上次结果，避免为了网页改动误发原生包。'),
        step('local-checks', '开发与本地验证', `仓库 → ${directory}；按本轮改动执行构建与路径测试`, '针对改动的本地检查通过，核心路径有可复现结果。', '先定位失败用例，修复后重跑；本地通过不能替代实际提交的 Actions 回执。', { links: [link('项目仓库', repo)] }),
        step('review-main', 'PR 审查与合入 main', 'GitHub → Pull requests → 审查、检查与合并', '确认目标提交已合入发布分支，PR 与测试证据对应。', '核对分支、未合并项与检查失败；不要用别的提交的绿灯。', { receipt: 'commit', links: [link('Pull requests', `${repo}/pulls`)] }),
        step('native-ci', 'iOS CI 与模拟器启动', `GitHub → Actions → ${checkWorkflow}`, '核对同一次代码提交的无签名编译与启动检查成功，记录运行编号。', '展开第一个失败步骤；查 Xcode、工程生成、依赖和启动检查，再按同提交重跑。', { receipt: 'run', links: [checkAction] })),
      group('签名、上传与 TestFlight',
        step('signed-archive', '发布触发与签名归档', uploadEntry, '当前提交的发布运行通过 Apple 应用鉴权、版本号和签名校验，已生成正确 App 的签名包。', '先查运行/审批；签名失败回到 Apple API、证书、描述文件与 GitHub 配置节点。', { receipt: 'run', links: [uploadAction], related: ['apple-api-key', 'github-api-secrets', 'github-signing'] }),
        step('upload', '上传构建', 'GitHub Actions 上传步骤 / App Store Connect → TestFlight 构建', '核对确切版本和构建号，上传已被接收。', '同版本重试前先查 Apple 上是否已有该构建；上传成功后不要因等待处理盲目重传。', { receipt: 'build', links: [uploadAction, link('App Store Connect', `${apple}/apps`)] }),
        step('processing', 'Apple 构建处理与合规', 'App Store Connect → 该 App → TestFlight → 构建版本', '同一个构建处理完成并有效，未被出口合规或其他提示拦住。', '处理中等待平台；失败看 Apple 回执；有合规提示时由负责人按实际情况填写。', { receipt: 'build', links: [link('App Store Connect', `${apple}/apps`)] }),
        step('distributed', '分配现有内测组 · 可安装', 'App Store Connect → 该 App → TestFlight → 内部测试组', internalCheck, '构建处理完仍不可装，核对分组、成员、构建状态和测试邀请。可安装不等于手机已更新。', { receipt: 'build', links: [link('App Store Connect', `${apple}/apps`)], related: ['internal-group'] }),
        step('device', 'iPhone 安装与真机验收', 'iPhone → TestFlight → App 信息；再从桌面打开对应 App', '实机显示本轮确切版本和构建号，关键流程可用。已设置自动更新时等设备实际安装；首次或未更新时再手动操作。', '核对同一内测账号、组、设备系统与自动更新；设备显示旧构建时标明未安装。', { receipt: 'build', links: [link('TestFlight 官方说明', 'https://testflight.apple.com/')] })),
      group('正式上架 · 按需继续',
        step('store-review', '商店资料与提交审核', 'App Store Connect → 该 App → App Store 版本', '确认正式发布授权，准备商店资料、隐私和审核信息，选择经验证的构建后核对提交状态。', '资料、协议或审核缺项在 App Store Connect 处理；已分发内测不代表已提交。', { receipt: 'build', links: [link('App Store Connect', `${apple}/apps`)] }),
        step('store-live', '审核通过、发布与回读', 'App Store Connect → App Store 版本；公开 App Store 页面', '核对 Apple 审核与发布状态、指定地区和公开可见版本。', '审核通过但未发布时查手动发布或排期；先确认生效地区与版本再报告上线。', { receipt: 'build', links: [link('App Store Connect', `${apple}/apps`)] })),
    ],
  }
}

function isProfile(p) {
  return p && projectId.test(p.id) && p.id !== records.id &&
    typeof p.title === 'string' && p.title.trim() === p.title && p.title.length > 0 && p.title.length <= 40 &&
    typeof p.repository === 'string' && /^[a-zA-Z0-9-]{1,40}\/[a-zA-Z0-9_.-]{1,100}$/.test(p.repository) &&
    typeof p.directory === 'string' && /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+){0,3}$/.test(p.directory) && !p.directory.split('/').includes('..') &&
    (p.bundleId === undefined || typeof p.bundleId === 'string' && /^[a-z0-9-]+(?:\.[a-z0-9-]+){1,6}$/i.test(p.bundleId)) &&
    [p.uploadWorkflow, p.checkWorkflow].every(v => typeof v === 'string' && keyPattern.test(v) && /\.ya?ml$/.test(v)) &&
    (p.environment === undefined || typeof p.environment === 'string' && keyPattern.test(p.environment)) &&
    (p.automaticVariable === undefined || typeof p.automaticVariable === 'string' && variableName.test(p.automaticVariable)) &&
    ['manual', 'cards'].includes(p.trigger) &&
    [p.apiNames, p.variableNames, p.signingNames].every(v => Array.isArray(v) && v.length >= 2 && v.length <= 3 && v.every(k => typeof k === 'string' && variableName.test(k))) &&
    p.apiNames.length === 3 && p.signingNames.length === 3
}

export function deliveryCatalog(input = {}) {
  const profiles = input.projects ?? []
  if (!Array.isArray(profiles) || profiles.length > 8 || !profiles.every(isProfile) || new Set(profiles.map(p => p.id)).size !== profiles.length) throw new Error('Invalid delivery catalog')
  const projects = [records, ...profiles].map(makeDeliveryProject)
  const notes = input.observations ?? []
  if (!Array.isArray(notes) || notes.length > 32) throw new Error('Invalid delivery observations')
  const observations = notes.map(n => {
    if (!n || !projects.some(p => p.id === n.project && p.setup.some(g => g.steps.some(s => s.id === n.step))) || !['working', 'pending'].includes(n.state) || !/^\d{4}-\d{2}-\d{2}$/.test(n.date ?? '') || n.source !== 'owner-report') throw new Error('Invalid delivery observation')
    return { project: n.project, step: n.step, state: n.state, date: n.date, source: n.source }
  })
  return { projects, observations }
}

export async function readDeliveryCatalog(directory) {
  let source
  try { source = await readFile(path.join(directory, 'ops/delivery-catalog.json'), 'utf8') }
  catch (error) { if (error.code === 'ENOENT') return deliveryCatalog(); throw error }
  return deliveryCatalog(JSON.parse(source))
}
