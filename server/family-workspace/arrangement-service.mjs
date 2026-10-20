import path from 'node:path'
import { AuthError } from '../auth/auth-service.mjs'
import { JsonStore } from '../auth/storage/json-store.mjs'
import { withStorageLock } from '../auth/storage/transaction.mjs'

const modules = new Set(['finances', 'assets', 'legal', 'schedule', 'home', 'health', 'education', 'safety', 'governance'])
const invalid = message => new AuthError(message, 400, 'FAMILY_ARRANGEMENT_INVALID')
const text = (value, label, limit, required = false) => {
  if (typeof value !== 'string' || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) || (required && !value.trim())) throw invalid(`${label}填写不正确。`)
  return value.trim()
}
const validDate = value => typeof value === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
function normalize(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan) || typeof plan.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(plan.id)) throw invalid('安排编号无效。')
  if (!modules.has(plan.module) || typeof plan.page !== 'string' || !/^[a-z][a-z-]{0,39}$/.test(plan.page)) throw invalid('所属页面无效。')
  if (typeof plan.month !== 'string' || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(plan.month)) throw invalid('请选择有效月份（2000–2099）。')
  if (plan.startDate !== '' && !validDate(plan.startDate)) throw invalid('开始日期无效。')
  if (plan.endDate !== '' && !validDate(plan.endDate)) throw invalid('结束日期无效。')
  if ((!plan.startDate && plan.endDate) || (plan.startDate && (plan.startDate.slice(0, 7) !== plan.month || (plan.endDate && plan.endDate < plan.startDate)))) throw invalid('日期范围与安排月份不一致。')
  if (!['pending', 'done'].includes(plan.status)) throw invalid('安排状态无效。')
  return { id: plan.id, module: plan.module, page: plan.page, title: text(plan.title, '安排名称', 120, true), month: plan.month, startDate: plan.startDate, endDate: plan.startDate ? plan.endDate || plan.startDate : '', status: plan.status, owner: text(plan.owner, '负责人', 40), note: text(plan.note, '备注', 2000) }
}

export class FamilyArrangementService {
  constructor(workspace) {
    this.workspace = workspace
    this.store = new JsonStore(path.join(workspace.dataDirectory, 'family-workspace-arrangements.json'), { revision: 0, updatedAt: null, plans: [] })
  }
  async authorize(raw, write = false) {
    const session = await this.workspace.current(raw)
    if (!session) throw new AuthError('请先登录家庭空间。', 401, 'FAMILY_LOGIN_REQUIRED')
    if (write && session.role !== 'admin') throw new AuthError('安排目前仅管理员可以修改，家人可查看。', 403, 'FAMILY_ARRANGEMENT_ADMIN_REQUIRED')
    return session
  }
  async read(raw) { return withStorageLock(async () => { await this.authorize(raw); return this.store.read() }) }
  async save(raw, input) {
    return withStorageLock(async () => {
      await this.authorize(raw, true)
      if (!input || !Number.isSafeInteger(input.revision) || input.revision < 0) throw invalid('资料版本无效，请重新载入。')
      const deleting = input.action === 'delete'
      if (input.action !== 'save' && !deleting) throw invalid('操作无效。')
      const plan = deleting ? undefined : normalize(input.plan)
      if (deleting && (typeof input.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(input.id))) throw invalid('安排编号无效。')
      return this.store.update(previous => {
        if (previous.revision !== input.revision) throw new AuthError('安排已在另一窗口更新。请重新载入最新安排后再保存，当前填写内容会保留。', 409, 'FAMILY_ARRANGEMENT_CONFLICT')
        const plans = [...previous.plans], index = plans.findIndex(row => row.id === (plan?.id ?? input.id))
        if (deleting) {
          if (index < 0) throw invalid('这项安排已不存在，请重新载入。')
          plans.splice(index, 1)
        } else if (index >= 0) plans[index] = plan
        else {
          if (plans.length >= 2000) throw invalid('安排数量已达上限，请先整理旧安排。')
          plans.push(plan)
        }
        return { revision: previous.revision + 1, updatedAt: this.workspace.now(), plans }
      })
    })
  }
}
