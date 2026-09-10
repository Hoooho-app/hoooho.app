import type { JournalEntry } from './timeViewModel'
import { getLocalDateKey } from '../../utils/localCalendarDate'

export type TimelinePromptTarget = 'sleep' | 'diet' | 'activity' | 'other'
export type TimelinePromptMode = 'start' | 'backfill' | 'nap'

export interface TimelinePrompt {
  eyebrow: string
  question: string
  action: string
  target: TimelinePromptTarget
  mode: TimelinePromptMode
}

const rules = [
  { from: 0, to: 7, eyebrow: '早上好', question: '昨晚睡得怎么样？', action: '记一下睡眠', target: 'sleep', mode: 'backfill' },
  { from: 7, to: 11, eyebrow: '上午已经开始啦', question: '早上吃了些什么？', action: '记一下喂养/饮食', target: 'diet', mode: 'backfill' },
  { from: 11, to: 14, eyebrow: '到中午啦', question: '午饭吃得怎么样？', action: '记一下喂养/饮食', target: 'diet', mode: 'backfill' },
  { from: 14, to: 17, eyebrow: '下午啦', question: '中午有没有睡一会儿？', action: '记一下午睡', target: 'sleep', mode: 'nap' },
  { from: 17, to: 20, eyebrow: '天快黑啦', question: '今天出去活动了吗？', action: '记一下户外活动', target: 'activity', mode: 'backfill' },
  { from: 20, to: 24, eyebrow: '已经到晚上啦', question: '是不是该准备睡觉了？', action: '记一下睡眠', target: 'sleep', mode: 'start' }
] as const

export function getTimelinePrompt(now: Date, memberName: string, selectedDay: string, today: string, entries: readonly JournalEntry[]): TimelinePrompt | null {
  const activeSleep = entries.find((entry) => entry.sleep?.status === 'ongoing')
  if (activeSleep) return null
  const rule = rules.find((item) => now.getHours() >= item.from && now.getHours() < item.to) ?? rules[0]
  const sameDayRelevant = entries.some((entry) => entry.categories?.includes(rule.target) && getLocalDateKey(entry.occurredAt) === selectedDay)
  if (sameDayRelevant) return null
  return {
    eyebrow: rule.eyebrow,
    question: `${memberName}${rule.question}`,
    action: rule.action,
    target: rule.target,
    mode: selectedDay === today ? rule.mode : 'backfill'
  }
}
