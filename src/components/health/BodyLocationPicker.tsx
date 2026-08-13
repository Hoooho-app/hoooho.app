import { ArrowLeft, Check, Footprints, Hand, HeartPulse, PersonStanding, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { BottomSheetSurface, HohoButton } from '../design-system'
import {
  getBodyLocationRegions,
  searchBodyLocations,
  toBodyLocationSelection,
  type BodyLocationMember,
  type BodyLocationOption,
  type BodyLocationRegion,
  type BodyLocationSelection
} from '../../features/body-location'

export interface BodyLocationPickerProps {
  label?: string
  member?: BodyLocationMember
  value: BodyLocationSelection[]
  onChange: (value: BodyLocationSelection[]) => void
}

const iconForRegion = (region: BodyLocationRegion) => {
  if (region.diagram === 'hand') return Hand
  if (region.diagram === 'foot') return Footprints
  if (region.diagram === 'organ') return HeartPulse
  return PersonStanding
}

function BodyRegionDiagram({ region, selectedIds, onToggle }: { region: BodyLocationRegion; selectedIds: Set<string>; onToggle: (item: BodyLocationOption) => void }) {
  if (region.diagram === 'abdomen') {
    return <svg aria-label="腹部九区位置示意" className="h-auto w-full" role="img" viewBox="0 0 320 230">
      <path d="M94 26c18 15 114 15 132 0 2 29 22 35 28 60 7 30 8 73 0 112-29 14-159 14-188 0-8-39-7-82 0-112 6-25 26-31 28-60Z" fill="rgb(var(--hoho-color-background))" stroke="rgb(var(--hoho-color-border))" strokeWidth="2" />
      {region.options.map((item, index) => { const col = index % 3; const row = Math.floor(index / 3); const x = 82 + col * 52; const y = 62 + row * 44; const selected = selectedIds.has(item.id); return <g className="cursor-pointer outline-none" key={item.id} onClick={() => onToggle(item)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onToggle(item) } }} role="button" tabIndex={0}>
        <rect aria-hidden="true" fill={selected ? 'rgb(var(--hoho-color-primary) / 0.18)' : 'rgb(var(--hoho-color-surface))'} height="40" rx="6" stroke={selected ? 'rgb(var(--hoho-color-primary))' : 'rgb(var(--hoho-color-border))'} width="48" x={x} y={y} />
        <text fill={selected ? 'rgb(var(--hoho-color-primary))' : 'rgb(var(--hoho-color-text-secondary))'} fontSize="9" fontWeight={selected ? 700 : 500} textAnchor="middle" x={x + 24} y={y + 24}>{item.label}</text>
      </g> })}
    </svg>
  }

  const active = region.options.some((item) => selectedIds.has(item.id))
  const highlight: Record<BodyLocationRegion['diagram'], { x: number; y: number; width: number; height: number }> = {
    head: { x: 116, y: 24, width: 48, height: 50 }, neck: { x: 128, y: 70, width: 24, height: 22 }, torso: { x: 99, y: 92, width: 82, height: 54 }, abdomen: { x: 99, y: 144, width: 82, height: 58 }, back: { x: 99, y: 92, width: 82, height: 110 }, pelvis: { x: 105, y: 188, width: 70, height: 38 }, 'upper-limb': { x: 55, y: 92, width: 170, height: 92 }, hand: { x: 40, y: 170, width: 200, height: 36 }, 'lower-limb': { x: 104, y: 218, width: 72, height: 90 }, foot: { x: 90, y: 292, width: 100, height: 26 }, organ: { x: 107, y: 102, width: 66, height: 94 }
  }
  const zone = highlight[region.diagram]
  return <svg aria-label={`${region.label}区域示意`} className="h-56 w-full" role="img" viewBox="0 0 280 330">
    <circle cx="140" cy="48" fill="rgb(var(--hoho-color-surface))" r="28" stroke="rgb(var(--hoho-color-border))" strokeWidth="2" />
    <path d="M118 80c-17 8-29 20-36 45l-22 73c-3 12 15 17 20 5l22-60v61l-11 96h28l21-88 21 88h28l-11-96v-61l22 60c5 12 23 7 20-5l-22-73c-7-25-19-37-36-45-14 8-30 8-44 0Z" fill="rgb(var(--hoho-color-surface))" stroke="rgb(var(--hoho-color-border))" strokeLinejoin="round" strokeWidth="2" />
    <rect fill={active ? 'rgb(var(--hoho-color-primary) / 0.22)' : 'rgb(var(--hoho-color-primary) / 0.06)'} height={zone.height} rx="18" stroke={active ? 'rgb(var(--hoho-color-primary))' : 'rgb(var(--hoho-color-border))'} strokeWidth="1.5" width={zone.width} x={zone.x} y={zone.y} />
    {region.diagram === 'organ' && <g fill="rgb(var(--hoho-color-primary) / 0.22)" stroke="rgb(var(--hoho-color-primary))" strokeWidth="1.2"><ellipse cx="128" cy="128" rx="14" ry="24" /><ellipse cx="152" cy="128" rx="14" ry="24" /><path d="M140 116c-12-13-27 4 0 21 27-17 12-34 0-21Z" /><ellipse cx="140" cy="170" rx="26" ry="19" /></g>}
    <text fill="rgb(var(--hoho-color-text-secondary))" fontSize="12" textAnchor="middle" x="140" y="322">位置仅作区域表达，不代表医学判断</text>
  </svg>
}

