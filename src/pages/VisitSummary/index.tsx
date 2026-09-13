import{ArrowLeft,Share2,X}from'lucide-react';import{useEffect,useMemo,useRef,useState,type ReactNode}from'react';import{useNavigate,useParams}from'react-router-dom';import{HohoButton,StatusNotice}from'../../components/design-system';import{copyPromptText,createHealthProfilePromptSections,type HealthEventPromptContext}from'../../features/ask-ai';import{getStoredHealthProfileSectionSnapshots}from'../../features/health-profile/utils/getHealthProfileSectionGroups';import{useHealthEventDetail}from'../../hooks/useHealthEventDetail';import{healthEventService}from'../../services/healthEvents';import{growthMeasurementService}from'../../services/growthMeasurements';import{useAppStore}from'../../store/useAppStore';import type{GrowthMeasurementApiDto,HealthEventApiDto,MedicalPreparationApiDto,MedicalPreparationSummaryApiDto}from'../../types';import{buildMedicalPreparation,getMedicalPreparationFingerprint}from'../HealthEvents/consultationSummary';import{buildVisitConcernCandidates,type VisitConcernCandidate}from'./visitConcernSelection';import{createVisitSummaryPresentation,visitIndex,type VisitEvidence,type VisitSectionId}from'./visitSummaryPresentation';import'./visitSummary.css'

export function VisitSummaryPage(){
  const{eventId=''}=useParams(),navigate=useNavigate(),token=useAppStore(s=>s.authToken),currentMemberId=useAppStore(s=>s.currentMemberId),authUser=useAppStore(s=>s.authUser),account=useAppStore(s=>s.accountProfile)
  const{state,retry}=useHealthEventDetail(eventId||undefined)
  const[events,setEvents]=useState<HealthEventApiDto[]|null>(null)
  const[growth,setGrowth]=useState<GrowthMeasurementApiDto[]|null>(null)
  const[loadError,setLoadError]=useState('')
  const[loadKey,setLoadKey]=useState(0)
  const loadedMemberId=state.status==='success'?state.data.member.id:''
  useEffect(()=>{
    if(!token||!loadedMemberId)return
    const c=new AbortController();setEvents(null);setGrowth(null);setLoadError('')
    Promise.all([healthEventService.list(token,c.signal),growthMeasurementService.list(loadedMemberId,token,c.signal)])
      .then(([nextEvents,nextGrowth])=>{setEvents(nextEvents);setGrowth(nextGrowth)})
      .catch(reason=>{if(!c.signal.aborted)setLoadError(reason instanceof Error?reason.message:'资料加载失败，请稍后重试')})
    return()=>c.abort()
  },[loadKey,loadedMemberId,token])
  if(state.status==='loading')return <VisitShell onBack={()=>navigate(-1)}><Organizing/></VisitShell>
  if(state.status==='error')return <VisitShell onBack={()=>navigate(-1)}><div className="visit-summary-status"><StatusNotice title="就医准备暂时无法打开" tone="error">资料没有发生改变，请检查网络后重试。</StatusNotice><HohoButton fullWidth onClick={retry}>重新加载</HohoButton></div></VisitShell>
  if(!loadError&&(events===null||growth===null))return <VisitShell onBack={()=>navigate(-1)}><Organizing/></VisitShell>
  if(loadError)return <VisitShell onBack={()=>navigate(-1)}><div className="visit-summary-status"><StatusNotice title="病情摘要资料加载失败" tone="error">原记录没有改变，请检查网络后重试。</StatusNotice><HohoButton fullWidth onClick={()=>{retry();setLoadKey(value=>value+1)}}>重新加载</HohoButton></div></VisitShell>
  if(state.status!=='success'||state.data.member.id!==currentMemberId)return <VisitShell onBack={()=>navigate(-1)}><div className="visit-summary-status"><StatusNotice title="就医准备暂时无法打开" tone="error">当前人物与记录不一致，请返回后重试。</StatusNotice></div></VisitShell>
  const event=state.data.viewModel.event,eventDto=state.data.eventDto,profile=createHealthProfilePromptSections(getStoredHealthProfileSectionSnapshots(state.data.member.id))
  const context:HealthEventPromptContext={attachments:state.data.attachments,currentMemberId,event:{...event,summary:eventDto.eventSummary?.displayedResult.summary??event.summary},growthMeasurements:growth??[],healthProfile:profile,member:state.data.member,organizations:state.data.organizations,records:state.data.records,relatedEvents:state.data.relatedEvents}
  const candidates=buildVisitConcernCandidates((events??[]).filter(item=>item.memberId===currentMemberId))
  const organizer=account?.nickname||authUser?.nickname||'';const relation=state.data.member.primaryRecorderRelationship?relationLabel(state.data.member.primaryRecorderRelationship):''
  return <VisitSummaryLoaded candidates={candidates} context={context} eventId={eventId} initial={eventDto.medicalPreparation??null} onBack={()=>navigate(-1)} organizer={organizer} organizerRelation={relation} token={token??''}/>
}

