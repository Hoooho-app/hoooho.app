import path from 'node:path'
import { JsonStore } from '../auth/storage/json-store.mjs'
import { readDeliveryCatalog } from './delivery-workflow-catalog.mjs'

export const DELIVERY_PATH = '/api/ops/workflow/delivery'
const versionFormat = /^\d{1,4}(?:\.\d{1,3}){1,2}$/
const operationFormat = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const formats = { commit: /^[a-f0-9]{7,40}$/i, run: /^[1-9][0-9]{0,18}$/, build: /^\d{1,8}(?:\.\d{1,6}){0,2}$/ }
const states = ['pending', 'working', 'blocked', 'confirmed']
const reasons = { access: '账号或权限受限', config: '前置配置缺失或不匹配', failed: '检查或运行失败', waiting: '等待平台处理或审批', device: '待真机确认', other: '需要按本节点排查' }
const prerequisite = { processing: 'upload', distributed: 'processing', device: 'distributed', 'store-review': 'device', 'store-live': 'store-review' }
const fail = (status, code, message) => Object.assign(new Error(message), { status, code })
const invalid = () => fail(400, 'INVALID_DELIVERY_ENTRY', '只能记录此节点支持的状态、原因和回执编号。')
const exactKeys = (value, keys) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
const findStep = (project, scope, id) => project[scope].flatMap(group => group.steps).find(step => step.id === id)
const last = records => records?.at(-1)

function projectProgress(events, id) {
  const setup = Object.create(null), runs = new Map()
  let revision = 0
  for (const event of events) {
    if (event.project !== id) continue
    revision += 1
    if (event.action === 'start') {
      runs.set(event.requestId, { id: event.requestId, version: event.version, createdAt: event.at, build: null, steps: Object.create(null) })
      continue
    }
    const run = runs.get(event.runId)
    const steps = event.scope === 'setup' ? setup : run?.steps
    if (!steps) continue
    const { at, state, reason, reference } = event
    ;(steps[event.step] ??= []).push({ at, state, reason, reference, source: 'manual' })
    if (event.step === 'upload' && state === 'confirmed' && run) run.build ??= reference
  }
  return { revision, setupProgress: setup, runs: [...runs.values()].reverse() }
}

export class DeliveryWorkflowService {
  constructor({ dataDirectory, now = () => new Date() }) {
    this.now = now
    this.catalog = () => readDeliveryCatalog(dataDirectory).catch(() => { throw fail(503, 'DELIVERY_CATALOG_UNAVAILABLE', '暂时无法读取项目工作流。') })
    this.store = new JsonStore(path.join(dataDirectory, 'ops/delivery-workflow-events.json'), { events: [] })
  }

  #snapshot(catalog, events) {
    return { projects: catalog.projects.map(p => ({ ...p, ...projectProgress(events, p.id) })), observations: catalog.observations, reasons }
  }

  async read() {
    const [catalog, { events }] = await Promise.all([this.catalog(), this.store.read()])
    return this.#snapshot(catalog, events)
  }

  async record(input) {
    const catalog = await this.catalog()
    const project = catalog.projects.find(p => p.id === input?.project)
    if (!project || typeof input.requestId !== 'string' || !operationFormat.test(input.requestId) || !Number.isSafeInteger(input.revision) || input.revision < 0) throw invalid()
    const commonKeys = ['action', 'project', 'requestId', 'revision']
    const base = { action: input.action, project: project.id, requestId: input.requestId }
    let fields
    if (input.action === 'start') {
      if (!exactKeys(input, [...commonKeys, 'version']) || typeof input.version !== 'string' || !versionFormat.test(input.version)) throw invalid()
      fields = { version: input.version }
    } else if (input.action === 'record') {
      if (!exactKeys(input, [...commonKeys, 'scope', 'runId', 'step', 'state', 'reason', 'reference', 'confirmed']) ||
        !['setup', 'release'].includes(input.scope) || !states.includes(input.state) || typeof input.confirmed !== 'boolean' ||
        (input.scope === 'setup' ? input.runId !== null : typeof input.runId !== 'string' || !operationFormat.test(input.runId))) throw invalid()
      const step = findStep(project, input.scope, input.step)
      if (!step || (input.state === 'blocked' ? typeof input.reason !== 'string' || !Object.hasOwn(reasons, input.reason) : input.reason !== null)) throw invalid()
      const format = formats[step.receipt]
      if (input.reference !== null && (!format || typeof input.reference !== 'string' || !format.test(input.reference))) throw invalid()
      if (input.confirmed !== (input.state === 'confirmed') || input.confirmed && format && input.reference === null) throw invalid()
      fields = { scope: input.scope, runId: input.runId, step: step.id, state: input.state, reason: input.reason, reference: input.reference }
    } else throw invalid()
    const requested = { ...base, ...fields }
    const { events } = await this.store.update(data => {
      const replay = data.events.find(event => event.requestId === requested.requestId)
      if (replay) {
        const { at: _, ...previous } = replay
        if (JSON.stringify(previous) !== JSON.stringify(requested)) throw fail(409, 'DELIVERY_REQUEST_CONFLICT', '这次操作已被用于另一条更新，请重新提交。')
        return data
      }
      const progress = projectProgress(data.events, project.id)
      if (input.revision !== progress.revision) throw fail(409, 'DELIVERY_REVISION_CONFLICT', '该项目已有新记录。已重新读取后，请核对再保存。')
      if (input.action === 'start' && progress.runs.length >= 100) throw fail(409, 'DELIVERY_LIMIT', '该项目已有 100 轮交付记录。请先归档再新建。')
      if (input.action === 'record' && fields.scope === 'release') {
        const run = progress.runs.find(r => r.id === fields.runId)
        if (!run) throw invalid()
        const step = findStep(project, fields.scope, fields.step)
        if (fields.reference && step.receipt === 'build' && run.build && fields.reference !== run.build) throw fail(409, 'DELIVERY_BUILD_CONFLICT', '此轮已关联另一个构建号。请核对回执；重打包请新建一轮。')
        const prior = prerequisite[fields.step]
        if (fields.state === 'confirmed' && prior && last(run.steps[prior])?.state !== 'confirmed') throw fail(409, 'DELIVERY_PREREQUISITE', '请先核对同一构建的上一环回执。')
      }
      if (data.events.length >= 5000) throw fail(409, 'DELIVERY_LIMIT', '工作流记录达到存储上限，请先归档。')
      return { events: [...data.events, { ...requested, at: this.now().toISOString() }] }
    })
    return this.#snapshot(catalog, events)
  }
}
