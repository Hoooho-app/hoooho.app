import { healthProfileSectionMap, type HealthProfileSectionId } from '../health-profile/config/healthProfileSections'
import type { StoredHealthProfileSnapshot } from '../health-profile/utils/healthProfileHomeLogic'
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