function VisitSummaryLoaded({candidates,context,eventId,initial,onBack,organizer,organizerRelation,token}:{candidates:VisitConcernCandidate[];context:HealthEventPromptContext;eventId:string;initial:MedicalPreparationApiDto|null;onBack:()=>void;organizer:string;organizerRelation:string;token:string}){
  const storedComplaint=initial?.summary.sections.find(section=>section.id==='visit_preferences')?.lines.find(line=>line.startsWith('主诉：'))?.slice(3)??''
  const[choice,setChoice]=useState(candidates.find(item=>item.label===storedComplaint)?.id??'')
  const[longTerm,setLongTerm]=useState('')
  const[preparation,setPreparation]=useState(initial)
  const[status,setStatus]=useState<'choosing'|'working'|'reading'|'error'>(initial?'reading':'choosing')
  const[error,setError]=useState('')
  const[shareNotice,setShareNotice]=useState('')
  const[sharing,setSharing]=useState(false)
  const selected=candidates.find(item=>item.id===choice)
  const complaint=selected?.label??longTerm.trim()
  const fingerprint=useMemo(()=>`${getMedicalPreparationFingerprint(context)}:${selected?.id??'custom'}:${longTerm.trim()}`,[context,longTerm,selected?.id])
  const save=async()=>{
    if(!complaint){setError('请先选择或填写这次想解决的问题');return}
    setStatus('working');setError('')
    try{
      const summary=withPreferences(buildMedicalPreparation(context),complaint,longTerm,organizer,organizerRelation)
      const result=await healthEventService.saveMedicalPreparation(eventId,{sourceFingerprint:fingerprint,summary},token)
      setPreparation(result.medicalPreparation);setStatus('reading')
    }catch{
      setError('这次整理没有完成，请检查网络或资料后重试。');setStatus('error')
    }
  }
  const share=async()=>{
    if(!preparation||sharing)return
    const url=`${window.location.origin}/medical-preparation/${preparation.shareToken}`
    setSharing(true);setShareNotice('正在准备分享')
    try{
      if(navigator.share){await navigator.share({title:'Hoooho 病情摘要',url});setShareNotice('已打开系统分享')}
      else{const result=await copyPromptText(url);setShareNotice(result.ok?'链接已复制':'复制没有完成，请重试')}
    }catch(reason){setShareNotice(reason instanceof DOMException&&reason.name==='AbortError'?'已取消分享':'分享没有完成，请重试')}
    finally{setSharing(false)}
  }
  if(status==='choosing')return <VisitShell onBack={onBack} title="就医准备"><ConcernChooser candidates={candidates} choice={choice} longTerm={longTerm} onChoice={setChoice} onGenerate={()=>void save()} onLongTerm={setLongTerm}/></VisitShell>
  if(status==='working')return <VisitShell onBack={onBack}><Organizing title={preparation?'正在更新病情摘要':'正在整理已有记录'}/></VisitShell>
  if(status==='error')return <VisitShell onBack={onBack}><div className="visit-summary-status"><StatusNotice title={preparation?'更新未完成':'暂时没有生成成功'} tone="error">{error}<br/>健康记录和上一版本不受影响。</StatusNotice><HohoButton fullWidth onClick={()=>void save()}>重试</HohoButton>{preparation&&<HohoButton fullWidth onClick={()=>setStatus('reading')} variant="secondary">继续查看原病情摘要</HohoButton>}</div></VisitShell>
  if(!preparation)return null
  return <VisitShell onBack={onBack} onShare={()=>void share()} shareDisabled={sharing} shareNotice={shareNotice}><VisitSummaryContent preparation={preparation} stale={preparation.sourceFingerprint!==fingerprint} onAdjust={()=>setStatus('choosing')} onUpdate={()=>void save()}/></VisitShell>
}

