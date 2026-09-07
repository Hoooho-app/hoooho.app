import type { NurseStationItem, NurseStationItemType } from '../../features/nurse-station/state'

const taskTitles: Partial<Record<NurseStationItemType, string>> = {
  symptom_observation: '发热观察',
  medication_reminder: '用药提醒',
  record_connection: '记录关联',
  family_sync: '家人同步',
  reassurance_message: '安心提醒',
  missing_information: '补充信息',
  follow_up: '继续跟进'
}

export function taskTitle(item: NurseStationItem) {
  return taskTitles[item.type] ?? item.title.replace(/[？?]$/, '')
}

export function taskStatus(item: NurseStationItem) {
  if (item.status === 'paused') return '已暂停'
  if (item.type === 'medication_reminder') return '待处理'
  return '观察中'
}

export function taskNextStep(item: NurseStationItem, now = Date.now()) {
  if (item.reminder?.at) {
    const reminderAt = new Date(item.reminder.at)
    const minutes = Math.max(0, Math.round((reminderAt.getTime() - now) / 60_000))
    if (minutes < 60) return `下一次提醒：${minutes}分钟后`
    return `下一次提醒：${reminderAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
  }
  if (item.type === 'symptom_observation') return '继续记录体温变化'
  return item.sourceLabel
}

export function sortActiveTasks(items: NurseStationItem[], now = Date.now()) {
  return items
    .filter((item) => item.status === 'active' || item.status === 'paused')
    .slice()
    .sort((left, right) => taskPriority(left, now) - taskPriority(right, now) || Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
}

function taskPriority(item: NurseStationItem, now: number) {
  if (item.status === 'paused') return 3
  if (item.reminder?.at && Date.parse(item.reminder.at) - now <= 60 * 60 * 1000) return 1
  return 2
}

export function tipKey(item: NurseStationItem) {
  return `${item.type}:${item.sourceLabel.split('·')[0].trim()}`
}

export function getUnreadTips(items: NurseStationItem[], seenKeys: string[]) {
  const topics = new Map<string, NurseStationItem>()
  items.filter((item) => item.status === 'active' || item.status === 'paused' || item.status === 'pending_confirmation').forEach((item) => topics.set(tipKey(item), item))
  return [...topics.entries()].filter(([key]) => !seenKeys.includes(key)).map(([, item]) => item)
}

export function getArchivedTasks(items: NurseStationItem[]) {
  return items.filter((item) => item.status === 'completed')
}
