import { ArrowLeft, Check, CircleAlert, GitMerge, Link2, LoaderCircle, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useBlocker, useNavigate } from 'react-router-dom'
import { HohoButton } from '../../components/design-system'
import { useCurrentMember } from '../../hooks/useCurrentMember'
import { desensitizationTestService, type DesensitizationResolutionDto, type FrequentFoodSuggestion } from '../../services/desensitizationTests'
import { useAppStore } from '../../store/useAppStore'
import './desensitization.css'

type ResolutionState={status:'idle'|'loading'|'success'|'error';data:null|DesensitizationResolutionDto;message:string}

export function DesensitizationTestNewPage() {
  const navigate=useNavigate(),member=useCurrentMember(),token=useAppStore((state)=>state.authToken)??''
  const draftKey=`hoooho:desensitization-new:${member.id}`
  const [name,setName]=useState(()=>sessionStorage.getItem(draftKey)??''),[suggestions,setSuggestions]=useState<FrequentFoodSuggestion[]>([]),[suggestionsLoading,setSuggestionsLoading]=useState(true)
  const [focusId,setFocusId]=useState(''),[selectedTaskIds,setSelectedTaskIds]=useState<string[]>([]),[separate,setSeparate]=useState(false),[refreshKey,setRefreshKey]=useState(0)
  const [resolution,setResolution]=useState<ResolutionState>({status:'idle',data:null,message:''}),[saving,setSaving]=useState(false),[composing,setComposing]=useState(false),[leavePrompt,setLeavePrompt]=useState(false)
  const allowLeave=useRef(false),requestId=useRef(0),operationId=useRef(crypto.randomUUID()),normalized=name.trim(),dirty=Boolean(normalized)
  const blocker=useBlocker(dirty&&!allowLeave.current&&!saving)
  const selectedKey=useMemo(()=>[...selectedTaskIds].sort().join('|'),[selectedTaskIds])

  useEffect(()=>{const controller=new AbortController();setSuggestionsLoading(true);desensitizationTestService.list(member.id,token,controller.signal).then((data)=>setSuggestions(data.suggestions)).catch(()=>setSuggestions([])).finally(()=>setSuggestionsLoading(false));return()=>controller.abort()},[member.id,token])
  useEffect(()=>{if(name)sessionStorage.setItem(draftKey,name);else sessionStorage.removeItem(draftKey)},[draftKey,name])
  useEffect(()=>{if(blocker.state==='blocked')setLeavePrompt(true)},[blocker.state])
  useEffect(()=>{const before=(event:BeforeUnloadEvent)=>{if(!dirty||allowLeave.current)return;event.preventDefault();event.returnValue=''};window.addEventListener('beforeunload',before);return()=>window.removeEventListener('beforeunload',before)},[dirty])
  useEffect(()=>{
    if(!normalized||composing){setResolution({status:'idle',data:null,message:''});return}
    const controller=new AbortController(),current=++requestId.current
    setResolution((previous)=>({status:'loading',data:previous.data,message:''}))
    const timer=window.setTimeout(()=>{void desensitizationTestService.resolve({memberId:member.id,input:normalized,focusId:focusId||undefined,selectedTaskIds:resolution.data?selectedTaskIds:undefined},token,controller.signal).then((data)=>{if(current!==requestId.current)return;setResolution({status:'success',data,message:''});setSelectedTaskIds(data.selectedTaskIds);setSeparate(false)}).catch((value)=>{if(controller.signal.aborted||current!==requestId.current)return;setResolution((previous)=>({status:'error',data:previous.data,message:value instanceof Error?value.message:'已有观察暂时没有查到，请重试'}))})},300)
    return()=>{window.clearTimeout(timer);controller.abort()}
  // selectedKey intentionally re-runs the server preview so counts and the action stay authoritative.
  },[composing,focusId,member.id,normalized,refreshKey,selectedKey,token])

  const updateName=(value:string)=>{setName(value);setFocusId('');setSelectedTaskIds([]);setSeparate(false);setResolution({status:value.trim()?'loading':'idle',data:null,message:''});operationId.current=crypto.randomUUID()}
  const leave=()=>{if(dirty){setLeavePrompt(true);return}allowLeave.current=true;navigate('/nurse-station',{replace:true})}
  const commit=async(event:FormEvent)=>{event.preventDefault();const data=resolution.data;if(!normalized)return;if(resolution.status==='error'){setRefreshKey((value)=>value+1);return}if(resolution.status!=='success'||!data||saving)return;setSaving(true);try{const result=await desensitizationTestService.commitResolution({memberId:member.id,input:normalized,focusId:focusId||undefined,selectedTaskIds,separate,resolutionVersion:data.resolutionVersion,operationId:operationId.current},token);sessionStorage.removeItem(draftKey);allowLeave.current=true;navigate(`/nurse-station?desensitization=${encodeURIComponent(result.task.id)}`,{replace:true,state:{desensitizationNotice:result.message,desensitizationOperationId:result.operationId}})}catch(value){setResolution((previous)=>({...previous,status:'error',message:value instanceof Error?value.message:'提交没有完成，输入和选择已保留'}))}finally{setSaving(false)}}
  const data=resolution.data,buttonLabel=saving?'正在处理…':resolution.status==='loading'?'正在查找已有观察…':resolution.status==='error'?'重试查找':data?.ambiguity.length&&!focusId?'按原名开始观察':separate?'按原名单独观察':data?.action.label??'开始观察'

  return <main className="app-shell desensitization-new-page"><header className="desensitization-new-header"><button aria-label="返回护士站" onClick={leave} type="button"><ArrowLeft/></button><h1>新增排敏测试</h1><span/></header><form onSubmit={commit}>
    <div className="desensitization-new-scroll"><div className="desensitization-member-line"><span>当前孩子</span><strong>{member.name}</strong></div>
      <label className="desensitization-query"><span>想观察的食物或成分</span><input autoComplete="off" autoFocus maxLength={30} onChange={(event)=>updateName(event.target.value)} onCompositionEnd={(event)=>{setComposing(false);updateName(event.currentTarget.value)}} onCompositionStart={()=>setComposing(true)} placeholder="例如：面包、小麦、牛乳酪蛋白" value={name}/><small>{normalized?'输入后会同步查找关联知识、已有观察和健康随记':'一次输入即可识别食品、原料来源或相关成分'}</small></label>
      {!suggestionsLoading&&suggestions.length>0&&<div className="desensitization-frequent"><span>近30天常吃</span><div>{suggestions.map((item)=><button aria-pressed={normalized===item.name} key={item.name} onClick={()=>updateName(item.name)} type="button">{item.name}</button>)}</div></div>}
      {normalized&&<RelationshipPanel data={data} focusId={focusId} loading={resolution.status==='loading'} onFocus={(id)=>{setFocusId(id);setSelectedTaskIds([]);operationId.current=crypto.randomUUID()}}/>}
      {Boolean(data?.ambiguity.length)&&!focusId&&<section className="desensitization-ambiguity"><strong>这个名称需要再明确一点</strong><p>可以选择一个范围，也可以保留原名待核实。</p><div>{data!.ambiguity.map((choice)=><button key={choice.id} onClick={()=>setFocusId(choice.id)} type="button">{choice.label}</button>)}</div></section>}
      {normalized&&<ReusePanel data={data} error={resolution.status==='error'?resolution.message:''} loading={resolution.status==='loading'} onRetry={()=>setRefreshKey((value)=>value+1)} onToggle={(taskId)=>{setSeparate(false);setSelectedTaskIds((current)=>current.includes(taskId)?current.filter((id)=>id!==taskId):[...current,taskId]);operationId.current=crypto.randomUUID()}} selectedTaskIds={selectedTaskIds}/>}
      {data&&resolution.status!=='error'&&<ResultPreview data={data} separate={separate}/>}
    </div>
    <footer className="desensitization-new-footer">{data?.action.canObserveSeparately&&!separate&&<button className="desensitization-separate" onClick={()=>{setSeparate(true);setSelectedTaskIds([]);operationId.current=crypto.randomUUID()}} type="button">按{data.originalInput}单独观察</button>}<span>{data&&resolution.status==='success'?(separate?`保留原名“${data.originalInput}”，不改变已有观察`:data.action.description):resolution.status==='error'?'输入和选择仍保留':normalized?'正在同步知识与个人记录':'输入名称后再开始'}</span><HohoButton disabled={!normalized||resolution.status==='idle'||resolution.status==='loading'||saving} fullWidth size="large" type="submit">{buttonLabel}</HohoButton></footer>
  </form>{leavePrompt&&<div className="desensitization-leave-layer" role="presentation"><section aria-label="离开新增排敏测试" aria-modal="true" role="dialog"><h2>保留这次输入？</h2><p>名称已保存在这台设备，下次进入可继续查找。</p><div><button onClick={()=>{if(blocker.state==='blocked')blocker.reset();setLeavePrompt(false)}} type="button">继续填写</button><button onClick={()=>{allowLeave.current=true;if(blocker.state==='blocked')blocker.proceed();else navigate('/nurse-station',{replace:true})}} type="button">离开</button></div></section></div>}</main>
}

