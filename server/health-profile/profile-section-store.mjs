import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { JsonStore } from '../auth/storage/json-store.mjs'

const nameOf = value => String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ')
const nameKey = value => nameOf(value).toLocaleLowerCase('zh-CN')
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const statusOf = row => ({ '已明确': 'confirmed', '已确诊': 'confirmed', '医生明确': 'confirmed', '医生确认': 'confirmed', '待排查': 'investigating', '疑似': 'suspected', '已排除': 'excluded', '曾经有，目前已耐受': 'tolerated' }[row.currentStatus ?? row.certainty] ?? row.currentStatus ?? row.certainty)
const food = row => row.category === 'food' || String(row.category ?? row.type ?? '').includes('食')
const owned = (row, memberId) => !row.memberId || row.memberId === memberId
const failure = message => Object.assign(new Error(message), { status: 409, code: 'ALLERGY_SYNC_CONFLICT' })
const unknownNames = new Set(['尚未明确', '过敏原未明', '不明确', '未知'])

// Keep all evidence and legacy fields in the existing archive. This is a write
// adapter for that store, not another allergy database or a GET-time migration.
function allergyRows(records, memberId) {
  return records.flatMap((outer, index) => {
    if (!outer || outer.profileListDeletedAt || !owned(outer, memberId) || outer.recordType === 'allergy-report') return []
    const nested = outer._allergyArchive?.items
    return (Array.isArray(nested) ? nested : [outer]).flatMap((row, nestedIndex) =>
      row && owned(row, memberId) ? [{ row, id: row.id ?? (nested ? `legacy-allergy-${index + 1}:item-${nestedIndex + 1}` : `legacy-allergy-${index + 1}`) }] : [])
  })
}

export function activeAllergyRecords(records, memberId) {
  return allergyRows(records, memberId).filter(({ row }) => !row.profileListDeletedAt).map(({ row, id }) => ({ ...row, id }))
}

function groupOf(row) {
  if (row.profileListDeletedAt || !food(row) || !nameOf(row.name ?? row.subject)) return null
  if (unknownNames.has(nameOf(row.name ?? row.subject))) return null
  const status = statusOf(row)
  if (['excluded', 'tolerated'].includes(status)) return null
  if (status === 'confirmed') return 'avoid'
  return ['avoid', 'temporary'].includes(row.dietaryAction) ? row.dietaryAction : null
}

function sourcesFor(records, memberId) {
  return allergyRows(records, memberId).flatMap(({ row, id }) => {
    const group = groupOf(row), name = nameOf(row.name ?? row.subject)
    return group ? [{ id: `source:${id}`, sourceId: id, name, group, visible: true, manuallyAdded: false, nameAdjusted: false, groupAdjusted: false, sourceName: name, sourceGroup: group }] : []
  })
}

function projectCard(snapshot, records, memberId, at) {
  const sources = sourcesFor(records, memberId), byId = new Map(sources.map(row => [row.sourceId, row]))
  const items = []
  for (const item of snapshot.items) {
    if (!item.sourceId) { items.push(item); continue }
    const source = byId.get(item.sourceId)
    // A removed/excluded source must not survive as an active warning merely
    // because the user once changed a translation or display setting.
    if (!source) continue
    byId.delete(item.sourceId)
    const { foodId, englishName, ...display } = item
    items.push({ ...display, ...source, id: item.id, visible: item.visible !== false, ...(englishName && nameKey(item.name) === nameKey(source.name) ? { englishName } : {}) })
  }
  const names = new Set(items.map(item => nameKey(item.name)))
  for (const source of byId.values()) if (!names.has(nameKey(source.name))) { items.push(source); names.add(nameKey(source.name)) }
  const next = { ...snapshot, items }
  return same(snapshot.items, items) ? snapshot : { ...next, savedAt: at, syncedAt: at }
}

