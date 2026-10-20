import path from 'node:path'
import { AuthError } from '../auth/auth-service.mjs'
import { JsonStore } from '../auth/storage/json-store.mjs'
import { withStorageLock } from '../auth/storage/transaction.mjs'
import { assetCategories, debtCategories, flowKinds, flowPatterns, policyCategories, premiumPeriods, goalCategories, emptyFinanceData, availableAsset } from '../../shared/family-finance.mjs'

const invalid = message => new AuthError(message, 400, 'FAMILY_FINANCE_INVALID')
const text = (value, label, required = false, max = 120) => {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) || (required && !value.trim())) throw invalid(`${label}填写不正确。`)
  return value.trim()
}
const money = (value, label, optional = false, max = 1e10) => {
  if (value === null && optional) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max || Math.abs(value * 100 - Math.round(value * 100)) > 0.0001) throw invalid(`${label}须为 0–${max} 的金额，最多两位小数。`)
  return Math.round(value * 100) / 100
}
const choice = (value, options, label) => {
  if (typeof value !== 'string' || !Object.hasOwn(options, value)) throw invalid(`${label}无效。`)
  return value
}
const date = (value, label, optional = true) => {
  if (value === '' && optional) return ''
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !value.startsWith('20') || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw invalid(`${label}须为有效日期（2000–2099）。`)
  return value
}
const flag = (value, label) => { if (typeof value !== 'boolean') throw invalid(`${label}无效。`); return value }
const base = row => {
  if (!row || typeof row !== 'object' || Array.isArray(row) || typeof row.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(row.id)) throw invalid('记录编号无效。')
  return { id: row.id, name: text(row.name, '名称', true), owner: text(row.owner, '归属成员', true, 40), note: text(row.note, '备注', false, 2000) }
}
function normalize(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('财务资料无效。')
  const list = (key, transform) => {
    if (!Array.isArray(input[key]) || input[key].length > (key === 'flows' ? 2000 : 500)) throw invalid('记录数量超出上限，请按年度整理资料。')
    const rows = input[key].map(transform)
    if (new Set(rows.map(row => row.id)).size !== rows.length) throw invalid('记录编号重复。')
    return rows
  }
  const assets = list('assets', row => {
    const result = { ...base(row), category: choice(row.category, assetCategories, '资产类别'), amount: money(row.amount, '资产金额'), valuedAt: date(row.valuedAt, '估值日期', false), available: flag(row.available, '随时可取标记'), emergency: flag(row.emergency, '应急储备标记') }
    if (result.available && !['cash', 'deposit'].includes(result.category)) throw invalid('仅现金和存款可标记为随时可取。')
    if (result.emergency && !availableAsset(result)) throw invalid('应急储备必须是随时可取的现金或存款。')
    return result
  })
  const debts = list('debts', row => ({ ...base(row), category: choice(row.category, debtCategories, '负债类别'), balance: money(row.balance, '剩余欠款'), apr: money(row.apr, '年化利率', true, 100), monthlyPayment: money(row.monthlyPayment, '每期应还', true), creditLimit: money(row.creditLimit, '授信额度', true), dueDate: date(row.dueDate, '下次还款日') }))
  const flows = list('flows', row => {
    if (typeof row.month !== 'string' || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(row.month)) throw invalid('请选择有效月份。')
    const result = { ...base(row), kind: choice(row.kind, flowKinds, '收支类型'), pattern: choice(row.pattern ?? 'variable', flowPatterns, '发生性质'), category: text(row.category, '收支分类', true, 60), month: row.month, budget: money(row.budget, '计划金额', true), actual: money(row.actual, '实际金额', true), essential: flag(row.essential, '必要开支标记') }
    if (result.budget === null && result.actual === null) throw invalid('计划金额或实际金额至少填写一项。')
    return result
  })
  const policies = list('policies', row => ({ ...base(row), category: choice(row.category, policyCategories, '保险类型'), insured: text(row.insured, '被保人', true, 40), insurer: text(row.insurer, '保险公司'), premium: money(row.premium, '每期保费'), frequency: choice(row.frequency, premiumPeriods, '缴费周期'), coverage: money(row.coverage, '保额', true), dueDate: date(row.dueDate, '续费日期'), endDate: date(row.endDate, '保障到期日'), status: choice(row.status, { active: 1, expired: 1, cancelled: 1 }, '保单状态'), policyNumber: text(row.policyNumber, '保单编号', false, 100) }))
  const goals = list('goals', row => {
    const result = { ...base(row), category: choice(row.category, goalCategories, '目标类型'), target: money(row.target, '目标金额'), funded: money(row.funded, '已备金额'), dueDate: date(row.dueDate, '目标日期') }
    if (result.target <= 0) throw invalid('目标金额须大于 0。')
    return result
  })
  const settings = input.settings
  if (!settings || !Number.isInteger(settings.reserveMonths) || settings.reserveMonths < 1 || settings.reserveMonths > 120) throw invalid('储备目标月数须为 1–120 的整数。')
  return { assets, debts, flows, policies, goals, settings: { reserveMonths: settings.reserveMonths, essentialMonthly: money(settings.essentialMonthly, '每月必要开支基线', true) } }
}

export class FamilyFinanceService {
  constructor(workspace) {
    this.workspace = workspace
    this.store = new JsonStore(path.join(workspace.dataDirectory, 'family-workspace-finance.json'), { revision: 0, updatedAt: null, updatedBy: '', data: emptyFinanceData() })
  }
  async authorize(raw, write = false) {
    const session = await this.workspace.current(raw)
    if (!session) throw new AuthError('请先登录家庭空间。', 401, 'FAMILY_LOGIN_REQUIRED')
    if (write && session.role !== 'admin') throw new AuthError('财务资料目前仅管理员可以修改，家人可查看。', 403, 'FAMILY_FINANCE_ADMIN_REQUIRED')
    return session
  }
  async read(raw) { return withStorageLock(async () => { await this.authorize(raw); return this.store.read() }) }
  async save(raw, input) {
    return withStorageLock(async () => {
      const session = await this.authorize(raw, true)
      if (!input || !Number.isSafeInteger(input.revision) || input.revision < 0) throw invalid('资料版本无效，请重新载入。')
      const data = normalize(input.data)
      return this.store.update(previous => {
        if (previous.revision !== input.revision) throw new AuthError('资料已在另一窗口更新。请保留当前内容，关闭编辑后重新载入，再进行修改。', 409, 'FAMILY_FINANCE_CONFLICT')
        return { revision: previous.revision + 1, updatedAt: this.workspace.now(), updatedBy: session.name, data }
      })
    })
  }
}
