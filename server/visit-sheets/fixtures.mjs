// Fictional test fixture, never imported by runtime services.
export function visitFixture() {
  const accountId = 'visit-test',
    member = {
      id: 'child-a',
      accountId,
      name: '小禾（虚构）',
      gender: 'female',
      birthday: '2024-01-01',
    }
  const records = Array.from({ length: 8 }, (_, i) => ({
    id: `s${i}`,
    accountId,
    eventId: 'event-a',
    type: 'note',
    content: `${i < 2 ? '肘窝' : '前臂'}皮肤发红，第${i + 1}条观察`,
    occurredAt: `2026-09-${12 + i}T10:00:00.000Z`,
    createdAt: `2026-09-${12 + i}T10:01:00.000Z`,
    journal: {
      categories: ['symptom'],
      symptom: {
        narrative: `${i < 2 ? '肘窝' : '前臂'}皮肤发红，第${i + 1}条观察`,
        symptomCategory: 'skin',
        locations: [
          {
            id: i < 2 ? 'elbow' : 'forearm',
            label: i < 2 ? '肘窝' : '前臂',
            locationNumber: 1,
            locationLayer: 'surface',
          },
        ],
        impactLevel: i < 3 ? 'little' : i < 7 ? 'some' : 'clear',
      },
    },
  }))
  records.push(
    {
      id: 'noise',
      accountId,
      eventId: 'event-a',
      type: 'symptom',
      content: '嗯',
      occurredAt: '2026-09-25T12:00:00Z',
    },
    ...Array.from({ length: 3 }, (_, i) => ({
      id: `t${i}`,
      accountId,
      eventId: 'event-a',
      type: 'note',
      sourceType: 'measurement',
      content: `体温 ${[37, 39.1, 36.8][i]}℃`,
      occurredAt: `2026-09-20T${['08', '12', '18'][i]}:00:00Z`,
      createdAt: '2026-09-20T20:00:00Z',
    })),
  )
  const completions = Array.from({ length: 5 }, (_, i) => ({
    id: `dose${i}`,
    occurrenceId: `o${i}`,
    recordId: `m${i}`,
    eventId: 'event-a',
    actualTakenAt: `2026-09-20T0${i}:00:00Z`,
  }))
  records.push(
    ...completions.map((c) => ({
      id: c.recordId,
      accountId,
      eventId: 'event-a',
      type: 'medication',
      content: '确认服用示例药物',
      occurredAt: c.actualTakenAt,
    })),
  )
  const reminders = [
    {
      id: 'plan',
      memberId: member.id,
      plan: {
        medicationName: '示例药物',
        amount: 1,
        unit: 'mL',
        route: '口服',
        mode: 'daily',
        times: ['08:00'],
        startDate: '2026-09-01',
        endDate: '2026-09-28',
      },
      createdAt: '2026-09-01T00:00:00Z',
      occurrences: Array.from({ length: 8 }, (_, i) => ({
        id: `o${i}`,
        scheduledAt: `2026-09-${i < 7 ? '20' : '28'}T${String(i).padStart(2, '0')}:00:00Z`,
        completed: i < 5,
        completion: completions[i] ?? null,
      })),
    },
  ]
  const tasks = [
    {
      id: 'task1',
      memberId: member.id,
      displayName: '鸡蛋观察',
      status: 'active',
      createdAt: '2026-09-10T00:00:00Z',
      linkedRecords: [],
      records: Array.from({ length: 5 }, (_, i) => ({
        id: `obs${i}`,
        status: 'effective',
        symptomAnswer: i < 2 ? 'present' : i < 4 ? 'absent' : null,
        symptoms: i < 2 ? ['红疹'] : [],
        occurredAt: `2026-09-${15 + i}T00:00:00Z`,
      })),
    },
  ]
  const growth = Array.from({ length: 3 }, (_, i) => ({
    id: `g${i}`,
    memberId: member.id,
    heightCm: [81, 82, 82.8][i],
    weightKg: [10.1, 10.3, 10.5][i],
    measuredAt: `2026-0${7 + i}-25`,
    dataStatus: 'confirmed',
  }))
  return {
    member,
    events: [
      {
        id: 'event-a',
        memberId: member.id,
        title: '皮肤记录',
        startTime: '2026-09-12T10:00:00Z',
      },
    ],
    records,
    growth,
    reminders,
    tasks,
    facts: [],
    profiles: [],
    attachments: [
      {
        id: 'photo',
        eventId: 'event-a',
        recordId: 's0',
        name: '虚构图片.png',
        mimeType: 'image/png',
        createdAt: '2026-09-12T10:00:00Z',
      },
    ],
    organizations: [],
    warnings: [],
    timezone: 'Asia/Shanghai',
  }
}
