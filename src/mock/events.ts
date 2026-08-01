import type { HealthEvent } from '../types'

export const healthEvents: HealthEvent[] = [
  {
    id: 'fever-20260720',
    memberId: 'xiaoming',
    title: '发烧',
    startedAt: '2026-07-20T14:30:00+08:00',
    status: 'ongoing',
    summary: '体温反复，伴随轻微咳嗽，已补水并在家观察。',
    timeline: [
      { id: 't1', time: '2026-07-20T14:30:00+08:00', content: '体温 37.8℃，精神状态尚可。', kind: 'temperature' },
      { id: 't2', time: '2026-07-20T16:10:00+08:00', content: '体温升至 38.5℃，开始咳嗽。', kind: 'text' }
    ]
  },
  {
    id: 'allergy-20260703',
    memberId: 'xiaoming',
    title: '皮肤过敏',
    startedAt: '2026-07-03T09:00:00+08:00',
    status: 'recovered',
    summary: '皮疹已经消退，未再次出现。',
    timeline: []
  }
]
