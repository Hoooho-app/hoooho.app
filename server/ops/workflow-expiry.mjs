import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { beijingDate, isExpiryDate } from '../../shared/workflow-expiry.mjs'
import { JsonStore } from '../auth/storage/json-store.mjs'
import { readDeliveryCatalog } from './delivery-workflow-catalog.mjs'

export const EXPIRY_PATH = '/api/ops/workflow/expiry'
const apple = 'https://developer.apple.com/account'
const assets = [
  { id: 'domain-registration', title: '域名注册到期日', short: '域名注册', scope: 'shared', nodes: ['registrar', 'domain'], source: '.com 注册局 Verisign RDAP', href: 'https://rdap.verisign.com/com/v1/domain/hoooho.com', note: '注册有效期，可能随续费延长。' },
  { id: 'filing-code', title: '公安联网备案数据码有效期', short: '备案数据码', scope: 'shared', nodes: ['registrar'], source: '阿里云备案回执', href: 'https://beian.aliyun.com/', note: '仅为备案数据码可使用的截止日期。' },
  { id: 'edge-tls', title: '公网 HTTPS 证书到期日', short: '公网证书', scope: 'shared', nodes: ['gateway'], source: '公网 HTTPS 证书', href: 'https://dash.cloudflare.com/', note: '记录核验时实际对外提供的证书；自动轮换后核对新日期。' },
  { id: 'ecs-term', title: '杭州 ECS 当前服务期到期日', short: 'ECS 服务期', scope: 'shared', nodes: ['origin'], source: '阿里云 ECS 实例详情', href: 'https://ecs.console.aliyun.com/instance/region/cn-hangzhou', note: '这是本期的截止日；是否续费以实例详情为准。' },
  { id: 'origin-tls', title: '杭州源站 HTTPS 证书到期日', short: '源站证书', scope: 'shared', nodes: ['origin'], source: '杭州 Nginx 源站证书', href: 'https://ecs.console.aliyun.com/instance/region/cn-hangzhou', note: '单独核对源站的证书，公网证书的日期不会覆盖这一项。' },
  { id: 'railway-term', title: 'Railway 旧链路固定到期日', short: '旧链路有效期', scope: 'shared', nodes: ['legacy'], source: 'Railway 账单与订阅', href: 'https://railway.com/account/billing', note: '有固定结束日才填写；常规结算日不填在这里。' },
  { id: 'apple-membership', title: 'Apple Developer 会籍续订日', short: '开发者会籍', scope: 'project', steps: ['apple-access'], renewal: true, source: 'Apple Developer · Membership details', href: `${apple}/`, note: '平台显示的续订日，以团队会籍页面为准。' },
  { id: 'apple-api-key', title: 'App Store Connect API 密钥到期日', short: 'API 密钥', scope: 'project', steps: ['apple-api-key', 'github-api-secrets'], source: 'App Store Connect · 团队密钥', href: 'https://appstoreconnect.apple.com/access/users', note: '平台未提供固定日期时留空；密钥是否仍有效在集成页核对。' },
  { id: 'distribution-certificate', title: 'Apple Distribution 证书到期日', short: '分发证书', scope: 'project', steps: ['distribution-certificate', 'github-signing', 'signed-archive'], source: 'Apple Developer · Certificates', href: `${apple}/resources/certificates/list`, note: '记录 Apple 已签发的材料；更换后在 GitHub 核对实际使用的证书与描述文件。' },
  { id: 'provisioning', title: 'App Store 分发描述文件到期日', short: '描述文件', scope: 'project', steps: ['provisioning', 'github-signing', 'signed-archive'], source: 'Apple Developer · Profiles', href: `${apple}/resources/profiles/list`, note: '按该项目 App ID 的描述文件填写。' },
  { id: 'previous-provisioning', title: '旧版 App Store 分发描述文件到期日', short: '旧描述文件', scope: 'project', steps: ['provisioning'], onlyWhenRecorded: true, source: 'Apple Developer · Profiles', href: `${apple}/resources/profiles/list`, note: '用于核对旧签名配置；换签时优先核对上面的描述文件。' },
  { id: 'testflight-build', title: 'TestFlight 构建到期日', short: 'TestFlight', scope: 'build', nodes: ['ios', 'testflight'], steps: ['internal-group', 'upload', 'processing', 'distributed', 'device'], source: 'App Store Connect · TestFlight', href: 'https://appstoreconnect.apple.com/apps', note: '到期日只适用于所示版本和构建号。' },
]
const definitions = new Map(assets.map(asset => [asset.id, asset]))
const versionFormat = /^\d{1,4}(?:\.\d{1,3}){1,2}$/
const buildFormat = /^\d{1,8}(?:\.\d{1,6}){0,2}$/
const fail = (status, code, message) => Object.assign(new Error(message), { status, code })
const invalid = () => fail(400, 'INVALID_WORKFLOW_EXPIRY', '请选择有效的工作流项目、构建和日期。')
const unavailable = () => fail(503, 'WORKFLOW_EXPIRY_UNAVAILABLE', '到期日暂时无法读取。')
const knownKeys = (value, keys) => value && typeof value === 'object' && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
const keyOf = ({ asset, project, version, build }) => [asset, project, version, build].join(':')

