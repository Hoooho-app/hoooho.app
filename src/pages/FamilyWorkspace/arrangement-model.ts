import { type ModuleId, type WorkspaceLocation } from './navigation'

export type Arrangement = { id: string; module: ModuleId; page: string; title: string; month: string; startDate: string; endDate: string; status: 'pending' | 'done'; owner: string; note: string }
export type ArrangementSnapshot = { revision: number; updatedAt: number | null; plans: Arrangement[] }
export type CalendarItem = Arrangement & { source?: string; location?: WorkspaceLocation }
export type ArrangementIntent = { key: number; month: string; date?: string; id?: string }
export const arrangementPages: Record<ModuleId, string> = { finances: 'cashflow', assets: 'liabilities', legal: 'tax', schedule: 'tasks', home: 'maintenance', health: 'appointments', education: 'activities', safety: 'checks', governance: 'meetings' }

export const chinaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
export const monthTitle = (month: string) => `${Number(month.slice(0, 4))} 年 ${Number(month.slice(5, 7))} 月`
export function moveMonth(month: string, amount: number) {
  const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + amount, 1))
  return date.toISOString().slice(0, 7)
}
export function calendarDays(month: string) {
  const [year, number] = month.split('-').map(Number)
  const first = new Date(Date.UTC(year, number - 1, 1))
  const offset = (first.getUTCDay() + 6) % 7
  const count = new Date(Date.UTC(year, number, 0)).getUTCDate()
  return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, index) => new Date(Date.UTC(year, number - 1, index - offset + 1)).toISOString().slice(0, 10))
}
export const inMonth = (item: CalendarItem, month: string) => item.startDate ? item.startDate <= `${month}-31` && (item.endDate || item.startDate) >= `${month}-01` : item.month === month
export const onDate = (item: CalendarItem, date: string) => Boolean(item.startDate && item.startDate <= date && (item.endDate || item.startDate) >= date)
export const arrangementDate = (item: CalendarItem) => !item.startDate ? '本月内 · 日期待定' : item.endDate && item.endDate !== item.startDate ? `${item.startDate.slice(5).replace('-', '/')}–${item.endDate.slice(5).replace('-', '/')}` : item.startDate.slice(5).replace('-', '/')

type SourceRow = { id: string; name: string; dueDate?: string; endDate?: string; status?: string; month?: string; budget?: number | null; actual?: number | null; owner?: string; note?: string; balance?: number }
export function financeCalendarItems(data: { debts: SourceRow[]; policies: SourceRow[]; goals: SourceRow[]; flows: SourceRow[] }): CalendarItem[] {
  const item = (row: SourceRow, kind: string, title: string, location: WorkspaceLocation, date = row.dueDate || ''): CalendarItem => ({ id: `finance-${kind}-${row.id}`, module: location.module as ModuleId, page: location.page, title: `${row.name} · ${title}`, month: (date || row.month || '').slice(0, 7), startDate: date, endDate: date, status: 'pending', owner: row.owner || '', note: row.note || '', source: '财务资料', location })
  return [
    ...data.debts.filter(row => row.dueDate && (row.balance ?? 0) > 0).map(row => item(row, 'debt', '还款', { module: 'finances', page: 'perspective', section: 'balance' })),
    ...data.policies.filter(row => row.dueDate && row.status === 'active').map(row => item(row, 'policy', '续费', { module: 'safety', page: 'insurance', section: 'insurance' })),
    ...data.goals.filter(row => row.dueDate).map(row => item(row, 'goal', '目标到期', { module: 'finances', page: 'perspective', section: 'goals' })),
    ...data.flows.filter(row => row.budget != null && row.actual == null).map(row => item(row, 'flow', '月度计划', { module: 'finances', page: 'budget', section: 'monthly' }, ''))
  ]
}
