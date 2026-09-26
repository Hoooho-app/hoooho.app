import source from './child-data/locations.json' with { type: 'json' }
import type { BodyLocationSelection } from './types'

export type ChildModel = 'boy' | 'girl'
export type ChildView = 'front' | 'back'
export type ChildSurface = 'anterior' | 'posterior' | 'medial' | 'lateral' | 'superior' | 'inferior' | 'palmar' | 'dorsal' | 'plantar' | 'circumferential' | 'mucosal' | 'external' | 'unspecified'
export interface ChildLocation {
  id: string; label: string; side: 'left' | 'right' | 'midline' | 'unspecified'; surface: ChildSurface
  sex: ChildModel[]; views: ChildView[]; aliases: string[]; group: string; anchorHint: string
  coverage: 'specific' | 'whole' | 'uncertain'; displayMode: 'illustrated' | 'text'
}
export interface ChildRegion {
  id: string; label: string; views: ChildView[]; bilateral: boolean; side: ChildLocation['side']
  pairedRegionId?: string; zoom: 'body' | 'face' | 'hand' | 'foot'; items: ChildLocation[]
}
export const CHILD_CATALOG_VERSION = source.schemaVersion
export const CHILD_REGIONS = source.regions as ChildRegion[]
export const CHILD_LOCATIONS = new Map(CHILD_REGIONS.flatMap(region => region.items.map(item => [item.id, { ...item, regionId: region.id }] as const)))
export const childSelectionKey = (item: BodyLocationSelection) => `${item.schemaVersion ?? 'legacy'}:${item.id}`
export const isChildSelection = (item: BodyLocationSelection) => item.schemaVersion === CHILD_CATALOG_VERSION && CHILD_LOCATIONS.has(item.id)
export const resolveChildModel = (gender: unknown): ChildModel | null => gender === 'male' ? 'boy' : gender === 'female' ? 'girl' : null
export const availableChildRegions = (model: ChildModel) => CHILD_REGIONS.filter(region => region.items.some(item => item.sex.includes(model)))

export function toChildSelection(id: string, model: ChildModel): BodyLocationSelection {
  const item = CHILD_LOCATIONS.get(id)
  if (!item || !item.sex.includes(model)) throw new Error('该部位不适用于当前孩子档案')
  return { id, label: item.label, parentId: item.regionId, locationType: 'surface',
    laterality: item.side === 'midline' ? 'center' : item.side === 'unspecified' ? 'none' : item.side,
    view: item.views[0], schemaVersion: CHILD_CATALOG_VERSION, surface: item.surface,
    coverage: item.coverage, modelAtSelection: model }
}

/** Only an explicit edit applies the current region's broad/specific rule. Opening never migrates old data. */
export function toggleChildSelection(values: readonly BodyLocationSelection[], id: string, model: ChildModel) {
  const next = toChildSelection(id, model)
  const selected = values.some(item => childSelectionKey(item) === childSelectionKey(next))
  const broad = (value: string) => value === `${next.parentId}_whole` || value === `${next.parentId}_uncertain`
  const remaining = values.filter(item => {
    if (childSelectionKey(item) === childSelectionKey(next)) return false
    if (!isChildSelection(item) || item.parentId !== next.parentId) return true
    return !broad(item.id) && (selected || !broad(id))
  })
  return selected ? remaining : [...remaining, next]
}

export function confirmChildSelection(values: readonly BodyLocationSelection[], openedMemberId: string, currentMemberId: string) {
  if (!openedMemberId || openedMemberId !== currentMemberId) throw new Error('记录对象已变化，请重新选择部位')
  return values.map(item => ({ ...item }))
}
