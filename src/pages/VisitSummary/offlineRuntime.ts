// Runs only inside a user-requested, self-contained local copy. No network APIs.
export function offlineRuntime() {
  const dataNode=document.getElementById('visit-copy-data')!
  const initial=JSON.parse(dataNode.textContent!)
  const key=`hoooho-visit-copy:${initial.copyId}`
  let data=initial
  const notice=document.getElementById('copy-status')!
  try {const saved=localStorage.getItem(key);if(saved){const parsed=JSON.parse(saved);if(parsed.copyId===initial.copyId && parsed.localRevision>initial.localRevision && Array.isArray(parsed.report?.sources) && Array.isArray(parsed.report?.chapters))data=parsed}} catch {notice.textContent='此环境不能持久保存本地修改；请下载更新副本。'}
  const el=(tag:string,text?:string)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node}
  const sources=()=>data.report.sources
  const paragraph=(parent:Element,text:string)=>parent.append(el('p',text))
  const persist=()=>{data.localRevision=(data.localRevision||0)+1;dataNode.textContent=JSON.stringify(data).replace(/</g,'\\u003c');try{localStorage.setItem(key,JSON.stringify(data));notice.textContent=`已保存本地修订 ${data.localRevision}；未回写在线档案。`}catch{notice.textContent='本次修改尚未持久保存；请下载更新副本。'}render()}
  const render=()=>{
    const report=data.report
    document.getElementById('copy-revision')!.textContent=`原快照 v${initial.originalVersion} · 本地修订 ${data.localRevision||0} · 不回写在线档案`
    document.getElementById('copy-complaint')!.textContent=report.complaint
    const question=document.getElementById('copy-question')!
    question.textContent=report.question||'尚未填写'
    document.getElementById('copy-question-origin')!.textContent=report.questionOrigin||'尚未填写'
    const questionRefs=document.getElementById('copy-question-sources')!
    questionRefs.replaceChildren()
    for(const id of report.questionSourceIds??[]){if(!sources().some((s:any)=>s.id===id))continue;const link=el('a',`${id} 问题原话 `) as HTMLAnchorElement;link.href=`#${id}`;questionRefs.append(link)}
    for(const c of report.chapters){const note=document.querySelector(`[data-copy-note="${c.id}"]`);if(note)note.textContent=report.notes[c.id]||''}
    document.querySelectorAll<HTMLElement>('[data-copy-photo]').forEach(node=>{node.hidden=!(report.selectedPhotoIds||[]).includes(node.dataset.copyPhoto)})
    if(data.focusChanged){
      const overview=document.getElementById('copy-focus-facts')!,course=document.getElementById('copy-course')!
      overview.replaceChildren();course.replaceChildren()
      const related=sources().filter((s:any)=>report.focusSourceIds.includes(s.id))
      paragraph(overview,related.length?`本地已有资料中关联 ${related.length} 条症状记录，不等于发作次数。最早记录不等于起病日。`:'此主诉尚无相关依据；其他资料保留在后文。')
      const ids=new Set(related.map((s:any)=>s.id))
      const explicit=sources().filter((s:any)=>s.relatedSourceIds?.some((id:string)=>ids.has(id))||related.some((r:any)=>r.relatedSourceIds?.includes(s.id)))
      const treatments=explicit.filter((s:any)=>s.category==='medication'||s.category==='visits')
      const history=explicit.filter((s:any)=>s.category!=='medication'&&s.category!=='visits'&&!s.eventId&&s.category!=='attachment')
      const dates=related.map((s:any)=>s.occurredAt).filter(Boolean).sort()
      report.range={from:dates[0]||null,to:dates.at(-1)||null}
      if(dates.length)paragraph(overview,`最早相关记录 ${dates[0]}；最近相关记录 ${dates.at(-1)}。记录空白不代表没有症状。`)
      const present=(parent:Element,s:any)=>{const item=el('article');paragraph(item,`${s.timePrecision==='unknown'?'发生时间未知':s.timePrecision==='day'||s.timePrecision==='period'?`${s.occurredAt?.slice(0,10)||'未提供'}（日期 / 时段精度）`:s.occurredAt||'发生时间未知'} · ${s.locations?.join('、')||s.identity}`);paragraph(item,s.narrative||s.text||s.title);const link=el('a',`${s.code} 查看依据`) as HTMLAnchorElement;link.href=`#${s.id}`;item.append(link);parent.append(item)}
      if(treatments.length){overview.append(el('h3','明确关联的处理 / 就诊'));treatments.forEach((s:any)=>present(overview,s))}
      if(history.length){overview.append(el('h3','相关背景'));history.forEach((s:any)=>present(overview,s))}
      const nodes=[...related,...treatments.filter((s:any)=>!ids.has(s.id))].sort((a,b)=>(Date.parse(b.occurredAt||b.createdAt)||0)-(Date.parse(a.occurredAt||a.createdAt)||0))
      nodes.forEach((s:any)=>present(course,s))
      if(related.length){const counts=new Map<string,number>();for(const s of related){const label=({little:'影响较小',some:'有些影响',clear:'明显影响'} as Record<string,string>)[s.impactLevel]||'影响程度未填写';counts.set(label,(counts.get(label)||0)+1)}const detail=el('details');detail.append(el('summary','家长记录的影响程度 · 展开明细'));paragraph(detail,[...counts].map(([label,count])=>`${label} ${count} 条`).join('；'));paragraph(detail,'按本次相关症状记录互斥分类，不是发作次数、医学严重度或跨部位改善评分。');course.append(detail)}
      if(!related.length)paragraph(course,'此主诉尚无相关经过，不套用原主题图表。')
      document.querySelectorAll('[data-copy-relation]').forEach(node=>node.textContent='本地已更改主诉；明确关联内容已在本次经过中列出，本章其余资料保留，不据时间先后推断因果。')
      document.querySelectorAll<HTMLElement>('[data-report-source-ids]').forEach(node=>{const refs=JSON.parse(node.dataset.reportSourceIds!);const label=node.querySelector('[data-copy-related]');if(label)label.textContent=refs.some((id:string)=>ids.has(id)||explicit.some((s:any)=>s.id===id))?'与本次有明确记录关联':'与本次关系尚未建立，保留供核对'})
      report.gaps=['最早记录不等于起病时间；家长问题与补充仍保留，请核对是否适用于当前主诉。',...(!treatments.length?['尚未建立此主诉与处理 / 就诊资料的明确关联。']:[]),...(!history.length?['尚未建立此主诉与既往资料的明确关联。']:[])]
      const gaps=document.getElementById('copy-gaps')!;gaps.replaceChildren();report.gaps.forEach((text:string)=>paragraph(gaps,text))
    }
  }
  const panel=document.getElementById('copy-editor') as HTMLDialogElement
  let returnFocus:HTMLElement|null=null
  const open=(title:string)=>{returnFocus=document.activeElement as HTMLElement;panel.replaceChildren(el('h2',title));panel.showModal()}
  const close=()=>{panel.close();returnFocus?.focus({preventScroll:true})}
  const actions=(save:()=>void|boolean)=>{const submit=el('button','保存本地修改');submit.onclick=()=>{if(save()===false)return;persist();close()};const cancel=el('button','取消');cancel.onclick=close;panel.append(submit,cancel)}
  document.getElementById('copy-edit-question')!.onclick=()=>{open('本次想问 · 本地副本');const field=el('textarea') as HTMLTextAreaElement;field.value=data.report.question;field.setAttribute('aria-label','本次想问');panel.append(field);actions(()=>{data.report.question=field.value;data.report.questionOrigin='家长填写（本地副本）';data.report.questionSourceIds=[];document.getElementById('copy-question-sources')?.replaceChildren()});field.focus()}
  document.querySelectorAll<HTMLElement>('[data-edit-note]').forEach(button=>button.onclick=()=>{const id=button.dataset.editNote!;open('章节补充 · 本地副本');const field=el('textarea') as HTMLTextAreaElement;field.value=data.report.notes[id]||'';field.setAttribute('aria-label','章节补充');panel.append(field);actions(()=>{data.report.notes[id]=field.value});field.focus()})
  document.getElementById('copy-edit-focus')!.onclick=()=>{
    open('更改主诉 · 仅使用副本内已有资料')
    const select=el('select') as HTMLSelectElement;select.setAttribute('aria-label','主诉来源');select.append(new Option('其他问题（自填）','custom'))
    for(const c of data.report.candidates)select.append(new Option(c.text,c.sourceId))
    select.value=data.report.complaintSourceId||'custom'
    const custom=el('textarea') as HTMLTextAreaElement;custom.setAttribute('aria-label','自填主诉');custom.value=data.report.complaint;custom.hidden=select.value!=='custom';select.onchange=()=>{custom.hidden=select.value!=='custom';if(!custom.hidden)custom.focus()}
    panel.append(select,custom)
    actions(()=>{
      const selected=sources().find((s:any)=>s.id===select.value)
      const text=select.value==='custom'?custom.value.trim():data.report.candidates.find((c:any)=>c.sourceId===select.value).text
      if(!text){paragraph(panel,'请填写主诉，尚未保存。');custom.focus();return false}
      if((selected?.id||null)===data.report.complaintSourceId&&text===data.report.complaint)return
      const candidates=new Set(data.report.candidates.map((c:any)=>c.sourceId))
      const related=sources().filter((s:any)=>candidates.has(s.id)&&(selected?(s.id===selected.id||(selected.locations?.length?(!selected.symptomCategory||selected.symptomCategory===s.symptomCategory)&&s.locations?.some((l:string)=>selected.locations.includes(l)):selected.symptomCategory?selected.symptomCategory===s.symptomCategory:s.eventId===selected.eventId)):text.length>=2&&(s.narrative||s.title).includes(text)))
      data.report.complaint=text;data.report.complaintSourceId=selected?.id||null;data.report.focusSourceIds=related.map((s:any)=>s.id)
      data.report.focus={mode:selected?'source':'custom',...(selected?{sourceId:selected.id}:{text})}
      data.report.photoSelections[data.report.photoKey]=data.report.selectedPhotoIds
      const theme=selected?.id||`custom:${text}`;data.report.photoKey=theme
      const eligible=data.report.photos.filter((p:any)=>p.relatedSourceIds.some((id:string)=>data.report.focusSourceIds.includes(id))).map((p:any)=>p.sourceId)
      data.report.selectedPhotoIds=(data.report.photoSelections[theme]??eligible.slice(0,3)).filter((id:string)=>eligible.includes(id))
      data.focusChanged=true
    })
  }
  document.getElementById('copy-edit-photos')!.onclick=()=>{
    open('副本内已包含的影像');paragraph(panel,'未导出的照片不在副本中，无法从在线账户取回。')
    const ids=new Set<string>(data.report.selectedPhotoIds)
    for(const p of data.report.photos.filter((p:any)=>p.relatedSourceIds.some((id:string)=>data.report.focusSourceIds.includes(id)))){const label=el('label',`${p.title} · ${p.timeKind} ${p.capturedAt||p.uploadedAt||'未知'}`);const checkbox=el('input') as HTMLInputElement;checkbox.type='checkbox';checkbox.checked=ids.has(p.sourceId);checkbox.onchange=()=>checkbox.checked?ids.add(p.sourceId):ids.delete(p.sourceId);label.prepend(checkbox);panel.append(label)}
    actions(()=>{data.report.selectedPhotoIds=[...ids];data.report.photoSelections[data.report.photoKey]=[...ids]})
  }
  document.getElementById('copy-download')!.onclick=()=>{
    dataNode.textContent=JSON.stringify(data).replace(/</g,'\\u003c')
    const url=URL.createObjectURL(new Blob(['<!doctype html>'+document.documentElement.outerHTML],{type:'text/html;charset=utf-8'}));const link=el('a') as HTMLAnchorElement;link.href=url;link.download='Hoooho-就诊情况单-更新本地副本.html';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
  }
  document.querySelectorAll<HTMLImageElement>('[data-copy-photo] img, [data-copy-original] img').forEach(img=>img.closest('a')?.addEventListener('click',e=>{
    e.preventDefault();open('完整原图 · 本地副本')
    const viewport=el('div');viewport.style.cssText='height:55vh;overflow:auto;touch-action:pan-x pan-y'
    const original=img.cloneNode() as HTMLImageElement;const fit=()=>{original.style.cssText='display:block;width:100%;height:55vh;object-fit:contain;max-height:none;max-width:none'};fit();viewport.append(original)
    let zoom=1
    const plus=el('button','放大'),reset=el('button','还原完整比例'),dismiss=el('button','关闭原图')
    plus.onclick=()=>{zoom=Math.min(zoom+0.5,4);original.style.height='auto';original.style.width=`${zoom*100}%`};reset.onclick=()=>{zoom=1;fit();viewport.scrollTo(0,0)};dismiss.onclick=close
    panel.append(viewport,plus,reset,dismiss)
  }))
  document.querySelector('.visit-offline')!.addEventListener('click',event=>{const link=(event.target as Element).closest('a[href^="#"]') as HTMLAnchorElement|null;if(link){const target=document.getElementById(link.hash.slice(1));if(target instanceof HTMLDetailsElement)target.open=true}})
  panel.addEventListener('cancel',e=>{e.preventDefault();if(!panel.querySelector('textarea,select,input')){close();return}if(!panel.querySelector('[data-unsaved]')){const hint=el('p','输入仍保留。请保存，或点取消放弃本次修改。');hint.setAttribute('data-unsaved','true');panel.append(hint)}})
  let expanded:Array<[HTMLDetailsElement,boolean]>=[]
  window.addEventListener('beforeprint',()=>{expanded=[...document.querySelectorAll('details')].map(d=>[d,d.open]);expanded.forEach(([d])=>d.open=true)})
  window.addEventListener('afterprint',()=>expanded.forEach(([d,open])=>d.open=open))
  render()
}
