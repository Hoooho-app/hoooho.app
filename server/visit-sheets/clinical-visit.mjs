import { createHash } from 'node:crypto'
import { sourceChronology } from './reading-context.mjs'

const week = 7 * 24 * 60 * 60 * 1000
const history = {
  sneeze: ['打喷嚏', '打喷嚏|喷嚏'],
  runnyNose: ['流鼻涕', '流鼻涕|流涕|流清鼻涕|流清涕'],
  congestion: ['鼻塞', '鼻塞'],
  cough: ['咳嗽', '咳嗽|咳'],
  sputum: ['咳痰', '咳痰|痰'],
  soreThroat: ['咽痛', '咽痛|咽喉痛|嗓子疼|喉咙痛|喉咙疼'],
  nausea: ['恶心', '恶心'],
  vomiting: ['呕吐', '呕吐|吐了|吐奶'],
  tinnitus: ['耳鸣', '耳鸣'],
  earPain: ['耳痛', '耳痛|耳朵痛|耳朵疼'],
  hearing: ['听力下降', '听力下降|听力减退'],
  dizziness: ['头晕', '头晕|眩晕'],
  warmHead: ['头热', '头热|头发热|额头热'],
  fever: ['发热', '发热|发烧'],
  headache: ['头痛', '头痛|头疼'],
  abdominalPain: ['腹痛', '腹痛|肚子痛|肚子疼'],
  diarrhea: ['腹泻', '腹泻|拉肚子'],
  constipation: ['便秘', '便秘|排便困难'],
  rash: ['皮疹', '皮疹|红疹|红点|起疹'],
  itching: ['瘙痒', '瘙痒|发痒|皮肤痒'],
  breathing: ['呼吸困难', '呼吸困难|呼吸费力'],
}
const exam = {
  alert: ['神志清', '神志清(?:楚|醒)?|意识清醒', '神志不清|意识不清'],
  energy: ['精神可', '精神可|精神尚可|精神好|精神状态良好', '精神差|精神欠佳|精神状态不佳'],
  stableVitals: ['生命体征平稳', '生命体征[：:]?(?:平稳|稳定)', '生命体征[：:]?不(?:平稳|稳定)'],
  turbinate: ['双侧下鼻甲肿大', '双侧下鼻甲肿大', '双侧下鼻甲无肿大|未见双侧下鼻甲肿大'],
  nasalPassage: ['总鼻道清晰', '总鼻道清晰', '总鼻道不清晰'],
  clearDischarge: ['可见清涕', '可见清涕|可见清鼻涕', '未见清涕|未见清鼻涕|无清涕'],
  breathingStable: ['呼吸平稳', '呼吸平稳', '呼吸不平稳'],
  abdomenSoft: ['腹软', '腹软|腹部柔软', '腹部不软'],
  abdominalTenderness: ['腹部压痛', '腹部压痛|腹部有压痛', '腹部无压痛|无腹部压痛'],
  visibleRash: ['可见皮疹', '可见皮疹', '未见皮疹|无皮疹'],
}

const nasalHistory = ['sneeze', 'runnyNose', 'congestion', 'cough', 'sputum', 'soreThroat', 'nausea', 'vomiting', 'tinnitus', 'earPain', 'hearing', 'dizziness', 'warmHead', 'fever']
const groups = [
  { match: /喷嚏|流[清鼻]*涕|鼻塞|鼻痒|鼻(?:子)?(?:反复)?出血|鼻血|耳鸣|耳痛|听力/, category: 'ent', symptoms: nasalHistory, findings: ['turbinate', 'nasalPassage', 'clearDischarge'] },
  { match: /咳|咽|喉|喘|呼吸/, category: 'respiratory', symptoms: ['cough', 'sputum', 'soreThroat', 'breathing', 'fever', 'nausea', 'vomiting', 'headache', 'dizziness'], findings: ['breathingStable'] },
  { match: /恶心|呕吐|吐奶|腹痛|肚子|腹泻|便秘|排便/, category: 'gastrointestinal', symptoms: ['nausea', 'vomiting', 'abdominalPain', 'diarrhea', 'constipation', 'fever'], findings: ['abdomenSoft', 'abdominalTenderness'] },
  { match: /皮疹|红疹|红点|皮肤|湿疹|痒/, category: 'skin', symptoms: ['rash', 'itching', 'fever'], findings: ['visibleRash'] },
  { match: /头疼|头痛|头晕|头热/, category: 'pain', symptoms: ['headache', 'dizziness', 'warmHead', 'nausea', 'vomiting', 'fever'] },
]
const symptomsByAlias = Object.entries(history)
  .flatMap(([id, [, aliases]]) => aliases.split('|').map(alias => [alias, id]))
  .sort(([a], [b]) => b.length - a.length)
