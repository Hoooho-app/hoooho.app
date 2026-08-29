import { Activity, ArrowLeft, Bone, Brain, Check, Footprints, Hand, HeartPulse, PersonStanding, ScanLine, Search, ShieldPlus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { BottomSheetSurface, HohoButton } from '../design-system'
import {
  getBodyLocationRegions,
  searchBodyLocations,
  toBodyLocationSelection,
  type BodyLocationLaterality,
  type BodyLocationMember,
  type BodyLocationOption,
  type BodyLocationRegion,
  type BodyLocationSelection,
  type BodyLocationView
} from '../../features/body-location'
import { AtlasSelectionCount, BodyLocationAtlas } from './body-location/BodyLocationAtlas'

export interface BodyLocationPickerProps {
  buttonLabel?: string
  compact?: boolean
  inputLike?: boolean
  label?: string
  member?: BodyLocationMember
  showEmptyState?: boolean
  value: BodyLocationSelection[]
  onChange: (value: BodyLocationSelection[]) => void
}

const iconForRegion = (region: BodyLocationRegion) => {
  const icons: Record<string, typeof PersonStanding> = {
    head: Brain,
    neck: Activity,
    chest: ShieldPlus,
    abdomen: ScanLine,
    back: Bone,
    waist_pelvis: Bone,
    upper_limb: Activity,
    hand: Hand,
    lower_limb: PersonStanding,
    foot: Footprints,
    pelvis_perineum: PersonStanding,
    internal_organs: HeartPulse
  }
  return icons[region.id] ?? PersonStanding
}

function SelectionChips({ values, onRemove, compact = false, showEmptyState = true }: { values: BodyLocationSelection[]; onRemove: (id: string) => void; compact?: boolean; showEmptyState?: boolean }) {
  if (!values.length) return showEmptyState ? <span className="text-xs text-text-weak">尚未选择</span> : null
  return <div className={compact ? 'body-location-selection-strip' : 'flex flex-wrap gap-2'}>{values.map((item) => <span className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-pill border border-primary/30 bg-primary-soft px-2.5 text-xs font-medium text-primary" key={item.id}>{item.label}<button aria-label={`移除${item.label}`} className="grid h-6 w-6 place-items-center rounded-full" onClick={() => onRemove(item.id)} type="button"><X size={13} /></button></span>)}</div>
}

function SegmentControl({ label, value, options, onChange }: { label: string; value: string; options: readonly { id: string; label: string }[]; onChange: (value: string) => void }) {
  if (options.length < 2) return null
  return <div aria-label={label} className="body-location-segments" role="group">{options.map((item) => <button aria-pressed={item.id === value} data-selected={item.id === value} key={item.id} onClick={() => onChange(item.id)} type="button">{item.label}</button>)}</div>
}

function OptionGrid({ options, selectedIds, onToggle }: { options: readonly BodyLocationOption[]; selectedIds: Set<string>; onToggle: (item: BodyLocationOption) => void }) {
  return <div className="grid grid-cols-2 gap-2" role="group" aria-label="可选位置">{options.map((item) => {
    const selected = selectedIds.has(item.id)
    return <button aria-pressed={selected} className={`inline-flex min-h-11 items-center justify-between gap-2 rounded-control border px-3 text-left text-sm ${selected ? 'border-primary bg-primary-soft font-semibold text-primary' : 'bg-surface text-text-secondary'}`} key={item.id} onClick={() => onToggle(item)} type="button"><span>{item.label}</span>{selected && <Check size={14} />}</button>
  })}</div>
}

export function BodyLocationPicker({ buttonLabel, compact = false, inputLike = false, label = '身体部位（可多选）', member, showEmptyState = true, value, onChange }: BodyLocationPickerProps) {
  const [open, setOpen] = useState(false)
  const [activeRegionId, setActiveRegionId] = useState('')
  const [activeView, setActiveView] = useState<BodyLocationView>('front')
  const [laterality, setLaterality] = useState<Extract<BodyLocationLaterality, 'left' | 'right'>>('left')
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<BodyLocationSelection[]>([])
  const regions = useMemo(() => getBodyLocationRegions(member), [member])
  const activeRegion = regions.find((region) => region.id === activeRegionId)
  const searchResults = useMemo(() => searchBodyLocations(query, member), [member, query])
  const selectedIds = useMemo(() => new Set(draft.map((item) => item.id)), [draft])

  const toggle = (item: BodyLocationOption) => setDraft((current) => current.some((selection) => selection.id === item.id) ? current.filter((selection) => selection.id !== item.id) : [...current, toBodyLocationSelection(item)])
  const beginEditing = () => { setDraft(value); setActiveRegionId(''); setActiveView('front'); setLaterality('left'); setQuery(''); setOpen(true) }
  const close = () => { setOpen(false); setActiveRegionId(''); setQuery('') }
  const confirm = () => { onChange(draft); close() }
  const removeCommitted = (id: string) => onChange(value.filter((item) => item.id !== id))
  const enterRegion = (region: BodyLocationRegion) => {
    setActiveRegionId(region.id)
    setActiveView(region.atlasViews?.[0]?.id ?? region.view)
    const existingSide = draft.find((item) => item.parentId === region.id && (item.laterality === 'left' || item.laterality === 'right'))?.laterality
    setLaterality(existingSide === 'right' ? 'right' : 'left')
  }
  const clearActiveRegion = () => activeRegion && setDraft((current) => current.filter((item) => item.parentId !== activeRegion.id))
  const activeRegionSelectionCount = activeRegion ? draft.filter((item) => item.parentId === activeRegion.id).length : 0

  return <fieldset className="min-w-0"><legend className="hoho-text-label mb-2">{label}</legend>
    <div className={`body-location-picker-row flex min-w-0 items-center gap-3 ${compact ? 'flex-nowrap' : 'flex-wrap'} ${inputLike ? 'body-location-picker-row--input' : ''}`}>
      <span className="min-w-0 flex-1 overflow-hidden"><SelectionChips compact={compact} onRemove={removeCommitted} showEmptyState={showEmptyState} values={value} /></span>
      <button className="body-location-picker-action inline-flex min-h-11 shrink-0 items-center whitespace-nowrap px-2 text-sm font-medium text-primary" onClick={beginEditing} type="button">{buttonLabel ?? (value.length ? '修改位置' : '选择位置')}</button>
    </div>
    <BottomSheetSurface
      className="body-location-sheet"
      footer={<div className="body-location-footer"><div aria-live="polite" className="grid min-w-0 gap-1"><span className="text-xs font-medium text-text-secondary">{draft.length ? `已选择 ${draft.length} 个位置` : '尚未选择位置'}</span>{draft.length > 0 && <SelectionChips compact onRemove={(id) => setDraft((current) => current.filter((item) => item.id !== id))} values={draft} />}</div><HohoButton onClick={confirm} type="button"><Check size={17} />确认</HohoButton></div>}
      label="身体部位定位器"
      leading={activeRegion ? <button aria-label="返回身体部位列表" className="hoho-bottom-sheet__back" onClick={() => setActiveRegionId('')} type="button"><ArrowLeft size={20} /></button> : undefined}
      onClose={close}
      open={open}
      size="workspace"
      title={activeRegion?.label ?? '选择身体部位'}
    >
      {activeRegion ? <div className="grid gap-3">
        <div className="flex min-w-0 items-start justify-between gap-3"><p className="min-w-0 text-sm leading-5 text-text-secondary">{activeRegion.description}</p><div className="flex shrink-0 items-center gap-2"><AtlasSelectionCount count={activeRegionSelectionCount} /><button className="min-h-9 text-xs font-medium text-primary disabled:text-text-weak" disabled={!activeRegionSelectionCount} onClick={clearActiveRegion} type="button">清空</button></div></div>
        {activeRegion.atlas ? <>
          {(activeRegion.atlas === 'hand' || activeRegion.atlas === 'foot') && <SegmentControl label="选择左右侧" onChange={(next) => setLaterality(next as 'left' | 'right')} options={[{ id: 'left', label: activeRegion.atlas === 'hand' ? '左手' : '左足' }, { id: 'right', label: activeRegion.atlas === 'hand' ? '右手' : '右足' }]} value={laterality} />}
          <SegmentControl label={`${activeRegion.label}视图`} onChange={(next) => setActiveView(next as BodyLocationView)} options={activeRegion.atlasViews ?? []} value={activeView} />
          <div className="body-location-atlas-frame"><BodyLocationAtlas atlas={activeRegion.atlas} laterality={laterality} onToggle={toggle} options={activeRegion.options} selectedIds={selectedIds} view={activeView} /></div>
          <p className="text-center text-xs text-text-weak">点击图中区域，可选择一个或多个位置</p>
        </> : <OptionGrid onToggle={toggle} options={activeRegion.options} selectedIds={selectedIds} />}
      </div> : <div className="grid gap-5">
        <label className="relative block"><span className="sr-only">搜索部位</span><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-weak" size={18} /><input className="hoho-input pl-10" placeholder="搜索头、手掌、脚背、胆囊、腰…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        {query.trim() ? <section className="grid gap-2"><h3 className="hoho-text-label">搜索结果</h3>{searchResults.length ? <OptionGrid onToggle={toggle} options={searchResults} selectedIds={selectedIds} /> : <p className="rounded-control bg-background p-4 text-sm text-text-secondary">没有找到相关部位，请返回区域列表选择。</p>}</section> : <section className="grid gap-3"><h3 className="hoho-text-label">常用部位与系统</h3><div className="grid grid-cols-3 gap-2">{regions.map((region) => { const Icon = iconForRegion(region); const count = draft.filter((item) => item.parentId === region.id).length; return <button className="body-location-region-entry" key={region.id} onClick={() => enterRegion(region)} type="button"><span className="body-location-region-entry__icon"><Icon size={21} strokeWidth={1.55} /></span><span>{region.shortLabel ?? region.label}</span>{count > 0 && <span className="absolute right-2 top-2 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-surface">{count}</span>}</button> })}</div></section>}
      </div>}
    </BottomSheetSurface>
  </fieldset>
}
