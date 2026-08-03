import type { HealthEvent } from '../types'

const medicalInfo = {
  allergies: ['无已知药物过敏'],
  medications: ['暂无长期用药'],
  medicalHistory: ['无重要既往病史'],
  chronicDiseases: ['暂无慢性疾病'],
  familyHistory: ['暂无重要家族健康史']
}

export const healthEvents: HealthEvent[] = [
  {
    id: 'event-empty',
    memberId: 'xiaoming',
    title: '',
    status: 'empty',
    startDate: '2026-08-02T09:41:00+08:00',
    symptoms: [],
    summary: '',
    timeline: [],
    temperatureRecords: [],
    attachments: [],
    concerns: [],
    personalizedModules: [],
    medicalInfo
  },
  {
    id: 'event-ongoing',
    memberId: 'xiaoming',
    title: '发烧',
    status: 'ongoing',
    startDate: '2026-07-20T14:30:00+08:00',
    symptoms: ['发热', '轻微咳嗽', '精神状态一般'],
    summary: '体温反复，伴随轻微咳嗽，已补水并在家观察。',
    timeline: [
      { id: 't1', time: '2026-07-20T14:30:00+08:00', content: '发现体温 37.8℃，精神状态尚可。', kind: 'temperature' },
      { id: 't2', time: '2026-07-20T16:10:00+08:00', content: '体温升至 38.5℃，开始出现轻微咳嗽。', kind: 'text' },
      { id: 't3', time: '2026-07-20T19:40:00+08:00', content: '补充温水并休息，继续观察体温变化。', kind: 'text' }
    ],
    temperatureRecords: [
      { time: '2026-07-20T14:30:00+08:00', value: 37.8 },
      { time: '2026-07-20T16:10:00+08:00', value: 38.5 },
      { time: '2026-07-20T19:40:00+08:00', value: 38.0 },
      { time: '2026-07-20T23:30:00+08:00', value: 37.6 }
    ],
    attachments: [
      { id: 'a1', name: '体温计照片', type: 'image' },
      { id: 'a2', name: '用药包装', type: 'image' }
    ],
    concerns: ['体温是否会继续升高？', '夜间出现反复发热应该怎么办？'],
    personalizedModules: [],
    medicalInfo
  },
  {
    id: 'event-recovered',
    memberId: 'xiaoming',
    title: '发烧',
    status: 'recovered',
    startDate: '2026-07-20T14:30:00+08:00',
    symptoms: ['发热', '轻微咳嗽'],
    summary: '本次发热持续约两天，休息并补充水分后体温逐渐恢复。',
    timeline: [
      { id: 'r1', time: '2026-07-20T14:30:00+08:00', content: '发现体温 37.8℃。', kind: 'temperature' },
      { id: 'r2', time: '2026-07-20T19:40:00+08:00', content: '体温最高 38.5℃，补水并居家观察。', kind: 'temperature' },
      { id: 'r3', time: '2026-07-21T20:30:00+08:00', content: '体温回落至 37.2℃，精神状态好转。', kind: 'temperature' },
      { id: 'r4', time: '2026-07-22T08:30:00+08:00', content: '体温恢复正常，未再出现明显不适。', kind: 'text' }
    ],
    temperatureRecords: [
      { time: '2026-07-20T14:30:00+08:00', value: 37.8 },
      { time: '2026-07-20T19:40:00+08:00', value: 38.5 },
      { time: '2026-07-21T20:30:00+08:00', value: 37.2 },
      { time: '2026-07-22T08:30:00+08:00', value: 36.6 }
    ],
    attachments: [
      { id: 'r-a1', name: '体温记录照片', type: 'image' },
      { id: 'r-a2', name: '就诊资料', type: 'document' }
    ],
    concerns: ['后续是否需要继续观察体温？'],
    personalizedModules: [],
    medicalInfo,
    recoveryInfo: {
      recoveredAt: '2026-07-22T08:30:00+08:00',
      result: '已恢复',
      note: '体温恢复正常，精神和食欲已明显好转。'
    }
  }
]
