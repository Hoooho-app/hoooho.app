import type { JournalOutdoorActivityDetails } from '../../types/journal'

export const activityLabels = { stroller_outing: '推车外出', walking: '散步', free_play: '自由玩耍', running_jumping: '跑跳', cycling_balance_bike: '骑行或滑步车', ball_play: '球类活动', climbing: '攀爬', other: '其他活动' } as const
export const placeLabels = { neighborhood: '小区周边', park: '公园', grassland: '草地', playground: '游乐场', school_kindergarten: '学校或幼儿园', mall_indoor_venue: '商场或室内场馆', other: '其他地点' } as const
export const contactLabels = { plants_pollen: '草木或花粉', animals: '动物', sand_soil: '沙土', dust: '灰尘', cold_air: '冷空气', smoke_odor: '烟雾或明显气味', water: '水', none_observed: '没有特别接触' } as const
export const observationLabels = { cough: '咳嗽', wheeze_breathing_discomfort: '喘息或呼吸不适', runny_nose_sneeze: '流鼻涕或打喷嚏', red_eyes_eye_rubbing: '眼睛发红或揉眼', red_itchy_skin: '皮肤发红或瘙痒', scratching: '抓挠', fall_injury: '摔倒或受伤', none_observed: '没有特别发现' } as const
const durationLabels = { under_15: '不到15分钟', '15_30': '15–30分钟', '30_60': '30–60分钟', over_60: '超过1小时' } as const

export function toggleChoice<T extends string>(values: T[], value: T) { return values.includes(value) ? values.filter((item) => item !== value) : [...values, value] }
export function toggleExclusive<T extends string>(values: T[], value: T, none: T) { return value === none ? (values.includes(none) ? [] : [none]) : toggleChoice(values.filter((item) => item !== none), value) }
export function outdoorActivitySummary(details: JournalOutdoorActivityDetails) {
  const duration = details.durationMinutes ? `${details.durationMinutes}分钟` : details.durationRange ? durationLabels[details.durationRange] : undefined
  const first = [details.places.map((key) => key === 'other' ? details.placeOtherText || placeLabels[key] : placeLabels[key]).join('、'), details.activities.map((key) => key === 'other' ? details.activityOtherText || activityLabels[key] : activityLabels[key]).join('、'), duration].filter(Boolean).join(' · ')
  const second = [...details.contacts.map((key) => contactLabels[key]), ...details.observations.map((key) => observationLabels[key])].join('、')
  return ['户外活动', first, second].filter(Boolean).join('\n')
}