function applyCardEdits(snapshot, previous, records, accountId, memberId, at) {
  if (!snapshot || snapshot.version !== 1 || snapshot.memberId !== memberId || !Array.isArray(snapshot.items) || snapshot.items.length > 500) throw failure('忌口清单格式或孩子归属无效')
  const before = new Map((previous?.items ?? []).map(item => [item.id, item]))
  const rows = allergyRows(records, memberId)
  const ids = new Set(), names = new Set()
  for (const item of snapshot.items) {
    if (!item || typeof item !== 'object') throw failure('忌口清单格式无效')
    item.name = nameOf(item.name)
    if (!item.id || ids.has(item.id) || !item.name || unknownNames.has(item.name) || item.name.length > 200 || !['avoid', 'temporary'].includes(item.group) || names.has(nameKey(item.name))) throw failure('忌口食物名称或分组无效，或存在重复项')
    ids.add(item.id); names.add(nameKey(item.name))
    const old = before.get(item.id)
    if (old?.sourceId && old.sourceId !== item.sourceId) throw failure('过敏来源已变更，请重新加载；草稿仍保留')
    let target = item.sourceId ? rows.find(entry => entry.id === item.sourceId) : undefined
    const edited = old ? nameOf(old.name) !== item.name || old.group !== item.group
      : Boolean(item.sourceId && (item.sourceName && nameOf(item.sourceName) !== item.name || item.sourceGroup && item.sourceGroup !== item.group))
    if (item.sourceId && (!target || target.row.profileListDeletedAt || !food(target.row))) throw failure('过敏来源已变更，请重新加载；草稿仍保留')
    // Visibility/removal, English translations and cookware reminders are card
    // settings. They never erase or promote a clinical record.
    if (target && !edited) continue
    if (!target && item.visible === false) continue
    if (!target) target = rows.find(entry => food(entry.row) && !entry.row.profileListDeletedAt && nameKey(entry.row.name ?? entry.row.subject) === nameKey(item.name))
    if (target && rows.some(entry => entry.id !== target.id && food(entry.row) && !entry.row.profileListDeletedAt && nameKey(entry.row.name ?? entry.row.subject) === nameKey(item.name))) throw failure('过敏史已有同名食物，请先核对后重试')
    const status = item.group === 'avoid' ? 'confirmed' : 'investigating'
    // A new temporary display of an already confirmed food does not downgrade
    // it. An explicit group edit of a linked item does update the common state.
    if (target && !edited && item.group === 'temporary' && statusOf(target.row) === 'confirmed') {
      item.sourceId = target.id; continue
    }
    if (!target) {
      const row = { id: randomUUID(), accountId, memberId, category: 'food', name: item.name, customName: item.name, sourceType: 'caregiver', sourceLabel: '家长在忌口出示卡填写', createdAt: at, history: [], reactions: [], tests: [], ingredientRelations: [], sourceReferences: [], evidenceLinks: [] }
      records.push(row); target = { row, id: row.id }; rows.push(target)
    }
    const row = target.row, changed = statusOf(row) !== status || nameOf(row.name ?? row.subject) !== item.name || row.dietaryAction !== item.group
    if (changed) Object.assign(row, { name: item.name, customName: item.name, currentStatus: status, dietaryAction: item.group, updatedAt: at, statusUpdatedAt: statusOf(row) !== status ? at : row.statusUpdatedAt,
      history: [...(row.history ?? []), { id: randomUUID(), status, label: '用户在忌口出示卡保存', sourceType: 'caregiver', occurredAt: at }] })
    row.id ??= target.id
    item.sourceId = target.id
  }
}

export function reconcileAllergyDietarySections(previous, proposed, at = new Date().toISOString()) {
  const next = structuredClone(proposed), oldSections = previous.sections ?? []
  // Only scopes whose allergy/card records were actually written participate.
  // Account deletion/merge and unrelated sections must not resurrect data.
  const scopes = new Map()
  for (const section of next.sections) {
    if (!['allergy', 'dietary-card'].includes(section.sectionId)) continue
    const old = oldSections.find(s => s.accountId === section.accountId && s.memberId === section.memberId && s.sectionId === section.sectionId)
    if (!same(old?.records, section.records)) scopes.set(JSON.stringify([section.accountId, section.memberId]), section)
  }
  // Undo of a first archive save can remove the whole allergy section. Clear
  // its linked card projection, without recreating deleted members/accounts.
  for (const old of oldSections.filter(s => s.sectionId === 'allergy')) {
    if (!next.sections.some(s => s.accountId === old.accountId && s.memberId === old.memberId && s.sectionId === 'allergy') && next.sections.some(s => s.accountId === old.accountId && s.memberId === old.memberId && s.sectionId === 'dietary-card')) scopes.set(JSON.stringify([old.accountId, old.memberId]), old)
  }
  for (const { accountId, memberId } of scopes.values()) {
    const scoped = section => section.accountId === accountId && section.memberId === memberId
    let allergy = next.sections.find(s => scoped(s) && s.sectionId === 'allergy')
    let card = next.sections.find(s => scoped(s) && s.sectionId === 'dietary-card')
    const oldCard = oldSections.find(s => scoped(s) && s.sectionId === 'dietary-card')
    const cardWritten = card && !same(oldCard?.records, card.records)
    if (cardWritten) {
      if (card.records.length !== 1) throw failure('忌口清单格式无效')
      if (!allergy) { allergy = { accountId, memberId, sectionId: 'allergy', records: [], revision: 0 }; next.sections.push(allergy) }
      applyCardEdits(card.records[0], oldCard?.records?.[0], allergy.records, accountId, memberId, at)
    }
    if (card?.records?.[0]?.version === 1) card.records = [projectCard(card.records[0], allergy?.records ?? [], memberId, at)]
    for (const section of [allergy, card].filter(Boolean)) {
      const proposedSection = proposed.sections.find(s => scoped(s) && s.sectionId === section.sectionId)
      if (!same(proposedSection?.records, section.records)) section.revision = (proposedSection?.revision ?? 0) + 1
    }
  }
  return next
}

export class ProfileSectionStore extends JsonStore {
  constructor(directory) { super(path.join(directory, 'health-profile-sections.json'), { sections: [] }) }
  async update(updater) {
    return super.update(async previous => reconcileAllergyDietarySections(previous, await updater(previous)))
  }
}
