// A view of saved, provenance-bearing facts; never parse free-form medical text.
const clean = value => typeof value === 'string' ? value.trim() : ''
const lines = value => Array.isArray(value) ? value.map(clean).filter(Boolean) : []
const unique = values => [...new Set(values.filter(Boolean))]
export function currentSituation(report, input, edits = {}) {
  const focused = new Set(report.focusSourceIds)
  const records = input.records.filter(r => focused.has(`record:${r.id}`))
  const symptoms = [], diet = [], changes = [], treatment = [], raw = []
  const add = (target, text, record, kind = 'symptom', emphasize = false) => {
    text = clean(text)
    if (text && !target.some(line => line.text === text)) target.push({text, kind, emphasize, sourceIds:[`record:${record.id}`]})
  }
  const savedField = (field,record) => field.editedBy === 'user' || field.sources?.some(s => s.quote && (record.sourceText || record.content)?.includes(s.quote))
  const addDiet = record => {
    const d=record.journal?.diet,p=record.aiProvenance
    if(d) add(diet,[record.journal.timeLabel,...lines(d.foods),d.name,...lines(d.firstTryFoods).map(food=>`新添加${food}`),d.amount].filter(Boolean).join('，'),record,'diet')
    else if(p?.confirmed && p.category==='diet') add(diet,[p.timeText,...(p.fields??[]).filter(f=>['food','amount','unit'].includes(f.name)&&savedField(f,record)).map(f=>f.value)].filter(Boolean).join('，'),record,'diet')
  }
  for (const record of records) {
    const original = record.sourceText || record.content
    if (original && !raw.some(s => s.text === original)) raw.push({text:original, sourceId:`record:${record.id}`})
    const facts = (input.organizations ?? []).filter(o => o.recordId === record.id && (!o.sourceRecordUpdatedAt || o.sourceRecordUpdatedAt === record.updatedAt)).flatMap(o => o.healthAIOutput?.facts ?? [])
    for (const f of facts) {
      if (f.status === 'superseded' || ['future','conditional'].includes(f.temporality) || ['family_member','other_person'].includes(f.subject) || (f.subjectMemberId && f.subjectMemberId !== input.member.id) || ['quoted_text','internet_information'].includes(f.source)) continue
      const quote = clean(f.originalText || f.sourceText)
      if (!quote || !original?.includes(quote)) continue
      if (['symptom','temperature'].includes(f.type)) add(symptoms,quote,record,f.type,f.polarity === 'negated' || f.type === 'temperature')
      // A parent's explicitly uncertain observation retains its original wording.
      if (['concern','diagnosis'].includes(f.type) && f.bodyPart && (f.polarity === 'uncertain' || f.diagnosisCertainty === 'suspected')) add(symptoms,quote,record,'concern')
      if (f.type === 'status_change') add(changes,quote,record)
      if (f.type === 'medication' && f.medicationAction === 'taken') add(treatment,quote,record)
    }
    const provenance = record.aiProvenance
    if (provenance?.confirmed) for (const field of provenance.fields ?? []) {
      const text = clean(field.value)
      if (!savedField(field,record)) continue
      if (provenance.category === 'symptom' && field.name === 'symptom') add(symptoms,text,record)
      if (provenance.category === 'symptom' && field.name === 'temperature') add(symptoms,text,record,'temperature',true)
      if (field.name === 'handling' && provenance.category === 'symptom') add(treatment,text,record)
    }
    const symptom = record.journal?.symptom
    if (!symptoms.some(s => s.kind === 'temperature' && s.sourceIds.includes(`record:${record.id}`))) {
      const value = symptom?.symptomSpecificData?.currentTemperature
      if (typeof value === 'number' && Number.isFinite(value) && record.occurredAt && symptom) add(symptoms,`${value} °C`,record,'temperature',true)
    }
    if (!symptoms.some(s => s.sourceIds.includes(`record:${record.id}`))) {
      for (const value of lines(symptom?.associatedSymptoms)) add(symptoms,value,record)
    }
    addDiet(record)
    for(const note of record.journal?.aiNurse?.professionalNotes ?? []) {
      if(note.category!=='prior_action' || note.certainty==='denied') continue
      const turns=record.journal.aiNurse.turns ?? []
      if(note.editedByUser || note.sourceTurnIds?.some(id=>turns.some(turn=>turn.id===id&&turn.role==='user'))) add(treatment,note.text,record)
    }
  }
  // Only explicitly linked diet records belong to the case; temporal proximity is not a link.
  const dietIds = new Set(records.flatMap(r => r.journal?.symptom?.linkedRecordIds?.diet ?? []))
  const groups=new Set(records.filter(r=>r.aiProvenance?.confirmed && r.aiProvenance.groupKey).map(r=>r.aiProvenance.groupKey))
  for (const record of input.records.filter(r => (dietIds.has(r.id) || (r.aiProvenance?.confirmed && groups.has(r.aiProvenance.groupKey))) && report.sources.some(s => s.id === `record:${r.id}`))) addDiet(record)
  const key = report.photoKey
  const override = report.focus.mode === 'source' && !report.complaintSourceId ? {} : edits[key] ?? {}
  const apply = (block, values) => Object.hasOwn(override,block) ? override[block].split('\n').filter(value => value.trim()).map(text => ({text,kind:values.find(line=>line.text===text)?.kind ?? block,sourceIds:report.focusSourceIds})) : values
  const factual = [...symptoms.filter(s => s.kind !== 'concern').map(s => s.text),...diet.map(s => s.text)]
  return {
    scopeKey:key,
    description: Object.hasOwn(override,'description') ? override.description : report.caseDetails?.description || (factual.length ? unique(factual).join('；') : report.reading.description),
    symptoms:apply('symptoms',symptoms), diet:apply('diet',diet),
    changes: [...(report.reading.onset ? [{text:report.reading.onset,sourceIds:report.reading.sourceIds}] : []),...(report.reading.change ? [{text:report.reading.change,sourceIds:report.reading.sourceIds}] : []),...changes],
    treatment, raw,
  }
}
