export const assetCategories = { cash: '现金与活期', deposit: '定期与存款', investment: '投资与理财', property: '房产', vehicle: '车辆', equity: '企业与股权', receivable: '应收款', other: '其他资产' }
export const debtCategories = { mortgage: '房贷', car: '车贷', credit: '信用卡欠款', loan: '其他借款', other: '其他负债' }
export const flowKinds = { income: '收入', expense: '生活支出', repayment: '偿还本金', saving: '储蓄与投资配置', transfer: '家庭内部转账' }
export const flowPatterns = { fixed: '固定项', variable: '浮动项', oneoff: '一次性' }
export const policyCategories = { medical: '医疗险', critical: '重疾险', accident: '意外险', life: '寿险', property: '财产险', other: '其他保障' }
export const premiumPeriods = { monthly: '月缴', quarterly: '季缴', annual: '年缴', once: '趸缴 / 一次性' }
export const goalCategories = { emergency: '应急储备', education: '孩子教育', retirement: '养老安排', purchase: '大额购置', other: '其他目标' }
export const emptyFinanceData = () => ({ assets: [], debts: [], flows: [], policies: [], goals: [], settings: { reserveMonths: 6, essentialMonthly: null } })
export const chinaDate = (now = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
const cents = value => Math.round((value ?? 0) * 100)
const sum = (rows, field) => rows.reduce((total, row) => total + cents(row[field]), 0) / 100
export const availableAsset = asset => (asset.category === 'cash' || asset.category === 'deposit') && asset.available
export const activePolicy = (policy, date = chinaDate()) => policy.status === 'active' && (!policy.endDate || policy.endDate >= date)
export const annualPremium = policy => policy.premium * ({ monthly: 12, quarterly: 4, annual: 1, once: 0 }[policy.frequency] ?? 0)

export function financeSummary(data, month, owner = '', date = chinaDate()) {
  const owned = rows => owner ? rows.filter(row => row.owner === owner) : rows
  const assets = owned(data.assets), debts = owned(data.debts)
  const flows = owned(data.flows).filter(row => row.month === month)
  const policies = data.policies.filter(row => (!owner || row.insured === owner) && activePolicy(row, date))
  const byKind = (kind, field) => sum(flows.filter(row => row.kind === kind), field)
  const totalAssets = sum(assets, 'amount'), totalDebts = sum(debts, 'balance')
  const income = byKind('income', 'actual'), expenses = byKind('expense', 'actual'), principal = byKind('repayment', 'actual'), savings = byKind('saving', 'actual')
  const plannedIncome = byKind('income', 'budget'), plannedExpenses = byKind('expense', 'budget'), plannedPrincipal = byKind('repayment', 'budget'), plannedSavings = byKind('saving', 'budget')
  const liquid = sum(assets.filter(availableAsset), 'amount'), reserve = sum(assets.filter(row => availableAsset(row) && row.emergency), 'amount')
  const essential = data.settings.essentialMonthly
  return { totalAssets, totalDebts, netAssets: (cents(totalAssets) - cents(totalDebts)) / 100, debtRatio: totalAssets > 0 ? totalDebts / totalAssets : null,
    liquid, reserve, reserveTarget: essential === null ? null : cents(essential) * data.settings.reserveMonths / 100, coverageMonths: essential > 0 ? reserve / essential : null,
    fixedExpenses: sum(flows.filter(row => row.kind === 'expense' && row.pattern === 'fixed'), 'actual'), variableExpenses: sum(flows.filter(row => row.kind === 'expense' && (!row.pattern || row.pattern === 'variable')), 'actual'), oneoffExpenses: sum(flows.filter(row => row.kind === 'expense' && row.pattern === 'oneoff'), 'actual'),
    income, expenses, principal, savings, surplus: (cents(income) - cents(expenses)) / 100, disposable: (cents(income) - cents(expenses) - cents(principal) - cents(savings)) / 100,
    plannedIncome, plannedExpenses, plannedPrincipal, plannedSavings, plannedDisposable: (cents(plannedIncome) - cents(plannedExpenses) - cents(plannedPrincipal) - cents(plannedSavings)) / 100,
    budgetRemaining: (cents(plannedExpenses) - cents(expenses)) / 100, savingsRate: income > 0 ? (income - expenses) / income : null,
    repaymentRatio: income > 0 ? (principal + sum(flows.filter(row => row.kind === 'expense' && row.category === '借款利息'), 'actual')) / income : null,
    annualPremium: sum(policies.map(row => ({ annual: annualPremium(row) })), 'annual'), policyCount: policies.length,
    hasActual: flows.some(row => row.actual !== null), hasBudget: flows.some(row => row.budget !== null), assetCount: assets.length, debtCount: debts.length,
    owners: [...new Set([...data.assets.map(row => row.owner), ...data.debts.map(row => row.owner), ...data.flows.map(row => row.owner), ...data.policies.map(row => row.insured), ...data.goals.map(row => row.owner)].filter(Boolean))]
  }
}