function ConcernChooser({candidates,choice,longTerm,onChoice,onGenerate,onLongTerm}:{candidates:VisitConcernCandidate[];choice:string;longTerm:string;onChoice:(v:string)=>void;onGenerate:()=>void;onLongTerm:(v:string)=>void}){const shortcuts=['过敏排查','生长情况','长期用药'];const canGenerate=Boolean(choice||longTerm.trim());return <section className="visit-concern"><h1>这次想解决什么问题</h1><p>选择已有情况，或直接补充本次主诉；用药记录不会被自动当成主诉。</p>{candidates.length>0?<><div className="visit-concern__merge">已将时间连续、共同发展的记录归并为 {candidates.length} 项。</div><div className="visit-concern__choices">{candidates.map((item,index)=><label className={choice===item.id?'is-selected':''} key={item.id}><input checked={choice===item.id} name="visit-concern" onChange={()=>onChoice(item.id)} type="radio"/><span><strong>{item.label}{index===0&&<em>最近情况</em>}</strong><small>{item.summary}</small></span></label>)}</div></>:<div className="visit-concern__merge">暂时没有可作为主诉的症状记录，请在下方填写。</div>}<label className="visit-concern__long"><strong>{choice?'还想补充的长期问题':'本次主诉'} <small>{choice?'选填':'必填'}</small></strong><textarea onChange={e=>onLongTerm(e.target.value)} placeholder="例如：反复大便异常、皮疹或体重增长……" value={longTerm}/></label><div className="visit-concern__shortcuts">{shortcuts.map(value=><button key={value} onClick={()=>onLongTerm(longTerm.includes(value)?longTerm:[longTerm,value].filter(Boolean).join('、'))} type="button">＋{value}</button>)}</div><HohoButton disabled={!canGenerate} fullWidth onClick={onGenerate} size="large">生成病情摘要</HohoButton></section>}

function withPreferences(base:MedicalPreparationSummaryApiDto,complaint:string,longTerm:string,organizer:string,relation:string):MedicalPreparationSummaryApiDto{const lines=[`主诉：${complaint}`,longTerm.trim()?`长期补充：${longTerm.trim()}`:'',organizer?`整理人：${organizer}${relation?`（${relation}）`:''}`:''].filter(Boolean);return{...base,sections:[...base.sections.filter(section=>section.id!=='visit_preferences'),{id:'visit_preferences',title:'本次整理设置',lines}],text:`${base.text}\n\n## 本次整理设置\n${lines.map(line=>`- ${line}`).join('\n')}`}}
function VisitShell({children,onBack,onShare,title='就医准备',shareDisabled=false,shareNotice=''}:{children:ReactNode;onBack:()=>void;onShare?:()=>void;title?:string;shareDisabled?:boolean;shareNotice?:string}){return <main className="app-shell visit-summary-page" data-visit-sheet-root><header className="visit-summary-header"><button aria-label="返回" onClick={onBack}><ArrowLeft/></button><strong>{title}</strong>{onShare?<button aria-label="分享只读病情摘要" disabled={shareDisabled} onClick={onShare}><Share2/></button>:<span/>}</header>{shareNotice&&<p aria-live="polite" className="visit-share-notice" role="status">{shareNotice}</p>}{children}</main>}
function Organizing({title='正在整理已有记录'}:{title?:string}){return <section className="visit-summary-organizing"><div className="visit-summary-organizing__mark">▤</div><h1>{title}</h1><p>按当前情况、经过与依据生成</p><ol><li>读取当前成员的健康记录</li><li>归并相互关联的情况</li><li>生成可核对的病情摘要</li></ol></section>}

