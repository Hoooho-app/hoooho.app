import type { FinanceData } from './family-finance.mjs'
export function forecastMonths(data: FinanceData, startMonth: string, owner?: string, count?: number): { month: string; income: number | null; expenses: number | null; principal: number | null; savings: number | null; change: number | null; opening: number | null; closing: number | null }[]
