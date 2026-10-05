import {useEffect,useRef,useState} from 'react'
import {useLocation,useNavigate,useParams} from 'react-router-dom'
import {ChevronDown,Pencil,Plus,Trash2} from 'lucide-react'
import {WebPageHeader} from '../../components/common'
import {MemberIdentityCard} from '../../components/health'
import {HohoButton,StatusNotice} from '../../components/design-system'
import {useAppStore} from '../../store/useAppStore'
import {apiRequest} from '../../services/apiClient'
import {loadProfileSections} from '../../services/profileSectionStorage'
import type {Member} from '../../types'
import './inlineChildProfile.css'

const titles={allergy:'过敏史',chronic:'慢性病史','family-history':'家族史',surgery:'手术史',vaccination:'疫苗接种记录'}
type Kind=keyof typeof titles
type Row={id:string;name:string;displayName?:string;group:string;date:string;frequency:string;version:string}
type Snapshot={rows:Row[];groups:{id:string;name:string}[];compatibility:{pendingAllergies:number;confirmedUnknownCategory:number;unknownVaccineAge:number;olderVaccineAge:number};notice?:string;undoId?:string}
type Draft={name:string;date:string;frequency:string;version?:string;key:string;dateDirty?:boolean;frequencyDirty?:boolean}
type Session={group:string;drafts:Record<string,Draft>;active:Record<string,string>;relation?:Draft}
const frequencies=['每天','每周','每月','每季度','每年']
const fresh=(row?:Row):Draft=>({name:row?.name??'',date:row?.date??'',frequency:row?.frequency??'',version:row?.version,key:crypto.randomUUID()})
const draftId=(group:string,id:string)=>JSON.stringify([group,id])
export function InlineChildProfilePage({kind:given}:{kind?:Kind}){
  const {sectionId}=useParams(),location=useLocation(),kind=given??(sectionId??location.pathname.split('/').at(-1)) as Kind
  const memberId=useAppStore(s=>s.currentMemberId),accountId=useAppStore(s=>s.authUser?.id),members=useAppStore(s=>s.members)
  const member=members.find(m=>m.id===memberId)
  if(!Object.hasOwn(titles,kind)||!member)return <main className="app-shell"><WebPageHeader fallback="/health-profile" title="孩子档案"/><p role="status">正在加载当前孩子…</p></main>
  return <InlineProfile key={`${accountId}:${memberId}:${kind}`} accountId={accountId??''} member={member} kind={kind}/>
}
function InlineProfile({member,kind,accountId}:{member:Member;kind:Kind;accountId:string}){
  const navigate=useNavigate(),token=useAppStore(s=>s.authToken)??''
  const storageKey=`hoooho-profile-inline:${JSON.stringify([accountId,member.id,kind])}`
  const [session,setSession]=useState<Session>(()=>{try{const saved=JSON.parse(sessionStorage.getItem(storageKey)??'null');if(saved?.drafts&&saved?.active)return saved}catch{/* Fall back without pretending persistence succeeded. */}return {group:'',drafts:{},active:{}}})
  const [data,setData]=useState<Snapshot|null>(null),[error,setError]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[reload,setReload]=useState(0),[undo,setUndo]=useState<string>(),[confirmDelete,setConfirmDelete]=useState<string>()
  const locked=useRef(false),mounted=useRef(true)
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
  useEffect(()=>{try{sessionStorage.setItem(storageKey,JSON.stringify(session))}catch{setError('本机暂时无法保留草稿，请不要关闭页面；仍可保存到档案')}},[session,storageKey])
  const endpoint=`/api/members/${encodeURIComponent(member.id)}/profile-list/${kind}`
  useEffect(()=>{
    const controller=new AbortController();setLoading(true)
    if(token)void apiRequest<Snapshot>(endpoint,{token,signal:controller.signal}).then(next=>{if(controller.signal.aborted)return;setData(next);setSession(old=>({...old,group:next.groups.some(g=>g.id===old.group)?old.group:next.groups[0]?.id??''}));setError('')}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'读取失败，请重试')}).finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    return ()=>controller.abort()
  },[endpoint,token,reload])
  const group=session.group,active=session.active[group],rows=data?.rows.filter(r=>kind==='surgery'||r.group===group)??[]
  function put(groupId:string,id:string,changes:Partial<Draft>,row?:Row){
    setSession(old=>{const key=draftId(groupId,id),draft=old.drafts[key]??fresh(row);return {...old,drafts:{...old.drafts,[key]:{...draft,...changes,key:crypto.randomUUID()}}}})
  }
  function begin(id:string,row?:Row){setConfirmDelete(undefined);setError('');setSession(old=>{const key=draftId(group,id);return {...old,active:{...old.active,[group]:id},drafts:{...old.drafts,[key]:old.drafts[key]??fresh(row)}}})}
  function clear(groupId:string,id:string){setSession(old=>{const drafts={...old.drafts},active={...old.active};delete drafts[draftId(groupId,id)];if(active[groupId]===id)delete active[groupId];return {...old,drafts,active}});setConfirmDelete(undefined)}
  async function command(input:Record<string,unknown>,after:(next:Snapshot)=>void){
    if(locked.current)return
    const state=useAppStore.getState();if(state.currentMemberId!==member.id||state.authUser?.id!==accountId){setError('孩子或账号已切换，本页未提交');return}
    locked.current=true;setBusy(true);setError('');setStatus('');setUndo(undefined)
    try{
      const next=await apiRequest<Snapshot>(endpoint,{token:state.authToken??token,method:'POST',body:input})
      if(mounted.current){setData(next);setStatus(next.notice??'已保存');setUndo(next.undoId);after(next)}
      // Update shared allergy/dietary projections without making success depend
      // on an unrelated reload. Home also re-fetches on returning to it.
      void loadProfileSections(state.authToken??token,state.members).catch(()=>{})
    }catch(e){if(mounted.current)setError(e instanceof Error?e.message:'保存失败，内容仍保留，请重试')}
    finally{locked.current=false;if(mounted.current)setBusy(false)}
  }
  function save(id:string,groupId:string,row?:Row){
    const draft=session.drafts[draftId(groupId,id)];if(!draft)return
    void command({action:id==='new'?'add':'edit',id:row?.id,version:draft.version,name:draft.name,group:groupId,key:draft.key,...(kind==='chronic'&&draft.frequencyDirty?{frequency:draft.frequency}:{}),...(kind==='vaccination'&&(id==='new'||draft.dateDirty)?{date:draft.date}: {})},next=>{clear(groupId,id);const moved=next.rows.find(r=>r.id===row?.id);if(moved&&moved.group!==groupId&&next.groups.some(g=>g.id===moved.group))setSession(old=>({...old,group:moved.group}))})
  }
  function pickFrequency(row:Row,value:string){
    const key=draftId(row.group,row.id),draft={...(session.drafts[key]??fresh(row)),frequency:value,frequencyDirty:true,key:crypto.randomUUID()}
    setSession(old=>({...old,drafts:{...old.drafts,[key]:draft}}))
    void command({action:'edit',id:row.id,version:draft.version,name:row.name,group:row.group,frequency:value,key:draft.key},()=>clear(row.group,row.id))
  }
  function frequencyChoices(id:string,g:string,draft:Draft,row?:Row,immediate=false){return <div className="inline-profile-choices" role="group" aria-label="出现频率">{frequencies.map(f=><button disabled={busy} type="button" key={f} aria-pressed={draft.frequency===f} onClick={()=>immediate&&row?pickFrequency(row,f):put(g,id,{frequency:f,frequencyDirty:true},row)}>{f}</button>)}</div>}
  function editor(id:string,g:string,row?:Row){
    const draft=session.drafts[draftId(g,id)]??fresh(row),field=kind==='allergy'?'过敏对象':kind==='vaccination'?'疫苗名称':kind==='surgery'?'手术名称或描述':kind==='chronic'?'长期健康问题':'健康问题'
    return <form className="inline-profile-editor" aria-label={`${id==='new'?'新增':'编辑'}${titles[kind]}`} onSubmit={e=>{e.preventDefault();save(id,g,row)}}>
      <header><strong>{id==='new'?'新增':'编辑'}{field}</strong><small>未保存草稿</small></header>
      <label className="hoho-field"><span>{field}</span><input className="hoho-input" maxLength={kind==='vaccination'?120:200} disabled={busy} autoFocus value={draft.name} placeholder={kind==='chronic'?'如：哮喘、反复湿疹':kind==='surgery'?'用一句话写做过什么手术':'输入名称'} onChange={e=>put(g,id,{name:e.target.value},row)}/></label>
      {kind==='chronic'&&<details><summary>出现频率<ChevronDown aria-hidden size={16}/></summary>{frequencyChoices(id,g,draft,row)}</details>}
      {kind==='vaccination'&&<details><summary>接种日期<ChevronDown aria-hidden size={16}/></summary><label className="hoho-field"><span>接种日期</span><input className="hoho-input" disabled={busy} type="date" value={draft.date} onChange={e=>put(g,id,{date:e.target.value,dateDirty:true},row)}/></label></details>}
      <div className="inline-profile-actions"><HohoButton disabled={busy} variant="text" onClick={()=>clear(g,id)}>取消</HohoButton><HohoButton disabled={!draft.name.trim()} loading={busy} type="submit">保存</HohoButton></div>
    </form>
  }
  function record(row:Row,index:number,g=group){
    const draft=session.drafts[draftId(g,row.id)]??fresh(row)
    const isActive=session.active[g]===row.id
    return <li className="inline-profile-item" key={row.id} data-record-id={row.id}>
      {isActive?editor(row.id,g,row):<>
        {(kind==='chronic'||kind==='vaccination')?<details><summary className="inline-profile-row"><span className="inline-profile-number">{index+1}</span><span>{row.displayName??row.name}</span><ChevronDown aria-hidden size={18}/></summary><div className="inline-profile-fold">
          {kind==='chronic'?frequencyChoices(row.id,g,draft,row,true):<><label className="hoho-field"><span>接种日期</span><input className="hoho-input" disabled={busy} type="date" value={draft.date} onChange={e=>put(g,row.id,{date:e.target.value,dateDirty:true},row)}/></label><HohoButton disabled={busy||!draft.dateDirty} size="small" variant="text" onClick={()=>save(row.id,g,row)}>保存日期</HohoButton></>}
          {kind==='chronic'&&draft.frequencyDirty&&<HohoButton loading={busy} variant="text" onClick={()=>save(row.id,g,row)}>重试保存频率</HohoButton>}
        </div></details>:<div className="inline-profile-row"><span className="inline-profile-number">{index+1}</span><span>{row.name}</span></div>}
        <div className="inline-profile-tools"><button disabled={busy} aria-label={`编辑${row.name}`} type="button" onClick={()=>{put(g,row.id,{},row);setSession(old=>({...old,active:{...old.active,[g]:row.id}}))}}><Pencil aria-hidden size={14}/>编辑</button><button disabled={busy} aria-label={`删除${row.name}`} type="button" onClick={()=>setConfirmDelete(row.id)}><Trash2 aria-hidden size={14}/>删除</button></div>
        {confirmDelete===row.id&&<div className="inline-profile-delete" role="group" aria-label="确认删除"><span>删除这条记录？</span><HohoButton variant="text" disabled={busy} onClick={()=>setConfirmDelete(undefined)}>取消</HohoButton><HohoButton variant="danger" loading={busy} onClick={()=>void command({action:'delete',id:row.id,version:row.version,key:crypto.randomUUID()},()=>{clear(g,row.id);setConfirmDelete(undefined)})}>确认删除</HohoButton></div>}
      </>}
    </li>
  }
  return <main className="app-shell inline-profile-shell" aria-busy={busy}><WebPageHeader title={titles[kind]} onBack={()=>navigate('/health-profile')}/><div className="page-content inline-profile-content">
    <MemberIdentityCard member={member}/>
    {kind!=='surgery'&&<nav className="inline-profile-tabs" aria-label={`${titles[kind]}分类`}>{data?.groups.map(g=><button type="button" disabled={busy} key={g.id} aria-pressed={group===g.id} onClick={()=>{setSession(old=>({...old,group:g.id}));setConfirmDelete(undefined)}}>{g.name}</button>)}{kind==='family-history'&&<button disabled={busy} type="button" aria-label="添加亲属关系" onClick={()=>setSession(old=>({...old,relation:old.relation??fresh()}))}><Plus size={18} aria-hidden/></button>}</nav>}
    {kind==='family-history'&&session.relation&&<form className="inline-profile-editor" onSubmit={e=>{e.preventDefault();void command({action:'relation',name:session.relation?.name,key:session.relation?.key},next=>{setSession(old=>({...old,relation:undefined,group:next.groups.at(-1)?.id??old.group}))})}}><label className="hoho-field"><span>亲属关系</span><input className="hoho-input" autoFocus maxLength={20} disabled={busy} value={session.relation.name} onChange={e=>setSession(old=>({...old,relation:{...old.relation!,name:e.target.value,key:crypto.randomUUID()}}))}/></label><div className="inline-profile-actions"><HohoButton variant="text" disabled={busy} onClick={()=>setSession(old=>({...old,relation:undefined}))}>取消</HohoButton><HohoButton type="submit" loading={busy} disabled={!session.relation.name.trim()}>添加关系</HohoButton></div></form>}
    {loading&&<p role="status">正在读取档案…</p>}
    {busy&&<p role="status">正在保存…</p>}
    {error&&<StatusNotice tone="error" title={error} action={<HohoButton variant="text" disabled={busy} onClick={()=>setReload(v=>v+1)}>重新加载</HohoButton>}/>}
    {status&&<p role="status">{status}{undo&&<HohoButton variant="text" disabled={busy} onClick={()=>void command({action:'restore',undoId:undo,key:crypto.randomUUID()},()=>setUndo(undefined))}>撤销</HohoButton>}</p>}
    {data&&<><ul className="inline-profile-list">{rows.map((r,i)=>record(r,i))}</ul>{!rows.length&&!active&&<p className="inline-profile-empty">暂无已录入记录</p>}{active==='new'?editor('new',group):<HohoButton className="inline-profile-add" variant="secondary" fullWidth disabled={busy} onClick={()=>begin('new')}><Plus aria-hidden size={18}/>新增</HohoButton>}
      {kind==='vaccination'&&['年龄待确认','7岁及以上'].map(g=>{const entries=data.rows.filter(r=>r.group===g);return entries.length?<section key={g}><h2 className="hoho-text-card-title">{g}</h2><p className="hoho-text-caption">保留原记录，不归入其他年龄组。</p><ul className="inline-profile-list">{entries.map((r,i)=>record(r,i,g))}</ul></section>:null})}
    </>}
  </div></main>
}
