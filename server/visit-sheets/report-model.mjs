import { createHash } from 'node:crypto'
import { refineVisitSheet } from './v5-projection.mjs'

export const chapters = [
  ['overview', '病情数据'],
  ['course', '病程与变化'],
  ['medication', '用药与处理'],
  ['allergy', '过敏与饮食观察'],
  ['history', '既往与相关背景'],
  ['temperature', '体温记录'],
  ['growth', '成长与日常'],
  ['visits', '就诊与检查'],
  ['sources', '附件与完整依据'],
]
const text = (value) => (typeof value === 'string' ? value.trim() : '')
const finite = (value) => typeof value === 'number' && Number.isFinite(value)
const date = (value) =>
  value && Number.isFinite(Date.parse(value)) ? value : null
const unique = (values) => [...new Set(values.filter(Boolean))]
function memberScoped(value,memberId){
  if(Array.isArray(value))return value.map(v=>memberScoped(v,memberId)).filter(v=>v!==undefined)
  if(value&&typeof value==='object'){
    if(value.memberId&&value.memberId!==memberId)return undefined
    return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,memberScoped(v,memberId)]).filter(([,v])=>v!==undefined))
  }
  return value
}
const isTemperature = (r) =>
  r.type === 'temperature' ||
  r.sourceType === 'measurement' ||
  finite(r.journal?.symptom?.symptomSpecificData?.currentTemperature)
const recordText = (r) =>
  [
    r.content,
    r.sourceText && r.sourceText !== r.content
      ? `最初原文：${r.sourceText}`
      : '',
    r.note ? `备注：${r.note}` : '',
    r.journal?.symptom?.impactLevel
      ? `影响程度：${{ little: '轻微影响', some: '有些影响', clear: '明显影响' }[r.journal.symptom.impactLevel]}`
      : '',
    r.journal?.symptom?.shortNote,
    finite(r.journal?.symptom?.symptomSpecificData?.currentTemperature)
      ? `当前结构化测量值：${r.journal.symptom.symptomSpecificData.currentTemperature} ℃（更正时保留原叙述）`
      : '',
    r.journal?.medication
      ? `结构化用药：${readable(r.journal.medication)}`
      : '',
  ]
    .filter(Boolean)
    .join('\n')
const symptomRecord = (r) =>
  Boolean(
    r.journal?.symptom ||
      r.journal?.categories?.some((c) => ['symptom', 'injury'].includes(c)) ||
      ['symptom', 'injury'].includes(r.type) ||
      r.organizedFacts?.some((f) => f.type === 'symptom' && eligibleFact(f)),
  )
const eligibleFact = f => f.polarity !== 'negated' && !['future','conditional'].includes(f.temporality) && !['family_member','other_person'].includes(f.subject) && f.status !== 'superseded'
const byTime = (a, b) =>
  (Date.parse(b.occurredAt || b.createdAt) || 0) -
    (Date.parse(a.occurredAt || a.createdAt) || 0) ||
  (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) ||
  b.id.localeCompare(a.id)