const symptomPrefix = new RegExp(`^(${symptomsByAlias.map(([alias]) => alias).join('|')})`)
const aliasId = new Map(symptomsByAlias)
const examPatterns = Object.entries(exam).map(([id, [, yes, no]]) => [
  id, new RegExp(`^(?:${yes})(?:[：:]是)?$`), new RegExp(`^(?:(?:${no})|(?:${yes})[：:]否)$`),
])
const clean = value => typeof value === 'string' ? value.trim() : ''
const recentDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' })

// Only complete, explicitly stated phrases qualify. Uncertain, hypothetical
// and other-person sentences remain text and never become checklist answers.
function symptomStatements(clause, afterNegation) {
  const text = clause
    .replace(/^(?:(?:现病史|主诉|伴随症状)[：:]|(?:孩子|宝宝|患儿|患者)|(?:近[一两二三四五六七\d]+[天周]|[一两二三四五六七\d]+[天周]前|昨日|昨天|今天|昨晚|今早|目前|现在|至今)(?:开始|出现)?|开始)+/, '')
    .replace(/(?:等不适|等症状)$/, '')
  const absent = /^(?:并|也|均)?(?:没有|未出现|未见|未诉|否认|无)/.exec(text)
  const present = /^(?:仍有|出现|伴有|伴|偶有|有)/.exec(text)
  if (afterNegation && !absent && !present) return []
  let rest = text.slice((absent ?? present)?.[0].length ?? 0)
  const matches = []
  while (rest) {
    const alias = symptomPrefix.exec(rest)?.[1]
    if (!alias) return []
    matches.push([aliasId.get(alias), !absent])
    rest = rest.slice(alias.length).replace(/^(?:和|及|与|、)(?=.)/, '')
  }
  return matches
}

function clauses(value) {
  // Keep the whole sentence together when it is framed as a question or
  // speculation, so a trailing fragment cannot become a claimed observation.
  return clean(value).split(/(?<=[。！？?!\n])/).filter(sentence =>
    !/[？?]|如果|假如|会不会|是否|可能|怀疑|不确定|说不清|我想问|请问|建议|爸爸|妈妈|家人|哥哥|姐姐|弟弟|妹妹/.test(sentence),
  ).map(sentence => sentence.split(/[，,。；;！!\n]|但(?:是)?/).map(part => part.replace(/\s+/g, '')).filter(Boolean))
}

function historyStatements(value) {
  return clauses(value).flatMap(sentence => {
    let afterNegation = false
    return sentence.flatMap(clause => {
      const statements = symptomStatements(clause, afterNegation)
      if (statements.length) afterNegation = !statements[0][1]
      return statements
    })
  })
}

const assessmentLabel = '(?:(?:初步|临床|医生|西医|中医|入院|出院)?诊断|(?:基本|初步|医生)判断)'
const assessmentHeading = new RegExp(`^${assessmentLabel}[：:]?$`)
const labeledAssessment = new RegExp(`^${assessmentLabel}\\s*[：:]\\s*(.+)$`)

function statedAssessments(value) {
  return clean(value).split(/[。；;\n]+/).flatMap(line => {
    const match = labeledAssessment.exec(line.trim())
    return match ? [match[1].trim()] : []
  })
}