function identity(input, projects) {
  const { asset, project, version, build } = input
  const definition = definitions.get(asset)
  if (!definition || (definition.scope === 'shared' ? project !== null : !projects.has(project))) throw invalid()
  if (definition.scope === 'build'
    ? typeof version !== 'string' || !versionFormat.test(version) || typeof build !== 'string' || !buildFormat.test(build)
    : version !== null || build !== null) throw invalid()
  return { asset, project, version, build }
}

function readSource(row, projects) {
  if (!knownKeys(row, ['asset', 'project', 'version', 'build', 'date', 'exactAt', 'checkedOn']) ||
    !(isExpiryDate(row.date) || row.date === null && row.asset === 'testflight-build') || !isExpiryDate(row.checkedOn)) throw unavailable()
  if (row.exactAt !== null) {
    if (typeof row.exactAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(row.exactAt)) throw unavailable()
    const at = new Date(row.exactAt)
    if (!Number.isFinite(at.getTime()) || at.toISOString() !== row.exactAt.replace('Z', '.000Z') || beijingDate(at) !== row.date) throw unavailable()
  }
  return { ...identity(row, projects), date: row.date, exactAt: row.exactAt, checkedOn: row.checkedOn, source: 'platform' }
}

const revisionOf = row => row ? createHash('sha256').update(JSON.stringify(row)).digest('hex').slice(0, 24) : null
const safeRow = row => ({ ...row, revision: revisionOf(row) })

export class WorkflowExpiryService {
  constructor({ dataDirectory, now = () => new Date() }) {
    this.now = now
    this.dataDirectory = dataDirectory
    this.store = new JsonStore(path.join(dataDirectory, 'ops/workflow-expiry-overrides.json'), { rows: [] })
  }

  async #inputs() {
    try {
      const [catalog, sources] = await Promise.all([
        readDeliveryCatalog(this.dataDirectory),
        readFile(path.join(this.dataDirectory, 'ops/workflow-expiry-sources.json'), 'utf8').then(JSON.parse).catch(error => {
          if (error.code === 'ENOENT') return []
          throw error
        }),
      ])
      const projects = new Set(catalog.projects.map(project => project.id))
      if (!Array.isArray(sources) || sources.length > 256) throw unavailable()
      const records = sources.map(row => readSource(row, projects))
      const baseline = new Map(records.map(row => [keyOf(row), row]))
      if (baseline.size !== records.length) throw unavailable()
      return { projects, baseline }
    } catch { throw unavailable() }
  }

  #snapshot(baseline, overrides) {
    const records = new Map(baseline)
    for (const row of overrides) records.set(keyOf(row), row)
    return { assets, records: [...records.values()].map(safeRow) }
  }

  async read() {
    const [{ baseline }, { rows }] = await Promise.all([this.#inputs(), this.store.read()])
    return this.#snapshot(baseline, rows)
  }

  async record(input) {
    if (!knownKeys(input, ['asset', 'project', 'version', 'build', 'date', 'revision']) ||
      input.date !== null && !isExpiryDate(input.date) || input.revision !== null && (typeof input.revision !== 'string' || !/^[a-f0-9]{24}$/.test(input.revision))) throw invalid()
    const { projects, baseline } = await this.#inputs()
    const target = identity(input, projects), key = keyOf(target)
    const { rows } = await this.store.update(({ rows: overrides }) => {
      const previous = overrides.find(row => keyOf(row) === key)
      const current = previous ?? baseline.get(key)
      if (input.revision !== revisionOf(current)) throw fail(409, 'WORKFLOW_EXPIRY_CONFLICT', '这个日期已有更新。请核对最新记录再保存。')
      if ((current?.date ?? null) === input.date) return { rows: overrides }
      if (!previous && overrides.length >= 1024) throw fail(409, 'WORKFLOW_EXPIRY_LIMIT', '日期记录已达到上限。')
      const row = { ...target, date: input.date, exactAt: null, checkedOn: beijingDate(this.now()), source: 'manual', edit: (previous?.edit ?? 0) + 1 }
      return { rows: [...overrides.filter(item => keyOf(item) !== key), row] }
    })
    return this.#snapshot(baseline, rows)
  }
}
