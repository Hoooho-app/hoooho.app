// Deterministic presentation projection. No diagnosis, free-form model output,
// image interpretation or demo values are used here.
const validDate = v => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null
const uniq = xs => [...new Set(xs.filter(Boolean))]
export const focusKey = focus => focus.mode === 'custom' ? `custom:${focus.text.trim()}` : focus.mode === 'source' ? focus.sourceId : 'auto'
const concise = s => String(s || '').replace(/^(?:嗯[，,。\s]*)+/, '').trim()
const label = { oral: '口服', topical: '外用', inhaled: '吸入', nebulized: '雾化', nasal: '鼻用', ophthalmic: '眼用', other: '其他' }
const role = r => r.sourceType === 'medical_file' ? '医疗文件记录（以原件为准）' : r.sourceType === 'doctor_confirmation' ? '医生确认记录' : r.journal?.visit ? '家长就诊记录 / 医生意见转述' : '家长记录'
export function refineVisitSheet(report, input, preferences) {
  const chapter = id => report.chapters.find(c => c.id === id)
  const byId = new Map(report.sources.map(s => [s.id, s]))
  const refs = new Set(report.focusSourceIds)
  const records = new Map(input.records.map(r => [r.id, r]))
  const display = v => validDate(v) ? new Intl.DateTimeFormat('zh-CN', {timeZone: input.timezone,year:'numeric',month:'numeric',day:'numeric',...(v.length > 10 ? {hour:'2-digit',minute:'2-digit'} : {})}).format(new Date(v)) : '未提供'
  report.schemaVersion = 5
  report.scope = '当前孩子全部已保存且可访问的健康记录、档案、测量、观察、提醒计划与附件；摘要仅选本次焦点相关资料。未关联资料保留在后文。'
  report.photoSelections = { ...(preferences.photoSelections ?? {}) }
  report.photoKey = report.complaintSourceId || focusKey(report.focus)
  for (const [index, s] of report.sources.entries()) {
    s.code = `SRC-${String(index + 1).padStart(3, '0')}`
    const r = records.get(s.recordId)
    if (s.id.startsWith('record:') && r) {
      s.identity = role(r)
      s.locations = r.journal?.symptom?.locations?.map(l => l.label) ?? []
      s.symptomCategory = r.journal?.symptom?.symptomCategory ?? null
      s.narrative = concise(r.journal?.symptom?.narrative || r.content)
      s.impactLevel = r.journal?.symptom?.impactLevel ?? null
      s.timePrecision = r.journal?.timePrecision ?? 'exact'
      if (s.timePrecision === 'unknown') { s.occurredAt=null; s.text += '\n发生时间未知；录入时间另列。' }
      else if (s.timePrecision !== 'exact') s.text += `\n原记录时间精度：${s.timePrecision === 'day' ? '日期' : '时段'}；不是精确发生时刻。`
      s.relatedSourceIds = uniq([
        ...Object.values(r.journal?.symptom?.linkedRecordIds ?? {}).flat(),
        ...(r.journal?.medication?.linkedSymptomRecordIds ?? []),
        ...(r.journal?.visit?.linkedSymptomRecordIds ?? []),
      ]).map(id => `record:${id}`).filter(id => byId.has(id))
    }
  }
  report.photos = input.attachments.filter(a => /^image\/(png|jpeg|webp|gif)$/i.test(a.mimeType)).map(a => {
    const r = records.get(a.recordId)
    // Explicit record link only: same event / upload date is not evidence of relevance.
    const linkedRecords = input.records.filter(r => r.id === a.recordId || (r.attachmentIds ?? []).includes(a.id) || Object.values(r.journal ?? {}).some(j => j && typeof j === 'object' && (j.photoIds ?? []).includes?.(a.id)))
    return {
      sourceId: `attachment:${a.id}`, relatedSourceIds: linkedRecords.map(r => `record:${r.id}`),
      title: a.name, location: uniq(linkedRecords.flatMap(r => r.journal?.symptom?.locations?.map(l => l.label) ?? [])).join('、') || '对象 / 部位未提供',
      capturedAt: validDate(a.capturedAt), uploadedAt: validDate(a.createdAt),
      timeKind: validDate(a.capturedAt) ? '拍摄于' : '上传于（拍摄时间未提供）',
      mimeType: a.mimeType,
    }
  }).sort((a,b) => (Date.parse(b.capturedAt || b.uploadedAt) || 0) - (Date.parse(a.capturedAt || a.uploadedAt) || 0))
  report.photos.push(...(input.profileResources??[]).filter(r=>r.mimeType.startsWith('image/')).map(r=>({sourceId:`profile-image:${r.resourceId}`,relatedSourceIds:[],title:r.title,location:'档案原件（未关联本次主诉）',capturedAt:null,uploadedAt:validDate(r.uploadedAt),timeKind:'保存于（拍摄时间未提供）',mimeType:r.mimeType})))
  report.photoCandidates = report.photos.filter(p => p.relatedSourceIds.some(id => refs.has(id))).map(p => p.sourceId)
  const selected = report.photoSelections[report.photoKey]
  report.selectedPhotoIds = selected === undefined ? report.photoCandidates.slice(0, 3) : selected.filter(id => report.photoCandidates.includes(id))
  report.photoSelections[report.photoKey]=report.selectedPhotoIds
  if (selected?.some(id => !report.photoCandidates.includes(id))) report.warnings.push('部分原选照片已失效或不再关联本次主诉；未自动换成其他照片。')
  const overview = chapter('overview')
  overview.summary = ''
  // Keep detailed counts in the course chapter, not an achievement dashboard.
  const distribution = overview.blocks.find(b => b.distribution)
  overview.blocks = []
  const focusSources = report.focusSourceIds.map(id => byId.get(id)).filter(Boolean)
  const add = (title, lines, sourceIds) => overview.blocks.push({title,lines,sourceIds})
  if (focusSources.length) {
    add('已记录的经过', [`最早相关记录 ${display(report.range.from)}；最近相关记录 ${display(report.range.to)}。最早记录不等于起病时间，记录之间的空白不代表没有症状。`], report.focusSourceIds)
    const recentOther = focusSources.find(s => s.id !== report.complaintSourceId)
    if (recentOther) add('此前记录', [concise(records.get(recentOther.recordId)?.journal?.symptom?.narrative || records.get(recentOther.recordId)?.content)], [recentOther.id])
  } else add('本次资料', ['关于此主诉暂无足够症状资料。其他已有资料仍保留在对应章节。'], [])
  const relatedTreatments = report.sources.filter(s => s.category === 'medication' && (s.relatedSourceIds?.some(id => refs.has(id)) || focusSources.some(f => f.relatedSourceIds?.includes(s.id))))
  if (relatedTreatments.length) add('已有处理', relatedTreatments.slice(0,2).map(s => `${display(s.occurredAt)} · ${s.title}`), relatedTreatments.slice(0,2).map(s=>s.id))
  const relatedEvents=new Set(focusSources.map(s=>s.eventId))
  for(const fact of input.facts){const s=byId.get(`fact:${fact.id}`);if(s)s.relatedSourceIds=(fact.sources??[]).map(f=>`record:${f.recordId}`).filter(id=>byId.has(id))}
  for(const archive of input.profiles)for(const row of archive.records??[])for(const item of row._allergyArchive?.items??row.items??[row]){
    if(item.memberId&&item.memberId!==input.member.id)continue
    const s=report.sources.find(s=>s.profileSection===archive.sectionId&&s.id===`profile:${archive.sectionId}:${item.id}`)
    if(s){const events=uniq([...(item.evidenceLinks??[]).filter(l=>l.confirmedByUser).map(l=>l.healthEventId),...(item.reactions??[]).filter(r=>!r.memberId||r.memberId===input.member.id).map(r=>r.linkedHealthEventId)]);s.relatedSourceIds=focusSources.filter(f=>events.includes(f.eventId)&&relatedEvents.has(f.eventId)).map(f=>f.id)}
  }
  const background = report.sources.filter(s => (s.profileSection || s.id.startsWith('fact:')) && s.relatedSourceIds?.some(id=>refs.has(id)))
  if (background.length) add('相关背景', background.map(s=>s.text), background.map(s=>s.id))
  report.gaps = [
    ...(!report.range.from ? ['本次问题的发生时间尚未提供。'] : ['实际起病时间需以家长或医务人员的原始记录核对，不能用最早记录代替。']),
    ...(relatedTreatments.length ? [] : ['未建立本次主诉与已有用药 / 处理资料的明确关联。']),
    ...(background.length ? [] : ['既往资料仍保留；与本次主诉的明确关系尚未建立。']),
  ]
  const course = chapter('course')
  for (const b of course.blocks) {
    b.lines = b.sourceIds.map(id => {
      const s = byId.get(id), r = records.get(s?.recordId)
      return `${display(s?.occurredAt)} · ${s?.locations?.join('、') || '部位未提供'} · ${concise(r?.journal?.symptom?.narrative || r?.content)}${s?.occurredAt ? '' : '（发生时间未知；录入 ' + display(s?.createdAt) + '）'}`
    })
  }
  if (distribution) course.blocks.push({...distribution, title:'家长记录的影响程度', secondary:true, lines:[`本次关联 ${report.focusSourceIds.length} 条症状记录，不等于发作次数；影响程度是家长填写，不是医学严重度，也不跨部位推断改善。`]})
  course.blocks.forEach((b,i) => { if (!b.distribution && i >= 4) b.secondary = true })
  // Separate measurement methods and preserve simultaneous conflicting values.
  const temp = chapter('temperature'), tempPoints = temp.blocks.flatMap(b=>b.points ?? [])
  const groups = new Map()
  for (const p of tempPoints) {
    const r = records.get(byId.get(p.sourceId)?.recordId)
    const method=p.measurementMethod || r?.measurementMethod
    const key = [{oral:'口腔',axillary:'腋下',ear:'耳温',forehead:'额温',other:'其他'}[method] || '方法未提供', p.measurementDevice || r?.measurementDevice || '设备未提供'].join(' / ')
    groups.set(key,[...(groups.get(key)??[]),p])
  }
  temp.blocks = [...groups].map(([method,points]) => ({title:`体温测量 · ${method}`,unit:'℃',points,sourceIds:uniq(points.map(p=>p.sourceId)),lines:[`${points.length} 条实测，记录范围 ${Math.min(...points.map(p=>p.value))}–${Math.max(...points.map(p=>p.value))} ℃。`, '按测量方法与设备分组；散点只表示实际记录，空白不插补。纵轴是显示刻度，不是医学正常范围。', ...(points.some((p,i)=>points.some((q,j)=>i!==j&&p.at===q.at&&p.value!==q.value)) ? ['同一时刻存在不同数值，已并列保留，需查看原记录核对。'] : [])]}))
  for (const c of report.chapters) for (const b of c.blocks) {
    if (b.points) b.chartMode = 'scatter'
    if (['allergy','medication','history','visits','growth','temperature'].includes(c.id)) b.related = b.sourceIds.some(id=>refs.has(id)||byId.get(id)?.relatedSourceIds?.some(id=>refs.has(id))||focusSources.some(s=>s.relatedSourceIds?.includes(id)))
  }
  for (const c of report.chapters.filter(c=>['medication','allergy','history'].includes(c.id))) {
    c.summary = c.blocks.length ? '保留已有资料；只有明确记录关联的内容才纳入本次重点。时间先后不代表因果。' : '尚未提供这类资料；未提供不等于没有相关经历。'
  }
  // An observation is a process, not a count of challenge tests.
  for (const task of input.tasks) {
    const b = chapter('allergy').blocks.find(b => b.taskId === task.id)
    if (!b) continue
    b.entries = task.records.filter(r=>!r.withdrawnAt).sort((a,b)=>(Date.parse(b.occurredAt)||0)-(Date.parse(a.occurredAt)||0)).map(r=>({title:`观察记录 · ${display(r.occurredAt)}`, lines:[byId.get(`observation:${r.id}`)?.text || '',`结果录入 / 修改：${display(r.updatedAt || r.createdAt)}（不等于症状开始时间）`],sourceIds:[`observation:${r.id}`]}))
    b.distributionNote = '这里是有效观察记录的构成，不是过敏概率；结果未填不等于无反应。'
  }
  for (const reminder of input.reminders) {
    const b = chapter('medication').blocks.find(b=>b.reminderId === reminder.id)
    if (!b) continue
    const last = reminder.occurrences.filter(o=>o.completed).sort((a,b)=>Date.parse(b.completion.actualTakenAt)-Date.parse(a.completion.actualTakenAt))[0]
    b.lines = b.lines.map(line=>line.replaceAll('明确未服','明确未用').replaceAll('漏服','漏用'))
    b.lines.unshift(`原记录药名：${reminder.plan.medicationName}；计划用量 ${reminder.plan.amount ?? '未提供'} ${reminder.plan.unit ?? ''}；途径 ${label[reminder.plan.route] ?? reminder.plan.route ?? '未提供'}。实际用量以每次使用记录为准。`)
    b.lines.push(`最近确认使用时间：${display(last?.completion?.actualTakenAt)}；确认录入时间：${display(last?.completion?.completedAt)}。计划结束不等于停药或完成治疗。`)
    b.distribution = b.distribution?.map(v=>({...v,label:v.label.replace('确认已服','确认使用')}))
  }
  for (const s of report.sources.filter(s=>s.id.startsWith('dose:'))) s.text=s.text.replaceAll('确认已服','确认使用').replaceAll('实际服用记录','实际使用记录')
  for (const b of chapter('medication').blocks) if (b.title === '独立服用记录') b.title = '独立用药记录'
  for (const s of report.sources.filter(s=>s.attachmentId)) s.text=`${s.title}；${s.mimeType}；${s.recordId ? '有关联记录，可查看来源关系' : '未提供关联记录'}。附件不增加症状条数。`
  for (const r of input.records.filter(r=>r.journal?.visit)) {
    const b = chapter('visits').blocks.find(b=>b.sourceIds.includes(`record:${r.id}`))
    if (b) b.lines.unshift(`就诊发生：${display(byId.get(`record:${r.id}`)?.occurredAt)}；${r.journal.visit.institutionName || '机构未提供'}；家长就诊记录，转述不等于医院原件确认。`)
    const v=r.journal.visit
    const lines=[['机构',v.institutionName||v.platformName],['科室',v.department],['医生意见（家长转述）',v.doctorStatement],['检查类型',v.examinationTypes?.join('、')],['文书类型',v.documentTypes?.join('、')],['补充',v.note]].filter(([,value])=>value).map(([key,value])=>`${key}：${value}`)
    b?.lines.push(...lines)
    const s=byId.get(`record:${r.id}`);if(s)s.text+='\n'+lines.join('\n')
  }
  for(const r of input.records.filter(r=>r.journal?.medication)){
    const m=r.journal.medication
    const lines=(m.medications?.length ? m.medications.map(item=>({...m,...item})) : [m]).map(m=>`${m.medicationName || m.genericName || m.brandName || '药名未提供'}；本次用量 ${m.amountValue ?? '未提供'} ${m.amountUnit || ''}；途径 ${label[m.administrationRoute] || '未提供'}；原因 ${m.reasons?.join('、') || '未提供'}；建议来源 ${{doctor:'家长记录医生建议',pharmacist:'药师建议（家长记录）',original_instruction:'原说明书（家长记录）',caregiver_record:'家长记录',other:'其他'}[m.suggestedBy] || '未提供'}；使用后记录 ${{not_observed_yet:'尚未观察',some_relief:'家长记录有所缓解（未建立疗效因果）',no_obvious_change:'家长记录无明显变化',discomfort_observed:'家长记录有不适'}[m.observationAfterUse] || '未提供'}`)
    const b=chapter('medication').blocks.find(b=>b.sourceIds.includes(`record:${r.id}`));if(b)b.lines=lines
  }
  // Different growth measurement conditions are not treated as one comparable series.
  const height=chapter('growth').blocks.find(b=>b.title==='身高')
  if(height){const groups=new Map();for(const p of height.points){const g=input.growth.find(g=>p.sourceId===`growth:${g.id}:heightCm`);const key=g?.measurementType==='length'?'身长（卧位）':g?.measurementType==='height'?'身高（站立）':'身高 / 身长（方式未提供）';groups.set(key,[...(groups.get(key)||[]),p])}chapter('growth').blocks.splice(chapter('growth').blocks.indexOf(height),1,...[...groups].map(([title,points])=>({...height,title,points,sourceIds:points.map(p=>p.sourceId),lines:[`${points.length} 条测量；单位 cm。仅代表已记录数值，不作发育正常与否的判断。`]})))}
  const questionSources = report.sources.filter(s => !s.attachmentId && !s.id.startsWith('legacy:') && /(?:想问|希望了解|想了解|请问|是否.*[？?])/.test(s.text))
  report.questionSourceIds = preferences.questionEdited ? [] : questionSources.map(s=>s.id)
  report.questionEdited = preferences.questionEdited ?? Boolean(preferences.question)
  report.question = report.questionEdited ? preferences.question ?? '' : questionSources.map(s=>s.text.split(/\n/).filter(t=>/(?:想问|希望了解|想了解|请问|是否.*[？?])/.test(t)).join('；')).filter(Boolean).join('\n')
  report.questionOrigin = report.questionEdited ? '家长填写' : report.question ? '据家长记录整理' : '尚未填写'
  report.sourceGroups = [...new Set(report.sources.map(s=>s.category))].map(category=>({category,sourceIds:report.sources.filter(s=>s.category===category).map(s=>s.id)}))
  return report
}