function recordClinicalText(record) {
  const visit = record.journal?.visit
  const materials = visit?.materials
  const blocks = materials?.status === 'reviewed' && materials.source !== 'external_ai' ? materials.blocks ?? [] : []
  const doctor = record.sourceType === 'doctor_confirmation' || record.caseContext?.identity === 'medical_consultation'
  const confirmedDoctor = record.caseContext
    ? record.caseContext.identity === 'medical_consultation' && record.caseContext.confirmed === true
    : record.sourceType === 'doctor_confirmation'
  const primary = clean(record.journal?.symptom?.narrative) || clean(record.content)
  return {
    history: [primary, ...(record.journal?.symptom?.associatedSymptoms ?? []), visit?.doctorStatement,
      ...blocks.filter(block => /主诉|现病史|病程|病情/.test(block.title)).map(block => block.text)],
    examination: [doctor ? primary : '', visit?.doctorStatement, ...blocks.filter(block => /查体|体格|体征/.test(block.title)).map(block => block.text)],
    assessment: [
      ...blocks.filter(block => assessmentHeading.test(clean(block.title))).map(block => ({ text: clean(block.text), origin: '病历记录' })),
      ...(confirmedDoctor ? statedAssessments(primary).map(text => ({ text, origin: '医生记录' })) : []),
      ...statedAssessments(visit?.doctorStatement).map(text => ({ text, origin: '医生意见（家长转述）' })),
    ],
  }
}

