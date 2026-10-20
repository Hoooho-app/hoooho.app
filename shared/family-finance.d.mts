export type Asset = { id: string; name: string; category: string; owner: string; amount: number; valuedAt: string; available: boolean; emergency: boolean; note: string }
export type Debt = { id: string; name: string; category: string; owner: string; balance: number; apr: number | null; monthlyPayment: number | null; creditLimit: number | null; dueDate: string; note: string }
export type Flow = { id: string; name: string; kind: string; pattern?: string; category: string; owner: string; month: string; budget: number | null; actual: number | null; essential: boolean; note: string }
export type Policy = { id: string; name: string; category: string; insured: string; owner: string; insurer: string; premium: number; frequency: string; coverage: number | null; dueDate: string; endDate: string; status: string; policyNumber: string; note: string }
export type Goal = { id: string; name: string; category: string; owner: string; target: number; funded: number; dueDate: string; note: string }
export type FinanceData = { assets: Asset[]; debts: Debt[]; flows: Flow[]; policies: Policy[]; goals: Goal[]; settings: { reserveMonths: number; essentialMonthly: number | null } }
export type FinanceSnapshot = { revision: number; updatedAt: number | null; updatedBy: string; data: FinanceData }
export const assetCategories: Record<string, string>
export const debtCategories: Record<string, string>
export const flowKinds: Record<string, string>
export const flowPatterns: Record<string, string>
export const policyCategories: Record<string, string>
export const premiumPeriods: Record<string, string>
export const goalCategories: Record<string, string>
export function emptyFinanceData(): FinanceData
export function chinaDate(now?: number): string
export function availableAsset(asset: Asset): boolean
export function activePolicy(policy: Policy, date?: string): boolean
export function annualPremium(policy: Policy): number
export function financeSummary(data: FinanceData, month: string, owner?: string, date?: string): {
  totalAssets: number; totalDebts: number; netAssets: number; debtRatio: number | null; liquid: number; reserve: number; reserveTarget: number | null; coverageMonths: number | null;
  fixedExpenses: number; variableExpenses: number; oneoffExpenses: number;
  income: number; expenses: number; principal: number; savings: number; surplus: number; disposable: number; plannedIncome: number; plannedExpenses: number; plannedPrincipal: number; plannedSavings: number; plannedDisposable: number; budgetRemaining: number; savingsRate: number | null; repaymentRatio: number | null;
  annualPremium: number; policyCount: number; hasActual: boolean; hasBudget: boolean; assetCount: number; debtCount: number; owners: string[]
}
