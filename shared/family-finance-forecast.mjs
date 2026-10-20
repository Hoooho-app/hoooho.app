import { availableAsset, financeSummary } from './family-finance.mjs'

export function forecastMonths(data, startMonth, owner = '', count = 6) {
  const [year, month] = startMonth.split('-').map(Number)
  const ownedAssets = data.assets.filter(row => !owner || row.owner === owner)
  let opening = ownedAssets.length ? ownedAssets.filter(availableAsset).reduce((sum, row) => sum + Math.round(row.amount * 100), 0) / 100 : null
  return Array.from({ length: count }, (_, offset) => {
    const date = new Date(Date.UTC(year, month - 1 + offset, 1))
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
    const summary = financeSummary(data, key, owner)
    const change = summary.hasBudget ? summary.plannedDisposable : null
    const closing = opening !== null && change !== null ? (Math.round(opening * 100) + Math.round(change * 100)) / 100 : null
    const result = { month: key, income: summary.hasBudget ? summary.plannedIncome : null, expenses: summary.hasBudget ? summary.plannedExpenses : null, principal: summary.hasBudget ? summary.plannedPrincipal : null, savings: summary.hasBudget ? summary.plannedSavings : null, change, opening, closing }
    opening = closing
    return result
  })
}