function RelationshipPanel({data,focusId,loading,onFocus}:{data:DesensitizationResolutionDto|null;focusId:string;loading:boolean;onFocus:(id:string)=>void}) {
  return <section aria-busy={loading} className="desensitization-relationship"><header><h2>食物与成分关联</h2><div><span className="known">实线 · 已知关联</span><span className="possible">虚线 · 可能含有</span></div></header>{!data?<div className="desensitization-panel-loading"><LoaderCircle/>正在识别关系…</div>:<><div className={`desensitization-focus-node is-${data.entity.type}`}><small>{data.entity.type==='food'?'具体食品':data.entity.type==='source'?'原料来源':data.entity.type==='component'?'成分关注':'原名待核实'}</small><strong>{data.entity.label}</strong></div><div className="desensitization-branches">{data.entity.relations.map((node)=><button className={node.certainty==='pending'?'is-pending':'is-known'} key={`${node.id}-${node.relation}`} onClick={()=>['source','component'].includes(node.type)&&onFocus(node.id)} type="button"><span>{node.relationLabel}</span><strong>{node.label}</strong>{['source','component'].includes(node.type)&&<small>{focusId===node.id?'当前关注':'可切换关注'}</small>}</button>)}</div><p>{data.entity.description}</p><small>关系用于查找和整理；个人配料、摄入与医学结论仍按实际依据分别保存。</small></>}</section>
}

