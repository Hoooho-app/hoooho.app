import path from 'node:path'
import { AuthError } from '../auth/auth-service.mjs'
import { JsonStore } from '../auth/storage/json-store.mjs'
import { withStorageLock } from '../auth/storage/transaction.mjs'
import { defaultPolicies, initialPolicy, policyStatuses, policyFrequencies } from '../../shared/family-policies.mjs'

const invalid = message => new AuthError(message, 400, 'FAMILY_POLICY_INVALID')
function text(value, label, max = 1200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw invalid(`${label}不能为空且不能超过 ${max} 字。`)
  return value.trim()
}
function list(value, label, map, max = 12) {
  if (!Array.isArray(value) || !value.length || value.length > max) throw invalid(`${label}需要 1–${max} 项。`)
  return value.map(map)
}
function choice(value, options, label) {
  if (typeof value !== 'string' || !Object.hasOwn(options, value)) throw invalid(`${label}无效。`)
  return value
}
function normalize(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !input.flow || typeof input.flow !== 'object') throw invalid('制度内容无效。')
  const document = {
    title: text(input.title, '制度名称', 60), purpose: text(input.purpose, '制度目标'), status: choice(input.status, policyStatuses, '制度状态'),
    principles: list(input.principles, '基本原则', value => text(value, '基本原则', 100), 6),
    sections: list(input.sections, '制度章节', section => ({ title: text(section?.title, '章节名称', 80), items: list(section?.items, '制度条款', value => text(value, '制度条款'), 12) }), 8),
    flow: Object.fromEntries(['capture', 'check', 'decision', 'routine', 'discuss', 'execute', 'review'].map(key => [key, text(input.flow[key], '流程步骤', 160)])),
    exception: text(input.exception, '例外处理'),
    responsibilities: list(input.responsibilities, '责任分工', row => ({ task: text(row?.task, '任务', 100), owner: text(row?.owner, '负责人', 100), backup: text(row?.backup, '替补人', 100), frequency: choice(row?.frequency, policyFrequencies, '检查频率'), standard: text(row?.standard, '完成标准', 500) }), 16),
    pending: list(input.pending, '待商定事项', value => text(value, '待商定事项', 500), 12)
  }
  if (JSON.stringify(document).length > 60000) throw invalid('制度内容过长，请精简后保存。')
  return document
}

export class FamilyPolicyService {
  constructor(workspace) {
    this.workspace = workspace
    this.store = new JsonStore(path.join(workspace.dataDirectory, 'family-workspace-policies.json'), { records: {} })
  }
  async authorize(raw, moduleId, write = false) {
    const session = await this.workspace.current(raw)
    if (!session) throw new AuthError('请先登录家庭空间。', 401, 'FAMILY_LOGIN_REQUIRED')
    if (write && session.role !== 'admin') throw new AuthError('制度仅管理员可以修改，家人可查看并参与讨论。', 403, 'FAMILY_POLICY_ADMIN_REQUIRED')
    if (!Object.hasOwn(defaultPolicies, moduleId)) throw invalid('制度类目无效。')
    return session
  }
  async read(raw, moduleId) {
    return withStorageLock(async () => {
      await this.authorize(raw, moduleId)
      return (await this.store.read()).records[moduleId] ?? initialPolicy(moduleId)
    })
  }
  async save(raw, moduleId, input) {
    return withStorageLock(async () => {
      const session = await this.authorize(raw, moduleId, true)
      if (!input || !Number.isSafeInteger(input.revision) || input.revision < 0) throw invalid('制度版本无效，请重新载入。')
      const document = normalize(input.document)
      let record
      await this.store.update(state => {
        const previous = state.records[moduleId] ?? initialPolicy(moduleId)
        if (previous.revision !== input.revision) throw new AuthError('本制度已在另一窗口更新。当前填写仍保留，请先复制需要保留的内容，再取消编辑并重新载入。', 409, 'FAMILY_POLICY_CONFLICT')
        record = { moduleId, revision: previous.revision + 1, updatedAt: this.workspace.now(), updatedBy: session.name, document }
        return { ...state, records: { ...state.records, [moduleId]: record } }
      })
      return record
    })
  }
}
