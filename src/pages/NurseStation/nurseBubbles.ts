import type { NurseStationItem } from '../../features/nurse-station/state'

export type NurseBubbleType = 'safety' | 'attention' | 'medication' | 'medical-prep' | 'supplement' | 'organize' | 'reassurance' | 'research' | 'family' | 'tips' | 'tutorial'

export interface NurseBubbleModel {
  count: number
  itemKeys: string[]
  items: NurseStationItem[]
  key: string
  priority: number
  title: string
  type: NurseBubbleType
}

const bubbleMeta: Record<NurseBubbleType, { priority: number; title: string }> = {
  safety: { priority: 1, title: '安全提醒' },
  attention: { priority: 3, title: '值得继续留意' },
  medication: { priority: 4, title: '用药提醒' },
  'medical-prep': { priority: 5, title: '就医准备' },
  supplement: { priority: 4, title: '帮你补充记录' },
  organize: { priority: 6, title: '帮你整理' },
  reassurance: { priority: 7, title: '安心提醒' },
  research: { priority: 8, title: '为你查一查' },
  family: { priority: 8, title: '同步给家人' },
  tips: { priority: 6, title: '护理小贴士' },
  tutorial: { priority: 9, title: '使用教程' }
}

export function bubbleItemKey(item: NurseStationItem) {
  const topic = item.sourceLabel.split('·')[0].trim()
  return `${item.type}:${topic}:${item.updatedAt}`
}

function bubbleTypeFor(item: NurseStationItem): NurseBubbleType | null {
  if (/安全提醒|需要就医|明显加重/.test(item.title)) return 'safety'
  if (item.status === 'pending_confirmation') return item.type === 'medication_reminder' ? 'medication' : 'attention'
  if (item.type === 'missing_information') return 'supplement'
  if (item.type === 'record_connection') return 'organize'
  if (item.type === 'family_sync') return 'family'
  if (item.type === 'reassurance_message') return 'reassurance'
  if (item.type === 'follow_up') return 'tips'
  if (item.type === 'other' && /查|资料/.test(item.title)) return 'research'
  return null
}

export function buildNurseBubbles({ handledKeys, items, medicalPrepEventId, tutorialAvailable }: { handledKeys: string[]; items: NurseStationItem[]; medicalPrepEventId?: string | null; tutorialAvailable: boolean }) {
  const grouped = new Map<NurseBubbleType, Map<string, NurseStationItem>>()
  items.forEach((item) => {
    const type = bubbleTypeFor(item)
    if (!type || ['completed', 'dismissed', 'deleted'].includes(item.status)) return
    const key = bubbleItemKey(item)
    if (handledKeys.includes(key)) return
    const topic = `${item.type}:${item.sourceLabel.split('·')[0].trim()}`
    const bucket = grouped.get(type) ?? new Map<string, NurseStationItem>()
    bucket.set(topic, item)
    grouped.set(type, bucket)
  })

  const bubbles = [...grouped.entries()].map(([type, topics]) => {
    const meta = bubbleMeta[type]
    const values = [...topics.values()]
    return { ...meta, type, count: values.length, items: values, itemKeys: values.map(bubbleItemKey), key: `${type}:${values.map(bubbleItemKey).sort().join('|')}` }
  })
  if (medicalPrepEventId && !handledKeys.includes(`medical-prep:${medicalPrepEventId}`)) bubbles.push({ ...bubbleMeta['medical-prep'], type: 'medical-prep', count: 1, items: [], itemKeys: [`medical-prep:${medicalPrepEventId}`], key: `medical-prep:${medicalPrepEventId}` })
  if (tutorialAvailable && !handledKeys.includes('tutorial:first-record')) bubbles.push({ ...bubbleMeta.tutorial, type: 'tutorial', count: 1, items: [], itemKeys: ['tutorial:first-record'], key: 'tutorial:first-record' })
  return bubbles.sort((left, right) => left.priority - right.priority || left.title.localeCompare(right.title, 'zh-CN'))
}

export function visibleNurseBubbles(bubbles: NurseBubbleModel[]) {
  return { visible: bubbles.slice(0, 2), hiddenCount: Math.max(0, bubbles.slice(2).reduce((total, bubble) => total + bubble.count, 0)) }
}

export function isSafetyBubble(bubble: NurseBubbleModel) { return bubble.type === 'safety' }