function ReusePanel({data,loading,error,selectedTaskIds,onToggle,onRetry}:{data:DesensitizationResolutionDto|null;loading:boolean;error:string;selectedTaskIds:string[];onToggle:(id:string)=>void;onRetry:()=>void}) {
  if(error)return <section className="desensitization-reuse is-error" role="alert"><CircleAlert/><div><strong>已有观察没有查找完成</strong><p>{error}</p><button onClick={onRetry} type="button"><RefreshCw/>重试查找</button></div></section>
  if(loading&&!data)return <section className="desensitization-reuse"><div className="desensitization-panel-loading"><LoaderCircle/>正在查找已有观察…</div></section>
  if(!data)return null
  return <section className="desensitization-reuse"><h2>{data.matches.length?'可沿用的观察':data.historyRecords.length?'可带入的历史记录':'尚无相关观察'}</h2>{data.matches.length?data.matches.map((match)=><button aria-pressed={selectedTaskIds.includes(match.taskId)} className="desensitization-match" key={match.taskId} onClick={()=>onToggle(match.taskId)} type="button"><i>{selectedTaskIds.includes(match.taskId)?<Check/>:null}</i><span><strong>{match.displayName}<em>{match.status==='active'?'观察中':'已归档'}</em></strong><small>{match.reason} · {match.recordCount} 条相关记录{match.pendingRecordCount?` · ${match.pendingRecordCount} 条待核实`:''}</small></span></button>):data.historyRecords.length?<div className="desensitization-history-preview"><strong>找到 {data.historyRecords.length} 条相关健康随记</strong>{data.historyRecords.slice(0,3).map((item)=><p key={item.recordId}>{item.matchedFoods.join('、')}<span>{new Date(item.occurredAt).toLocaleDateString('zh-CN')}</span></p>)}<small>创建后引用原记录和发生时间，不复制或改写健康随记。</small></div>:<p className="desensitization-empty-copy">可以从现在开始；输入本身不会生成“吃过”记录。</p>}</section>
}

function ResultPreview({data,separate}:{data:DesensitizationResolutionDto;separate:boolean}) {
  return <section className="desensitization-result-preview"><header>{separate?<Link2/>:<GitMerge/>}<div><small>{separate?'独立观察':'本次处理结果'}</small><strong>{separate?data.originalInput:data.action.targetName}</strong></div></header><dl><div><dt>去重后记录</dt><dd>{separate?data.preview.historyRecordCount:data.preview.recordCount}</dd></div><div><dt>明确关联</dt><dd>{data.preview.confirmedRecordCount}</dd></div><div><dt>待核实</dt><dd>{data.preview.pendingRecordCount}</dd></div></dl>{data.preview.deduplicatedCount>0&&<p>同一源事件重叠 {data.preview.deduplicatedCount} 次，只计一次。</p>}<small>食品、原有结果与医生安排分别保留；合并观察入口不传播诊断或处方。</small></section>
}
