import { Check, UserRound } from 'lucide-react'

export interface BodyLocationGroup {
  label: string
  options: string[]
  view?: 'front' | 'back' | 'internal'
}

export function BodyLocationPicker({
  label,
  groups,
  values,
  onChange
}: {
  label: string
  groups: BodyLocationGroup[]
  values: string[]
  onChange: (values: string[]) => void
}) {
  const toggle = (location: string) => onChange(values.includes(location) ? values.filter((item) => item !== location) : [...values, location])
  const hasView = (view: BodyLocationGroup['view']) => groups.some((group) => group.view === view && group.options.some((item) => values.includes(item)))

  return <fieldset className="grid gap-3"><legend className="hoho-text-label mb-2">{label}</legend>
    <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-3 rounded-control border bg-background p-3">
      <div className="grid content-start gap-2" aria-label="身体部位定位示意">
        {(['front', 'back', 'internal'] as const).filter((view) => groups.some((group) => group.view === view)).map((view) => <div className={`grid min-h-24 place-items-center rounded-control border ${hasView(view) ? 'border-primary bg-primary-soft text-primary' : 'bg-surface text-text-weak'}`} key={view}><UserRound className={view === 'back' ? 'scale-x-[-1]' : ''} size={43} strokeWidth={1.2} /><span className="text-xs">{view === 'front' ? '正面' : view === 'back' ? '背面' : '内部'}</span></div>)}
      </div>
      <div className="min-w-0 space-y-4">{groups.map((group) => <div className="grid gap-2" key={group.label}><span className="text-xs font-medium text-text-secondary">{group.label}</span><div className="flex flex-wrap gap-2">{group.options.map((location) => { const selected = values.includes(location); return <button aria-pressed={selected} className={`inline-flex min-h-10 items-center gap-1 rounded-control border px-2.5 text-xs ${selected ? 'border-primary bg-primary-soft font-semibold text-primary' : 'bg-surface text-text-secondary'}`} key={location} onClick={() => toggle(location)} type="button">{location}{selected && <Check size={13} />}</button> })}</div></div>)}</div>
    </div>
    <div className="flex min-h-11 items-center justify-between gap-3 rounded-control bg-background px-3"><span className="min-w-0 text-xs text-text-secondary">已选择：{values.length ? values.join('、') : '未选择'}</span>{values.length > 0 && <button className="shrink-0 text-xs font-medium text-primary" onClick={() => onChange([])} type="button">清除选择</button>}</div>
  </fieldset>
}
