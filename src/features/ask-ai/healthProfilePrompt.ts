import { healthProfileSectionMap, type HealthProfileSectionId } from '../health-profile/config/healthProfileSections'
import type { StoredHealthProfileSnapshot } from '../health-profile/utils/healthProfileHomeLogic'
import { allergyStatusLabels, normalizeAllergyArchive } from '../health-profile/utils/allergyProfile'
import type { HealthProfilePromptSection } from './healthEventPrompt'

function displayValue(value: unknown): string {
  if (value == null || value === '') return ''
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (Array.isArray(value)) return value.map(displayValue).filter(Boolean).join('、')
  if (typeof value === 'object') return ''
  return String(value).trim()
}

export function createHealthProfilePromptSections(snapshots: StoredHealthProfileSnapshot[]): HealthProfilePromptSection[] {
  return snapshots.flatMap((snapshot) => {
    const section = healthProfileSectionMap[snapshot.id as HealthProfileSectionId]
    if (!section) return []
    if (snapshot.id === 'allergy') {
      const entries = normalizeAllergyArchive(snapshot.records, '').items.map((item) => ({ id: item.id, lines: [
        `过敏原：${item.name}`,
        `当前状态：${item.currentStatus ? allergyStatusLabels[item.currentStatus] : '待核对'}`,
        `最近更新：${item.updatedAt || snapshot.updatedAt || '记录时间未知'}`,
        item.reactions.length ? `已记录反应：${item.reactions.length} 次` : '',
        item.tests.length ? `已记录检查：${item.tests.length} 份` : '',
      ].filter(Boolean) }))
      return entries.length ? [{ id: 'allergy', title: '过敏与反应记录', entries }] : []
    }
    const fields = new Map(section.fields.map((field) => [field.id, field]))
    const entries = snapshot.records.flatMap((record, index) => {
      const lines = Object.entries(record).flatMap(([fieldId, value]) => {
        if (fieldId.startsWith('_')) return []
        const field = fields.get(fieldId)
        if (!field) return []
        if (field.type === 'attachment') return value ? [`${field.label}：已保存附件，需要在外部 AI 中手动上传`] : []
        const text = displayValue(value)
        if (!text) return []
        return [`${field.label}：${text}${field.unit ? ` ${field.unit}` : ''}`]
      })
      return lines.length ? [{ id: String(index + 1), lines }] : []
    })
    return entries.length ? [{ id: section.id, title: section.title, entries }] : []
  })
}