const labels = {
  birthDate:'出生日期',gestationalWeeks:'孕周（周）',gestationalDays:'额外孕日（天）',birthWeight:'出生体重（kg）',birthLength:'出生身长（cm）',delivery:'分娩方式',neonatal:'新生儿期记录',
  manifestations:'表现',duration:'每次通常持续',customDuration:'每次持续时间补充',triggers:'家长记录诱因（未确认因果）',lifeImpacts:'生活影响',legacy:'历史记录',postoperativeStatusTags:'术后情况',implantTags:'植入物记录',locations:'部位',legacyNote:'原有补充',customRelationship:'亲属补充',healthIssues:'家族健康事项',certainty:'家长记录的诊断了解程度',onset:'大概发现时间 / 年龄',knowledge:'家长对问题名称的了解',symptomSystems:'表现涉及系统',legacyLocationNotes:'原有部位描述',legacyImplantNote:'原有植入物说明',aggravatingFactors:'家长记录加重因素（未确认因果）',relievingFactors:'家长记录缓解因素（未确认因果）',
  method:'喂养方式',milkAmount:'奶量（ml）',solidStatus:'辅食情况',solidStartedAt:'辅食开始日期',mainFoods:'主要食物',treatment:'已有处理',organization:'机构',summary:'原记录摘要',type:'记录类型',doseNumber:'剂次',imageName:'附件名称',fileName:'文件名',mimeType:'文件类型',filename:'文件名',size:'文件大小（字节）',evidenceStatus:'依据状态',confirmedByUser:'家长已确认关联',preparation:'处理方式',exposureAnswer:'摄入记录',symptomAnswer:'观察结果',actualFood:'实际食物',amount:'用量',
  medicationName: '药品', amountValue: '用量', amountUnit: '单位', administrationRoute: '使用途径', medications: '药品明细', reminder: '原记录提醒设置', enabled: '启用', timesPerDay: '每日次数', times: '时刻', durationDays: '计划天数', dosageStep: '录入步长', photoIds: '附件引用', shortNote: '补充说明', configured: '已配置', recognitionStatus: '识别状态', locationNumber: '部位编号', locationLayer: '部位层级', localRegion: '部位', label: '名称',
  name: '名称',
  title: '名称',
  description: '说明',
  note: '补充说明',
  notes: '补充说明',
  date: '日期',
  status: '状态',
  currentStatus: '过敏状态',
  symptoms: '表现',
  reaction: '反应',
  bodyLocations: '部位',
  dose: '用量',
  frequency: '频率',
  route: '途径',
  reason: '原因',
  startedAt: '开始日期',
  endedAt: '结束日期',
  firstFoundAt: '首次记录',
  hospital: '医院',
  institution: '机构',
  clinician: '医生',
  clinicianNote: '医生意见转述',
  result: '结果',
  value: '数值',
  unit: '单位',
  height: '身高 cm',
  weight: '体重 kg',
  relationship: '亲属',
  disease: '疾病',
  management: '管理情况',
  recovery: '恢复情况',
  active: '是否仍需注意',
  handling: '已有处理',
  occurredAt: '发生时间',
  testedAt: '检查时间',
  testType: '检查类型',
  clinicianInterpretation: '医生解读转述',
  exposureAmount: '接触量',
  latency: '间隔',
  reactions: '反应经过',
  tests: '检查资料',
  photos: '图片',
  reportFiles: '报告文件',
}
const statuses = {
  oral:'口服',topical:'外用',inhaled:'吸入',nebulized:'雾化',nasal:'鼻用',ophthalmic:'眼用',daily:'每天',weekly:'每周',custom:'自定义',not_used:'未使用识别', true:'是', false:'否',
  suspected: '家长怀疑',
  investigating: '正在排查',
  confirmed: '已确认（按记录）',
  excluded: '已排除（按记录）',
  tolerated: '已耐受（按记录）',
  pending: '待确认',
  positive: '阳性（原报告）',
  negative: '阴性（原报告）',
  borderline: '临界（原报告）',
}
function readable(value) {
  if (value == null || value === '') return ''
  if (Array.isArray(value))
    return value.map(readable).filter(Boolean).join('；')
  if (typeof value !== 'object') return statuses[value] || String(value)
  return Object.entries(value)
    .filter(
      ([key]) =>
        !key.startsWith('_') &&
        !/^(id|.*Ids?|accountId|memberId|createdAt|updatedAt|evidenceLinks|version|revision)$/.test(
          key,
        ),
    )
    .map(([key, val]) => {
      const v = readable(val)
      return v
        ? `${labels[key] || key}：${v.startsWith('data:') || v.startsWith('blob:') ? '附件原件见档案' : v}`
        : ''
    })
    .filter(Boolean)
    .join('；')
}
const profileDestination = (id) =>
  id === 'medication' ? 'medication' : id === 'allergy'
    ? 'allergy'
    : ['basic', 'growth', 'diet', 'feeding', 'sleep', 'exercise'].includes(id)
      ? 'growth'
      : ['examination', 'hospitalization'].includes(id)
        ? 'visits'
        : 'history'
const recordDestination = (r) =>
  r.journal?.medication ||
  r.type === 'medication' ||
  r.organizedFacts?.some((f) => f.type === 'medication')
    ? 'medication'
    : r.journal?.visit || ['visit', 'examination', 'diagnosis'].includes(r.type)
      ? 'visits'
      : isTemperature(r)
        ? 'temperature'
        : symptomRecord(r)
          ? 'course'
          : r.journal?.vaccination
            ? 'history'
            : 'growth'