export function VisitSummaryContent({preparation,readOnly=false,stale=false,onUpdate,onAdjust}:{preparation:MedicalPreparationApiDto;readOnly?:boolean;stale?:boolean;onUpdate?:()=>void;onAdjust?:()=>void}){const view=useMemo(()=>createVisitSummaryPresentation(preparation),[preparation]),[active,setActive]=useState<VisitSectionId>('overview'),[evidence,setEvidence]=useState<VisitEvidence|null>(null),scroller=useRef<HTMLDivElement>(null),frame=useRef(0);const available=new Map(view.sections.map(section=>[section.id,section])),basic=preparation.summary.sections.find(section=>section.id==='basic')?.lines??[],meta=basic.filter(line=>/^(性别|年龄)：/.test(line)).map(line=>line.split('：')[1]).join(' · ');useEffect(()=>()=>cancelAnimationFrame(frame.current),[]);const jump=(id:VisitSectionId)=>{const root=scroller.current,target=root?.querySelector<HTMLElement>(`#visit-${id}`);if(!root||!target||!available.has(id))return;setActive(id);const top=target.getBoundingClientRect().top-root.getBoundingClientRect().top+root.scrollTop-12;root.scrollTo({top:Math.max(0,top),left:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})};const sync=()=>{const root=scroller.current;if(!root)return;root.scrollLeft=0;cancelAnimationFrame(frame.current);frame.current=requestAnimationFrame(()=>{const current=[...root.querySelectorAll<HTMLElement>('.visit-summary-section')].reverse().find(section=>section.offsetTop<=root.scrollTop+95);if(current)setActive(current.id.replace('visit-','')as VisitSectionId)})};return <><nav aria-label="病例索引" className="visit-summary-rail" data-visit-sheet-index>{visitIndex.map(item=><button aria-current={active===item.id?'location':undefined} aria-disabled={!available.has(item.id)} disabled={!available.has(item.id)} key={item.id} onClick={()=>jump(item.id)}>{item.label}</button>)}</nav><div className="visit-summary-scroll" data-scroll-container onScroll={sync} ref={scroller}><article className="visit-summary-document"><section className="visit-summary-identity"><span>{preparation.summary.memberName.slice(0,1)}</span><div><h1>{preparation.summary.memberName}</h1><p>{meta}</p></div></section>{view.organizer&&<p className="visit-summary-organizer">情况单整理人：{view.organizer}</p>}<p className="visit-summary-version">{readOnly?'固定快照':'资料更新至'} {formatVisitTime(preparation.updatedAt)} · v{preparation.version}</p>{!readOnly&&<div className="visit-summary-complaint"><b>主诉</b><span>{view.complaint}</span>{onAdjust&&<button onClick={onAdjust}>调整</button>}</div>}{stale&&<aside className="visit-summary-update"><div><strong>有新内容待同步</strong><small>当前先显示上一次成功生成的版本</small></div><HohoButton onClick={onUpdate} size="small">更新情况单</HohoButton></aside>}{view.sections.map(section=><section className="visit-summary-section" id={`visit-${section.id}`} key={section.id}><h2>{section.title}</h2>{section.id==='overview'?<div className="visit-summary-hero"><small>主诉</small><strong>{view.complaint}</strong><p>{section.lines.join('；')}</p>{view.longTerm&&<em>另希望了解：{view.longTerm}</em>}</div>:<div className="visit-summary-card"><ul>{section.lines.map(line=><li key={line}>{line}</li>)}</ul><button onClick={()=>setEvidence(section.evidence)}>查看依据 ›</button>{section.id==='medication'&&<small>以上为用药记录，不构成用药建议。</small>}</div>}</section>)}<footer>{readOnly?'此页面不包含编辑、更新或家庭账户入口':'内容由已保存的健康记录整理，不替代诊断或治疗建议'}</footer></article></div>{evidence&&<EvidenceSheet evidence={evidence} onClose={()=>setEvidence(null)}/>}</>}
function EvidenceSheet({evidence,onClose}:{evidence:VisitEvidence;onClose:()=>void}){return <div className="visit-evidence-backdrop" onClick={onClose}><section aria-label={evidence.label} aria-modal="true" className="visit-evidence-sheet" onClick={e=>e.stopPropagation()} role="dialog"><header><h2>{evidence.label}</h2><button aria-label="关闭依据" onClick={onClose}><X/></button></header><div className="visit-evidence-content">{evidence.items.length?evidence.items.map((item,index)=><article key={`${item.text}-${index}`}><p>{item.text}</p><dl><div><dt>来源</dt><dd>{item.source}</dd></div><div><dt>记录时间</dt><dd>{item.recordedAt}</dd></div><div><dt>状态</dt><dd>{item.status}</dd></div></dl></article>):<p className="visit-evidence-empty">未找到可核对的原始记录</p>}</div></section></div>}
export function formatVisitTime(value:string){return new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value))}
function relationLabel(value:string){return({father:'爸爸',mother:'妈妈',paternal_grandfather:'爷爷',paternal_grandmother:'奶奶',maternal_grandfather:'外公',maternal_grandmother:'外婆',nanny:'照护人',other:'家人'}as Record<string,string>)[value]??''}
