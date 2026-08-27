import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { usePageScrollLock } from '../../hooks/usePageScrollLock'
import type { HealthEventCategory, HealthEventStage } from '../../types'
import { Button } from '../common'

export type EventRangeFilter = 'all' | '7d' | '30d' | 'year' | 'custom'

export interface HealthEventFilters {
  range: EventRangeFilter
  year: number | null
  months: number[]
  statuses: HealthEventStage[]
  categories: HealthEventCategory[]
  customStart: string
  customEnd: string
}

export const emptyHealthEventFilters: HealthEventFilters = {
  range: 'all',
  year: null,
  months: [],
  statuses: [],
  categories: [],
  customStart: '',
  customEnd: ''
}

interface Props {
  open: boolean
  filters: HealthEventFilters
  years: number[]
  onClose: () => void
  onApply: (filters: HealthEventFilters) => void
}

const ranges: Array<[EventRangeFilter, string]> = [['all', '全部'], ['7d', '最近7天'], ['30d', '最近30天'], ['year', '今年'], ['custom', '自定义']]
const statuses: Array<[HealthEventStage, string]> = [['observing', '观察中'], ['recovered', '已康复']]
const categories: Array<[HealthEventCategory, string]> = [['fever', '发烧'], ['cough', '咳嗽'], ['pain', '疼痛'], ['injury', '外伤'], ['allergy', '过敏'], ['other', '其他']]

function ChoiceButton({ active, children, onClick }: { active: boolean; children: string; onClick: () => void }) {
  return (
    <button className={`min-h-9 rounded-control border px-3 text-xs font-medium transition ${active ? 'border-primary bg-primary text-surface' : 'bg-surface text-text-primary'}`} type="button" onClick={onClick}>
      {children}
    </button>
  )
}

export function HealthEventFilterSheet({ open, filters, years, onClose, onApply }: Props) {
  const [draft, setDraft] = useState(filters)
  usePageScrollLock(open)

  useEffect(() => {
    if (open) setDraft(filters)
  }, [filters, open])

  if (!open) return null

  const toggleMonth = (month: number) => setDraft((current) => ({
    ...current,
    months: current.months.includes(month) ? current.months.filter((item) => item !== month) : [...current.months, month]
  }))
  const toggleStatus = (status: HealthEventStage) => setDraft((current) => ({
    ...current,
    statuses: current.statuses.includes(status) ? current.statuses.filter((item) => item !== status) : [...current.statuses, status]
  }))
  const toggleCategory = (category: HealthEventCategory) => setDraft((current) => ({
    ...current,
    categories: current.categories.includes(category) ? current.categories.filter((item) => item !== category) : [...current.categories, category]
  }))

  return (
    <div className="health-events-filter-layer fixed inset-0 z-50 mx-auto w-full" role="dialog" aria-modal="true" aria-label="健康事件筛选">
      <button className="absolute inset-0 bg-text-primary/40" aria-label="关闭筛选" type="button" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 flex w-[84%] max-w-[338px] flex-col overflow-y-auto bg-surface px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-[max(18px,env(safe-area-inset-top))] shadow-floating">
        <header className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">筛选</h2>
          <button className="grid h-10 w-10 place-items-center rounded-full hover:bg-primary-soft" aria-label="关闭" type="button" onClick={onClose}><X size={22} /></button>
        </header>

        <div className="mt-5 space-y-6">
          <section>
            <h3 className="text-sm font-semibold">时间范围</h3>
            <div className="mt-3 flex flex-wrap gap-2">{ranges.map(([value, label]) => <ChoiceButton active={draft.range === value} key={value} onClick={() => setDraft((current) => ({ ...current, range: value }))}>{label}</ChoiceButton>)}</div>
            {draft.range === 'custom' && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <input aria-label="开始日期" className="min-h-10 min-w-0 rounded-control border px-2 text-xs" type="date" value={draft.customStart} onChange={(event) => setDraft((current) => ({ ...current, customStart: event.target.value }))} />
                <input aria-label="结束日期" className="min-h-10 min-w-0 rounded-control border px-2 text-xs" type="date" value={draft.customEnd} onChange={(event) => setDraft((current) => ({ ...current, customEnd: event.target.value }))} />
              </div>
            )}
          </section>

          <section>
            <h3 className="text-sm font-semibold">选择年份</h3>
            <select aria-label="选择年份" className="mt-3 min-h-11 w-full rounded-control border bg-surface px-3 text-sm" value={draft.year ?? ''} onChange={(event) => setDraft((current) => ({ ...current, year: event.target.value ? Number(event.target.value) : null }))}>
              <option value="">全部年份</option>
              {years.map((year) => <option value={year} key={year}>{year}年</option>)}
            </select>
          </section>

          <section>
            <h3 className="text-sm font-semibold">选择月份</h3>
            <div className="mt-3 grid grid-cols-4 gap-2">
              <ChoiceButton active={draft.months.length === 0} onClick={() => setDraft((current) => ({ ...current, months: [] }))}>全部</ChoiceButton>
              {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => <ChoiceButton active={draft.months.includes(month)} key={month} onClick={() => toggleMonth(month)}>{`${month}月`}</ChoiceButton>)}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold">事件状态</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              <ChoiceButton active={draft.statuses.length === 0} onClick={() => setDraft((current) => ({ ...current, statuses: [] }))}>全部</ChoiceButton>
              {statuses.map(([value, label]) => <ChoiceButton active={draft.statuses.includes(value)} key={value} onClick={() => toggleStatus(value)}>{label}</ChoiceButton>)}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold">事件类型</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              <ChoiceButton active={draft.categories.length === 0} onClick={() => setDraft((current) => ({ ...current, categories: [] }))}>全部</ChoiceButton>
              {categories.map(([value, label]) => <ChoiceButton active={draft.categories.includes(value)} key={value} onClick={() => toggleCategory(value)}>{label}</ChoiceButton>)}
            </div>
          </section>
        </div>

        <div className="mt-auto grid gap-2 pt-7">
          <Button fullWidth type="button" onClick={() => setDraft(emptyHealthEventFilters)}>重置</Button>
          <Button fullWidth variant="secondary" type="button" onClick={() => { onApply(draft); onClose() }}>确定</Button>
        </div>
      </aside>
    </div>
  )
}