export function reportFingerprint(input, now = new Date()) {
  const { member, events, ...rest } = input
  return createHash('sha256')
    .update(
      JSON.stringify({
        member: {
          id: member.id,
          name: member.name,
          gender: member.gender,
          birthday: member.birthday,
        },
        events: events.map((e) => ({
          id: e.id,
          title: e.title,
          startTime: e.startTime,
          status: e.status,
        })),
        ...rest,
        due: input.reminders.flatMap((r) =>
          r.occurrences
            .filter((o) => Date.parse(o.scheduledAt) <= now.getTime())
            .map((o) => o.id),
        ),
      }),
    )
    .digest('hex')
}
export function buildVisitSheet(input, preferences = {}, now = new Date()) {
  const sources = []
  const sourceMap = new Map()
  const displayTime = (value) =>
    date(value)
      ? new Intl.DateTimeFormat('zh-CN', {
          timeZone: input.timezone,
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          ...(value.length > 10 ? { hour: '2-digit', minute: '2-digit' } : {}),
        }).format(new Date(value))
      : '未提供'
  const add = (s) => {
    const value = {
      occurredAt: null,
      createdAt: null,
      updatedAt: null,
      identity: '家长记录',
      destinations: [],
      ...s,
    }
    value.destinations = unique([...value.destinations, 'sources'])
    if (!sourceMap.has(value.id)) {
      sources.push(value)
      sourceMap.set(value.id, value)
    }
    return value.id
  }
  const sections = chapters.map(([id, title]) => ({
    id,
    title,
    summary: '',
    blocks: [],
  }))
  const section = (id) => sections.find((s) => s.id === id)
  const block = (id, title, lines, sourceIds, extra = {}) => {
    section(id).blocks.push({
      title,
      lines: lines.filter((v) => v !== ''),
      sourceIds: unique(sourceIds),
      ...extra,
    })
    sourceIds.forEach((ref) => {
      const s = sourceMap.get(ref)
      if (s) s.destinations = unique([...s.destinations, id])
    })
  }
  const records = input.records
    .map((r) => ({
      ...r,
      occurredAt: r.journal?.timePrecision === 'unknown' ? null : r.occurredAt,
      organizedFacts: (input.organizations ?? [])
        .filter(
          (o) =>
            o.recordId === r.id &&
            (!o.sourceRecordUpdatedAt ||
              o.sourceRecordUpdatedAt === r.updatedAt),
        )
        .flatMap((o) => o.healthAIOutput?.facts ?? []).filter(eligibleFact),
    }))
    .sort(byTime)
  for (const r of records)
    add({
      id: `record:${r.id}`,
      recordId: r.id,
      eventId: r.eventId,
      category: recordDestination(r),
      title:
        text(r.journal?.symptom?.narrative) || text(r.content).slice(0, 100),
      text: recordText(r),
      occurredAt: date(r.occurredAt),
      createdAt: date(r.createdAt),
      updatedAt: date(r.updatedAt),
      identity:
        r.sourceType === 'doctor_confirmation' ? '医生记录' : '家长记录',
      destinations: [recordDestination(r)],
    })
  // Only actual symptom records qualify. Event titles, reminders and archive timestamps do not.
  const symptoms = records.filter(
    (r) =>
      symptomRecord(r) &&
      !r.journal?.medication &&
      !/^(嗯|哦|啊|好|好的|记录)?[。！!\s]*$/.test(
        text(r.journal?.symptom?.narrative) || text(r.content),
      ),
  )
  const candidates = symptoms.map((r) => ({
    sourceId: `record:${r.id}`,
    text: text(r.journal?.symptom?.narrative) || text(r.content),
    at: date(r.occurredAt) || date(r.createdAt),
    timeKind: date(r.occurredAt) ? '发生时间' : '最近记录',
  }))
  const focus = preferences.focus ?? { mode: 'auto' }
  const selected =
    focus.mode === 'auto'
      ? symptoms[0]
      : focus.mode === 'source'
        ? symptoms.find((r) => `record:${r.id}` === focus.sourceId)
        : null
  const complaint =
    focus.mode === 'custom'
      ? text(focus.text)
      : selected
        ? text(selected.journal?.symptom?.narrative) || text(selected.content)
        : '尚无有效症状记录，可补充本次想了解的问题'
  const selectedLocations =
    selected?.journal?.symptom?.locations?.map((l) => l.label) ?? []
  const related = symptoms.filter((r) => {
    if (focus.mode === 'custom')
      return (
        text(focus.text).length >= 2 &&
        (text(r.content).includes(text(focus.text)) ||
          text(r.journal?.symptom?.narrative).includes(text(focus.text)))
      )
    if (!selected) return false
    if (r.id === selected.id) return true
    if (selectedLocations.length)
      return (
        (!selected.journal?.symptom?.symptomCategory || r.journal?.symptom?.symptomCategory === selected.journal.symptom.symptomCategory) &&
        (r.journal?.symptom?.locations?.some((l) =>
          selectedLocations.includes(l.label),
        ) ?? false)
      )
    return selected.journal?.symptom?.symptomCategory
      ? r.journal?.symptom?.symptomCategory ===
          selected.journal.symptom.symptomCategory
      : r.eventId === selected.eventId
  })
  const refs = related.map((r) => `record:${r.id}`),
    dates = related
      .map((r) => r.occurredAt)
      .filter(date)
      .sort((a, b) => Date.parse(a) - Date.parse(b))
  const range = { from: dates[0] ?? null, to: dates.at(-1) ?? null }
  block(
    'overview',
    '记录概况',
    related.length
      ? [
          `本次焦点纳入 ${related.length} 条症状记录；不代表独立发作次数。`,
          `最早记录：${displayTime(range.from)}；最近记录：${displayTime(range.to)}。`,
          `最近一条：${text(related[0].journal?.symptom?.narrative) || related[0].content}`,
          '记录之间未填写的时段无法判断，最新记录不等于此刻仍有症状。',
        ]
      : ['关于此主诉暂无足够症状资料。其他已有资料仍保留在对应章节。'],
    refs,
  )
  const counts = new Map()
  const impact = {
    little: '影响较小（家长填写）',
    some: '有些影响（家长填写）',
    clear: '明显影响（家长填写）',
  }
  for (const r of related) {
    const label = impact[r.journal?.symptom?.impactLevel] ?? '影响程度未填写'
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  if (related.length)
    block(
      'overview',
      '症状记录分布',
      [
        `分母为本次纳入的 ${related.length} 条记录，按家长填写的影响程度互斥分类。未填写不补评分。`,
      ],
      refs,
      {
        distribution: [...counts].map(([label, count]) => ({ label, count })),
        locations: unique(
          related.flatMap(
            (r) => r.journal?.symptom?.locations?.map((l) => l.label) ?? [],
          ),
        ),
      },
    )
  const relatedIds = new Set(related.map((r) => r.id))
  const linked = new Set(
    related.flatMap((r) =>
      Object.values(r.journal?.symptom?.linkedRecordIds ?? {}).flat(),
    ),
  )
  const course = records.filter(
    (r) =>
      relatedIds.has(r.id) ||
      linked.has(r.id) ||
      [
        ...(r.journal?.medication?.linkedSymptomRecordIds ?? []),
        ...(r.journal?.visit?.linkedSymptomRecordIds ?? []),
      ].some((id) => relatedIds.has(id)),
  )
  const days = new Map()
  for (const r of course) {
    const day = date(r.occurredAt)
      ? new Intl.DateTimeFormat('sv-SE', {
          timeZone: input.timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date(r.occurredAt))
      : '发生时间未知'
    days.set(day, [...(days.get(day) ?? []), r])
  }
  for (const [day, items] of days)
    block(
      'course',
      `${day} · ${items.length} 条记录`,
      items.map((r) => text(r.journal?.symptom?.narrative) || r.content),
      items.map((r) => `record:${r.id}`),
    )
  section('course').summary =
    '按实际发生时间从近到远整理；只纳入焦点症状及明确关联的处理。其他来源可在完整依据查到。'
  const temperature = []
  for (const r of records) {
    const specific = r.journal?.symptom?.symptomSpecificData?.currentTemperature
    const match = isTemperature(r)
      ? text(r.content).match(
          /(?:体温\s*[：:]?\s*)?(-?\d+(?:\.\d+)?)\s*(?:℃|°C|摄氏度)/i,
        )
      : null
    const measured = finite(specific)
      ? specific
      : match
        ? Number(match[1])
        : null
    const detail =
      [
        {
          oral: '口腔',
          axillary: '腋下',
          ear: '耳温',
          forehead: '额温',
          other: '其他',
        }[r.measurementMethod],
        r.measurementDevice,
        r.note,
      ]
        .filter(Boolean)
        .join(' · ') || '测量部位、方法及设备未提供'
    if (measured !== null && date(r.occurredAt))
      temperature.push({
        value: measured,
        at: r.occurredAt,
        sourceId: `record:${r.id}`,
        detail,
      })
    else
      for (const f of r.organizedFacts.filter(
        (f) =>
          f.type === 'temperature' &&
          finite(f.temperature?.min) &&
          f.temperature.min === f.temperature.max,
      )) {
        const at = date(f.time?.resolvedStart) || date(r.occurredAt)
        if (at)
          temperature.push({
            value: f.temperature.min,
            at,
            sourceId: `record:${r.id}`,
            detail,
            measurementMethod: f.measurementMethod ?? r.measurementMethod,
            measurementDevice: f.measurementDevice ?? r.measurementDevice,
          })
      }
  }
  temperature.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  if (temperature.length)
    block(
      'temperature',
      '体温测量',
      [
        `${temperature.length} 次测量；最高 ${Math.max(...temperature.map((p) => p.value))} ℃；最近 ${temperature.at(-1).value} ℃（${displayTime(temperature.at(-1).at)}）。`,
        '连线仅连接测量值，不表示两次测量间持续同温；测量方法不同的记录需分别理解。',
      ],
      temperature.map((p) => p.sourceId),
      { unit: '℃', points: temperature },
    )
  for (const f of input.facts.filter((f) => f.status !== 'removed')) {
    const id = add({
      id: `fact:${f.id}`,
      category: f.category,
      title: f.title,
      text: [
        f.description,
        readable(f.notes),
        `状态：${statuses[f.status] ?? f.status}`,
      ]
        .filter(Boolean)
        .join('；'),
      occurredAt: date(f.firstObservedAt),
      createdAt: date(f.createdAt),
      updatedAt: date(f.updatedAt),
      identity: '健康档案（保留来源状态）',
      destinations: [f.category === 'allergy' ? 'allergy' : 'history'],
    })
    block(
      f.category === 'allergy' ? 'allergy' : 'history',
      f.title,
      [sourceMap.get(id).text],
      [id],
    )
  }
  for (const archive of input.profiles) {
    for (const [index, row] of (archive.records ?? []).entries()) {
      const items = row._allergyArchive?.items ?? row.items ?? [row]
      for (const item of items) {
        if (item.memberId && item.memberId !== input.member.id) continue
        const id = add({
          id: `profile:${archive.sectionId}:${item.id ?? createHash('sha256').update(JSON.stringify(item)).digest('hex').slice(0,16)}`,
          profileSection: archive.sectionId,
          category: archive.sectionId,
          title:
            item.name ||
            ({
              allergy: '过敏背景',
              'family-history': '家族资料',
              medication: '长期用药',
            }[archive.sectionId] ??
              '健康档案'),
          text: readable(memberScoped(item,input.member.id)) + `；档案修订 ${archive.revision ?? '未提供'}`,
          occurredAt: date(item.occurredAt || item.date || item.firstFoundAt || item.birthDate || item.testedAt || item.startedAt),
          createdAt: date(item.createdAt || item._savedAt),
          updatedAt: date(item.updatedAt || item._savedAt),
          identity: '家长保存的健康档案',
          destinations: [profileDestination(archive.sectionId)],
        })
        if (sourceMap.get(id).text)
          block(
            profileDestination(archive.sectionId),
            sourceMap.get(id).title,
            [sourceMap.get(id).text],
            [id],
          )
      }
    }
  }
  for (const task of input.tasks) {
    const taskSource=add({id:`observation-plan:${task.id}`,category:'observation-plan',title:`${task.displayName} · 观察计划`,text:`${task.displayName}；${task.status==='active'?'进行中':'已归档'}；创建观察计划 ${displayTime(task.createdAt)}。这是观察计划，不代表摄入或症状已发生。`,occurredAt:null,createdAt:date(task.createdAt),updatedAt:date(task.updatedAt),identity:'家长观察计划',destinations:['allergy']})
    const items = task.records.filter((r) => !r.withdrawnAt).sort(byTime)
    const ids = items.map((r) =>
      add({
        id: `observation:${r.id}`,
        taskId: task.id,
        category: 'allergy',
        title: task.displayName,
        text: [
          r.symptomAnswer === 'present'
            ? '记录有变化'
            : r.symptomAnswer === 'absent'
              ? '明确未见新变化'
              : '结果未填',
          ...(r.symptoms ?? []),
          r.note,
          r.actualFood,
          r.amount,
          r.exposureAnswer === 'eaten' ? '家长确认有摄入' : r.exposureAnswer === 'not_eaten' ? '家长明确未摄入' : '摄入情况未填写',
          r.preparation,
          r.status === 'draft' ? '未提交草稿，不计入有效观察' : '',
        ]
          .filter(Boolean)
          .join('；'),
        occurredAt: date(r.occurredAt),
        createdAt: date(r.createdAt),
        updatedAt: date(r.updatedAt),
        identity: '家长排敏观察',
        destinations: ['allergy'],
      }),
    )
    const effective = items.filter((r) => r.status === 'effective')
    const distribution = [
      ['present', '记录有变化'],
      ['absent', '明确未见新变化'],
      [null, '结果未填'],
    ].map(([key, label]) => ({
      label,
      count: effective.filter(
        (r) =>
          r.symptomAnswer === key || (key === null && r.symptomAnswer == null),
      ).length,
    }))
    const linkedDiet = (task.linkedRecords ?? [])
      .filter((r) => r.relation === 'confirmed')
      .map((r) => `record:${r.recordId}`)
      .filter((id) => sourceMap.has(id))
    block(
      'allergy',
      `${task.displayName} · ${task.status === 'active' ? '进行中' : '已归档'}`,
      [
        `创建观察计划：${displayTime(task.createdAt)}；${effective.length} 条有效观察，${items.length - effective.length} 条草稿另列。`,
        `最近结果：${items[0] ? sourceMap.get(ids[0]).text : '尚无观察记录'}`,
        `关联饮食 ${linkedDiet.length} 条（来自已有食物关联，尚不能据此确认同属本次过程），不重复计入观察结果。`,
        '分类是观察记录构成，不表示过敏概率或因果判断。',
      ],
      [taskSource, ...ids, ...linkedDiet],
      { distribution, taskId: task.id },
    )
  }
  const completionRecords = new Set()
  for (const reminder of input.reminders) {
    const planSource=add({id:`medication-plan:${reminder.id}`,category:'medication-plan',title:`${reminder.plan.medicationName} · 用药计划`,text:`原记录计划：${reminder.plan.medicationName}；开始 ${reminder.plan.startDate}；结束 ${reminder.plan.endDate||'未提供'}；计划用量 ${reminder.plan.amount} ${reminder.plan.unit}；${statuses[reminder.plan.route]??reminder.plan.route}；${reminder.plan.times.join('、')}。计划不代表已使用。`,occurredAt:null,createdAt:date(reminder.createdAt),updatedAt:date(reminder.updatedAt),identity:'家长用药计划',destinations:['medication']})
    const due = reminder.occurrences.filter(
      (o) => Date.parse(o.scheduledAt) <= now.getTime(),
    )
    const future = reminder.occurrences.filter(
      (o) => Date.parse(o.scheduledAt) > now.getTime(),
    )
    const ids = due.map((o) => {
      if (o.completion?.recordId) completionRecords.add(o.completion.recordId)
      const linked=records.find(r=>r.id===o.completion?.recordId)
      return add({
        id: `dose:${o.id}`,
        category: 'medication',
        title: reminder.plan.medicationName,
        text: `计划：${displayTime(o.scheduledAt)}；${o.completed ? '确认已服，实际时间 ' + displayTime(o.completion.actualTakenAt) : '尚未确认'}；计划用量 ${reminder.plan.amount} ${reminder.plan.unit}，${statuses[reminder.plan.route]??reminder.plan.route}${linked?'\n关联的实际服用记录：'+recordText(linked):o.completion?.recordId?'\n关联的使用记录已失效，以上仅保留独立执行确认。':''}${linked && linked.occurredAt!==o.completion?.actualTakenAt?'\n关联使用记录发生时间：'+displayTime(linked.occurredAt)+'；与执行确认时间不同，待核对。':''}`,
        occurredAt: o.completion?.actualTakenAt ?? null,
        createdAt: o.completed ? o.completion?.completedAt ?? null : reminder.createdAt,
        updatedAt: reminder.updatedAt,
        identity: o.completed ? '家长执行确认' : '计划节点（不是服用事实）',
        recordId: linked?.id,
        eventId: linked?.eventId,
        destinations: ['medication'],
      })
    })
    block(
      'medication',
      reminder.plan.medicationName,
      [
        `计划：${reminder.plan.startDate} 至 ${reminder.plan.endDate ?? (reminder.plan.longTerm ? '长期（尚无结束日期）' : `${reminder.plan.durationDays ?? '未提供'} 天`)}；${reminder.plan.amount} ${reminder.plan.unit}；${{ oral: '口服', topical: '外用', inhaled: '吸入', nasal: '鼻用', ophthalmic: '眼用', other: '其他' }[reminder.plan.route] ?? reminder.plan.route ?? '途径未提供'}；${reminder.plan.times.join('、')}${reminder.plan.mode === 'interval' ? `，间隔 ${reminder.plan.intervalHours} 小时` : ''}。`,
        `分母为截至 ${displayTime(now.toISOString())} 已到期的 ${due.length} 个计划节点；未来 ${future.length} 个节点另列。`,
        '现有执行接口不提供“明确未服”状态，未确认不会归为漏服。',
      ],
      [planSource,...ids],
      {
        reminderId: reminder.id,
        distribution: [
          { label: '确认已服', count: due.filter((o) => o.completed).length },
          { label: '尚未确认', count: due.filter((o) => !o.completed).length },
        ],
      },
    )
    if (future.length)
      block(
        'medication',
        '未来计划（不计入执行分母）',
        future.map(
          (o) =>
            `${displayTime(o.scheduledAt)} · ${reminder.plan.medicationName}`,
        ),
        [planSource],
      )
  }
  for (const r of records.filter(
    (r) =>
      recordDestination(r) === 'medication' && !completionRecords.has(r.id),
  ))
    block('medication', '独立服用记录', [r.content], [`record:${r.id}`])
  for (const [field, title, unit] of [
    ['heightCm', '身高', 'cm'],
    ['weightKg', '体重', 'kg'],
  ]) {
    const points = input.growth
      .filter((g) => finite(g[field]) && date(g.measuredAt))
      .map((g) => {
        const id = add({
          id: `growth:${g.id}:${field}`,
          category: 'growth',
          title: `${title}测量`,
          text: `${g[field]} ${unit}；${g.dataStatus === 'pending_confirmation' ? '待核对' : '已保存'}${g.note ? `；${g.note}` : ''}`,
          occurredAt: g.measuredAt,
          createdAt: g.createdAt,
          updatedAt: g.updatedAt,
          identity: '成长测量记录',
          destinations: ['growth'],
        })
        return {
          value: g[field],
          at: g.measuredAt,
          sourceId: id,
          detail: g.dataStatus === 'pending_confirmation' ? '待核对' : '',
        }
      })
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    if (points.length)
      block(
        'growth',
        title,
        [
          `${points.length} 条测量来源，${new Set(points.map((p) => p.at.slice(0, 10))).size} 个测量日期。`,
          points.length > 1
            ? `${points[0].value} → ${points.at(-1).value} ${unit}，记录差值 ${Number((points.at(-1).value - points[0].value).toFixed(2))} ${unit}。`
            : '仅有一个点，不生成趋势。',
        ],
        points.map((p) => p.sourceId),
        { points, unit },
      )
  }
  const daily = records.filter((r) => recordDestination(r) === 'growth')
  const sleep = daily.filter(
    (r) =>
      r.journal?.sleep?.status !== 'ongoing' &&
      finite(r.journal?.sleep?.durationMinutes),
  )
  if (sleep.length)
    block(
      'growth',
      '已完成睡眠样本',
      [
        `${sleep.length} 条睡眠记录，记录平均时长 ${Math.round(sleep.reduce((s, r) => s + r.journal.sleep.durationMinutes, 0) / sleep.length)} 分钟。仅代表这些样本，不代表未记录的每一天。`,
      ],
      sleep.map((r) => `record:${r.id}`),
    )
  for (const r of daily)
    block(
      'growth',
      r.journal?.sleep
        ? '睡眠记录'
        : r.journal?.bowel
          ? '排便记录'
          : '日常记录',
      [r.content],
      [`record:${r.id}`],
    )
  for (const r of records.filter((r) =>
    ['history', 'visits'].includes(recordDestination(r)),
  ))
    block(
      recordDestination(r),
      r.journal?.visit?.institutionName ||
        (r.journal?.vaccination ? '疫苗记录' : '就诊 / 既有记录'),
      [r.content],
      [`record:${r.id}`],
    )
  for (const a of input.attachments)
    add({
      id: `attachment:${a.id}`,
      attachmentId: a.id,
      eventId: a.eventId,
      recordId: a.recordId,
      category: 'attachment',
      title: a.name,
      text: `${a.name}；${a.mimeType}；关联记录：${a.recordId ?? '未提供'}。附件副本不增加症状条数。`,
      createdAt: a.createdAt,
      mimeType: a.mimeType,
      identity: '原始附件',
      destinations: ['sources'],
    })
  for(const resource of input.profileResources??[])add({
    id:`profile-image:${resource.resourceId}`,category:'attachment',title:resource.title,
    text:`家长保存的档案原件；${resource.mimeType}。不代表已完整解析。`,
    profileSection:resource.sectionId,relatedSourceIds:[resource.parentId],
    contentPath:`/api/members/${encodeURIComponent(input.member.id)}/visit-sheet/resources/${resource.resourceId}`,
    mimeType:resource.mimeType,createdAt:resource.uploadedAt,identity:'家长保存的档案原件',destinations:[profileDestination(resource.sectionId)],
  })
  // Preserve legacy summaries as explicitly labelled sources, never as counted symptom/measurement facts.
  for (const e of input.events.filter((e) => e.medicalPreparation))
    add({
      id: `legacy:${e.id}`,
      eventId: e.id,
      category: 'legacy',
      title: '旧版情况单',
      text: e.medicalPreparation.summary.text,
      createdAt: e.medicalPreparation.createdAt,
      updatedAt: e.medicalPreparation.updatedAt,
      identity: '旧报告快照（不重复计入统计）',
      destinations: ['sources'],
    })
  section('overview').summary = related.length
    ? `这份报告围绕“${complaint}”整理已有事实。`
    : '先保留已有资料，再补充本次想了解的问题。'
  section('sources').summary =
    `共 ${sources.length} 个来源条目；条目包括原始记录、计划节点、测量和附件，不等于患病次数或主动记录次数。`
  for (const s of sections)
    if (!s.summary)
      s.summary = s.blocks.length
        ? '根据已保存资料整理；全部提炼保留来源入口。'
        : '本章暂无可读取资料。未提供不等于没有相关经历。'
  return refineVisitSheet({
    memberId: input.member.id,
    member: {
      name: input.member.name,
      gender: input.member.gender ?? null,
      birthday: input.member.birthday ?? null,
    },
    timezone: input.timezone,
    focus,
    complaint,
    complaintSourceId: selected ? `record:${selected.id}` : null,
    focusSourceIds: refs,
    range,
    question: preferences.question ?? '',
    notes: preferences.notes ?? {},
    sources,
    chapters: sections,
    candidates,
    warnings: input.warnings ?? [],
    dataAsOf: now.toISOString(),
    generatedAt: now.toISOString(),
    fingerprint: reportFingerprint(input, now),
    changes: [],
  }, input, preferences)
}