function SelectionChips({ values, onRemove }: { values: BodyLocationSelection[]; onRemove: (id: string) => void }) {
  if (!values.length) return <span className="text-xs text-text-weak">尚未选择</span>
  return <div className="flex flex-wrap gap-2">{values.map((item) => <span className="inline-flex min-h-9 items-center gap-1.5 rounded-pill border border-primary/30 bg-primary-soft px-3 text-xs font-medium text-primary" key={item.id}>{item.label}<button aria-label={`移除${item.label}`} className="grid h-6 w-6 place-items-center rounded-full" onClick={() => onRemove(item.id)} type="button"><X size={14} /></button></span>)}</div>
}

export function BodyLocationPicker({ label = '身体部位（可多选）', member, value, onChange }: BodyLocationPickerProps) {
  const [open, setOpen] = useState(false)
  const [activeRegionId, setActiveRegionId] = useState('')
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<BodyLocationSelection[]>([])
  const regions = useMemo(() => getBodyLocationRegions(member), [member])
  const activeRegion = regions.find((region) => region.id === activeRegionId)
  const searchResults = useMemo(() => searchBodyLocations(query, member), [member, query])
  const selectedIds = useMemo(() => new Set(draft.map((item) => item.id)), [draft])
  const toggle = (item: BodyLocationOption) => setDraft((current) => current.some((selection) => selection.id === item.id) ? current.filter((selection) => selection.id !== item.id) : [...current, toBodyLocationSelection(item)])
  const beginEditing = () => { setDraft(value); setActiveRegionId(''); setQuery(''); setOpen(true) }
  const close = () => { setOpen(false); setActiveRegionId(''); setQuery('') }
  const confirm = () => { onChange(draft); close() }
  const removeCommitted = (id: string) => onChange(value.filter((item) => item.id !== id))

  return <fieldset className="min-w-0"><legend className="hoho-text-label mb-2">{label}</legend>
    <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-control border bg-background p-3">
      <SelectionChips onRemove={removeCommitted} values={value} />
      <button className="inline-flex min-h-10 items-center gap-1 rounded-control border border-dashed border-primary/55 bg-surface px-3 text-xs font-semibold text-primary" onClick={beginEditing} type="button">{value.length ? '修改位置' : '+ 选择位置'}</button>
    </div>
    <BottomSheetSurface className="body-location-sheet max-h-[min(88dvh,760px)]" footer={<div className="grid gap-2"><div aria-live="polite" className="flex max-h-20 min-h-9 items-start gap-2 overflow-y-auto"><span className="mt-2 shrink-0 text-xs text-text-secondary">已选择</span><SelectionChips onRemove={(id) => setDraft((current) => current.filter((item) => item.id !== id))} values={draft} /></div><HohoButton onClick={confirm} type="button"><Check size={17} />确认{draft.length ? `（${draft.length}）` : ''}</HohoButton></div>} label="身体部位定位器" navigation={activeRegion ? <div className="flex items-center justify-between"><button className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-primary" onClick={() => setActiveRegionId('')} type="button"><ArrowLeft size={18} />返回</button><button className="min-h-10 text-sm font-medium text-primary" onClick={() => setDraft((current) => current.filter((item) => item.parentId !== activeRegion.id))} type="button">清空本区域</button></div> : undefined} onClose={close} open={open} title={activeRegion?.label ?? '选择身体部位'}>
      {activeRegion ? <div className="grid gap-4">
        <p className="text-sm text-text-secondary">{activeRegion.description}</p>
        <div className="overflow-hidden rounded-card border bg-background p-3"><BodyRegionDiagram onToggle={toggle} region={activeRegion} selectedIds={selectedIds} /></div>
        <div className="flex flex-wrap gap-2" role="group" aria-label={`${activeRegion.label}细分位置`}>{activeRegion.options.map((item) => { const selected = selectedIds.has(item.id); return <button aria-pressed={selected} className={`inline-flex min-h-11 items-center gap-1.5 rounded-control border px-3 text-sm ${selected ? 'border-primary bg-primary-soft font-semibold text-primary' : 'bg-surface text-text-secondary'}`} key={item.id} onClick={() => toggle(item)} type="button">{item.label}{selected && <Check size={14} />}</button> })}</div>
      </div> : <div className="grid gap-5">
        <label className="relative block"><span className="sr-only">搜索部位</span><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-weak" size={18} /><input className="hoho-input pl-10" placeholder="搜索膝、手掌、太阳穴、胆囊、腰…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        {query.trim() ? <section className="grid gap-2"><h3 className="hoho-text-label">搜索结果</h3>{searchResults.length ? <div className="flex flex-wrap gap-2">{searchResults.map((item) => { const selected = selectedIds.has(item.id); return <button aria-pressed={selected} className={`inline-flex min-h-11 items-center gap-1.5 rounded-control border px-3 text-sm ${selected ? 'border-primary bg-primary-soft font-semibold text-primary' : 'bg-surface text-text-secondary'}`} key={item.id} onClick={() => toggle(item)} type="button">{item.label}{selected && <Check size={14} />}</button> })}</div> : <p className="rounded-control bg-background p-4 text-sm text-text-secondary">没有找到相关部位，请返回区域列表选择。</p>}</section> : <section className="grid gap-3"><h3 className="hoho-text-label">常用部位与系统</h3><div className="grid grid-cols-3 gap-2">{regions.map((region) => { const Icon = iconForRegion(region); const count = draft.filter((item) => item.parentId === region.id).length; return <button className="relative grid min-h-24 place-items-center gap-1 rounded-control border bg-surface p-2 text-center text-sm font-medium text-text-primary" key={region.id} onClick={() => setActiveRegionId(region.id)} type="button"><span className="grid h-9 w-9 place-items-center rounded-full bg-primary-soft text-primary"><Icon size={19} strokeWidth={1.6} /></span><span>{region.shortLabel ?? region.label}</span>{count > 0 && <span className="absolute right-2 top-2 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-surface">{count}</span>}</button> })}</div></section>}
      </div>}
    </BottomSheetSurface>
  </fieldset>
}