export function clinicalVisit(report, records, edits = {}) {
  const picked = records.find(record => `record:${record.id}` === report.complaintSourceId)
  const focusIds = new Set(report.focusSourceIds)
  const linkedSymptoms = new Set(report.focus.relatedSourceIds ?? [])
  const episode = picked?.eventId ?? report.focus.caseEventId
  const focused = records.filter(record => {
    const id = `record:${record.id}`
    return focusIds.has(id) && (!episode || record.eventId === episode || linkedSymptoms.has(id))
  }).sort(sourceChronology)
  const scopeKey = picked || report.focus.mode === 'custom'
    ? report.focus.caseEventId
      ? `case:${report.focus.caseEventId}:${createHash('sha256').update(report.photoKey).digest('hex')}`
      : report.photoKey
    : null
  const end = Date.parse(report.dataAsOf)
  const anchor = Date.parse((picked ?? focused[0])?.occurredAt)
  const through = Number.isFinite(anchor) && anchor < end - week ? anchor : end
  const from = through - week
  const during = record => {
    const at = Date.parse(record.occurredAt)
    return at >= from && at <= through
  }
  const symptoms = focused.filter(record => during(record) || (record === picked && !record.occurredAt))
  const symptomIds = new Set(symptoms.map(record => record.id))
  const linkedVisits = new Set(symptoms.flatMap(record => record.journal?.symptom?.linkedRecordIds?.visit ?? []))
  const context = scopeKey ? records.filter(record =>
    symptomIds.has(record.id) || (during(record) && (
      record.eventId === episode || linkedVisits.has(record.id) ||
      record.journal?.visit?.linkedSymptomRecordIds?.some(id => symptomIds.has(id))
    )),
  ).sort(sourceChronology) : []
  const candidates = groups.filter(group =>
    group.match.test(report.complaint) || group.category === picked?.journal?.symptom?.symptomCategory,
  )
  const template = {
    history: [...new Set([...candidates.flatMap(group => group.symptoms), 'fever'])],
    examination: ['alert', 'energy', 'stableVitals', ...candidates.flatMap(group => group.findings ?? [])],
  }
  const recent = { history: new Map(), examination: new Map() }
  const assessment = new Map()
  for (const record of context) {
    const { history: historyText, examination: examText, assessment: judgments } = recordClinicalText(record)
    for (const item of judgments) {
      if (item.text && !assessment.has(item.text)) assessment.set(item.text, { ...item, sourceId: `record:${record.id}` })
    }
    const findings = {
      history: historyText.flatMap(historyStatements),
      examination: examText.flatMap(value => clauses(value).flat().flatMap(clause => {
        const text = clause.replace(/^(?:查体|体格检查|体格情况)[：:]/, '')
        return examPatterns.flatMap(([id, yes, no]) => yes.test(text) ? [[id, true]] : no.test(text) ? [[id, false]] : [])
      })),
    }
    for (const section of ['history', 'examination']) {
      const at = record.occurredAt ?? null
      for (const [id, value] of findings[section]) {
        const entry = recent[section].get(id)
        if (!entry) recent[section].set(id, { value, at, sourceIds: [`record:${record.id}`] })
        else if (entry.at === at && entry.value !== value) {
          entry.value = null
          if (!entry.sourceIds.includes(`record:${record.id}`)) entry.sourceIds.push(`record:${record.id}`)
        }
      }
    }
  }
  const manual = scopeKey ? edits[scopeKey] : undefined
  function rows(section, fields) {
    const saved = manual?.[section] ?? {}
    const values = recent[section]
    const keys = [...new Set([...template[section], ...values.keys(), ...Object.keys(saved)])]
    return keys.map(id => {
      const edit = saved[id]
      const fact = values.get(id)
      return {
        id,
        label: fields[id]?.[0] ?? edit.label,
        value: edit ? edit.value : fact?.value ?? null,
        sourceIds: edit ? [] : fact?.sourceIds ?? [],
        ...(edit ? { manual: true } : fact?.at ? { at: fact.at } : {}),
      }
    })
  }
  const onsetRecord = picked ?? symptoms[0]
  const onset = onsetRecord?.journal?.symptom?.onsetApprox
  const onsetLabel = {
    just_now: '刚刚开始', today: '当天开始', yesterday: '前一天开始',
    two_three_days: '两三天前开始', within_week: '一周内开始', earlier: '更早开始',
  }[onset]
  const timeline = [...symptoms].reverse().map(record => ({
    text: clean(record.journal?.symptom?.narrative) || clean(record.content),
    at: record.occurredAt ?? null, sourceId: `record:${record.id}`,
  })).filter(entry => entry.text)
  const manualHistory = report.currentSituationEdits?.[report.photoKey]?.description
  return {
    scopeKey,
    range: scopeKey ? { from: recentDate.format(from), to: recentDate.format(through) } : null,
    onset: onsetLabel ? `原记录填写${onsetLabel}` : '',
    historyNote: manualHistory || '',
    timeline,
    history: rows('history', history),
    examination: rows('examination', exam),
    assessment: [...assessment.values()],
  }
}

export function applyClinicalEdit(previous, target, patch) {
  const conflict = !patch.scopeKey || patch.scopeKey !== target.scopeKey || patch.scopeKey !== previous?.clinical?.scopeKey
  if (conflict) throw Object.assign(new Error('主诉已变化，请核对当前情况单后再补充'), { status: 409 })
  const { scopeKey, section, id, value } = patch
  const rows = target[section]
  const row = rows.find(item => item.id === id)
  const custom = /^custom:[a-f0-9-]{36}$/.test(id)
  const label = clean(patch.label)
  if (!row && (!custom || !label || value === null)) throw new Error('请选择有效项目或填写新增项目名称')
  if (patch.label !== undefined && (!custom || row || label.length > 60 || rows.some(item => item.label === label))) throw new Error('项目名称重复或格式无效')
  const edits = { ...previous.clinicalEdits }
  const scope = { ...edits[scopeKey] }
  const fields = { ...scope[section] }
  if (custom && !row && Object.keys(fields).filter(key => key.startsWith('custom:')).length >= 40) throw new Error('当前栏目最多可添加 40 个自定义项目')
  if (custom && value === null) delete fields[id]
  else fields[id] = { value, ...(custom ? { label: row?.label ?? label } : {}) }
  return { ...edits, [scopeKey]: { ...scope, [section]: fields } }
}
