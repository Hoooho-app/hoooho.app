import { CompleteImage } from '../../components/common/CompleteImage'
import { useEffect, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { BottomSheetSurface, HohoButton } from '../../components/design-system'
import fieldLabels from '../../../shared/ai-business-field-labels.json'
import { useAppStore } from '../../store/useAppStore'
import './profileUploadBatch.css'

type Source={sourceId:string;page:number;quote:string}
type Item={id:string;title:string;archiveCategory:string|null;timeText:string|null;fields:{name:string;value:string;sources:Source[]}[]}
type Draft={id:string;version:number;state:string;profileBatchId?:string|null;items:Item[];sources:{id:string;page:number;text:string;status:string}[];pages:{id:string;page:number;name:string}[];documentWarnings:string[];unmappedRows:{text:string}[];confirmPageWarnings:boolean}
type Owner={id:string;name:string}
type Added={id:string;file:File;url:string}
const groups=[['allergy','过敏史'],['chronic','慢性病史'],['family-history','家族史'],['surgery','手术史'],['vaccination','疫苗接种记录']] as const
const labels:Record<string,string>={...fieldLabels,relationship:'亲属关系',vaccineName:'疫苗名称',manufacturerName:'生产企业',batchNumber:'批号'}
const readData=(file:File)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('资料读取失败，请重试'));reader.readAsDataURL(file)})
// File names and accept are not trusted type evidence. The server also decodes
// every image/PDF before storing a draft or calling recognition.
async function supported(file:File){
  const bytes=new Uint8Array(await file.slice(0,16).arrayBuffer())
  const signature=String.fromCharCode(...bytes)
  return file.type==='application/pdf'?signature.startsWith('%PDF-'):file.type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:file.type==='image/png'?bytes[0]===137&&signature.slice(1,4)==='PNG':file.type==='image/webp'?signature.startsWith('RIFF')&&signature.slice(8,12)==='WEBP':false
}
export function ProfileUploadBatch({member,token,onSaved}:{member:Owner|null;token:string;onSaved:()=>void}){
  const accountId=useAppStore(s=>s.authUser?.id),activeToken=useAppStore(s=>s.authToken)
  const picker=useRef<HTMLInputElement>(null),camera=useRef<HTMLInputElement>(null),pickerOwner=useRef<Owner|null>(null)
  const [owner,setOwner]=useState<Owner|null>(null),[files,setFiles]=useState<Added[]>([]),[draft,setDraft]=useState<Draft|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const locked=useRef(false),draftRef=useRef<Draft|null>(null),changes=useRef(new Map<string,Record<string,unknown>>()),urls=useRef(new Set<string>()),mounted=useRef(true)
  const credentials=useRef({accountId,token});credentials.current={accountId,token:activeToken??token}
  const initialAccount=useRef(accountId)
  const batchId=useRef(crypto.randomUUID())
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;urls.current.forEach(url=>URL.revokeObjectURL(url))}},[])
  const current=(value:Draft)=>{draftRef.current=value;setDraft(value)}
  const openPicker=(capture=false)=>{if(locked.current||!member)return;pickerOwner.current=owner??{id:member.id,name:member.name};(capture?camera:picker).current?.click()}
  async function append(selected:File[]){
    if(!selected.length)return
    const target=pickerOwner.current;if(!target||locked.current)return
    locked.current=true
    try{
      const accepted:Added[]=[];let rejected=false,total=files.reduce((n,f)=>n+f.file.size,0)
      for(const file of selected){if(!await supported(file)||files.length+accepted.length>=12||total+file.size>15*1024*1024){rejected=true;continue}total+=file.size;const url=URL.createObjectURL(file);urls.current.add(url);accepted.push({id:crypto.randomUUID(),file,url})}
      if(!mounted.current)return
      if(accepted.length){setOwner(target);setFiles(old=>[...old,...accepted]);currentReset();setNotice('')}
      setError(rejected?'仅支持 JPEG、PNG、WebP 图片和 PDF，最多12份、15 MB；其他已添加资料仍保留。':'')
    }catch{setError('资料读取失败，已添加资料仍保留，请重试')}finally{locked.current=false}
  }
  function currentReset(){draftRef.current=null;setDraft(null);changes.current.clear()}
  async function request<T>(path:string,method:string,input?:unknown):Promise<T>{
    if(initialAccount.current!==credentials.current.accountId)throw new Error('登录账号已变化，本批资料未保存')
    const response=await fetch(path,{method,headers:{Authorization:`Bearer ${credentials.current.token}`,'Content-Type':'application/json'},body:input===undefined?undefined:JSON.stringify(input)})
    const value=await response.json();if(!response.ok)throw new Error(value.error?.message??'操作失败，资料仍保留，请重试');return value as T
  }
  async function run(action:()=>Promise<void>){if(locked.current)return;locked.current=true;setBusy(true);setError('');try{await action()}catch(e){if(mounted.current)setError(e instanceof Error?e.message:'操作失败，请重试')}finally{locked.current=false;if(mounted.current)setBusy(false)}}
  const url=`/api/members/${encodeURIComponent(owner?.id??'')}/ai-drafts`
  async function organize(){await run(async()=>{
    const before=draftRef.current
    try{const next=await request<Draft>(url,'POST',{id:before?.id,version:before?.version,task:'archive',profileBatch:true,profileBatchId:batchId.current,timezone:'Asia/Shanghai',files:await Promise.all(files.map(async({file})=>({name:file.name,mimeType:file.type,dataUrl:await readData(file)})))});current(next);changes.current.clear()}
    catch(e){try{const retained=await request<Draft|null>(before?`${url}/${before.id}`:url,'GET');if(retained?.profileBatchId===batchId.current)current(retained)}catch{/* Local originals stay available even if draft recovery fails. */}throw e}
  })}
  const queue=(key:string,input:Record<string,unknown>)=>changes.current.set(key,input)
  async function save(){await run(async()=>{
    let value=draftRef.current;if(!value||value.state!=='ready')throw new Error('请先成功整理资料')
    for(const [key,change] of changes.current){value=await request<Draft>(`${url}/${value.id}`,'PATCH',{version:value.version,...change});current(value);changes.current.delete(key)}
    const saved=await request<Draft>(`${url}/${value.id}/save`,'POST',{version:value.version,confirmed:true});current(saved)
    setOwner(null);setFiles([]);batchId.current=crypto.randomUUID();currentReset();setNotice('资料已整理到档案');onSaved()
  })}
  async function close(){if(locked.current)return;await run(async()=>{if(draftRef.current&&draftRef.current.state!=='saved')await request(`${url}/${draftRef.current.id}`,'DELETE');currentReset();batchId.current=crypto.randomUUID();setOwner(null);setFiles([]);setError('')})}
  const renderItem=(item:Item)=><section className="profile-upload-item" key={item.id}>
    <label>日期<input defaultValue={item.timeText??''} placeholder="待确认，不使用上传日期" disabled={busy} onChange={e=>queue(`${item.id}:time`,{itemId:item.id,field:'time',value:e.target.value})}/></label>
    {item.fields.map(f=><label key={f.name}>{labels[f.name]??f.name}<input defaultValue={f.value} disabled={busy} onChange={e=>queue(`${item.id}:${f.name}`,{itemId:item.id,field:f.name,value:e.target.value})}/><details><summary>来源原话</summary>{f.sources.map((s,i)=><p key={i}>{draft?.pages.find(p=>p.id===s.sourceId)?.name??'资料'} · 第{s.page}页：{s.quote}</p>)}</details></label>)}
    <label>归档位置<select defaultValue={item.archiveCategory??''} disabled={busy} onChange={e=>queue(`${item.id}:archive`,{itemId:item.id,archiveCategory:e.target.value||null})}><option value="">仅保留原件与识别内容</option>{groups.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
  </section>
  const ready=draft?.state==='ready'
  return <>
    <input ref={picker} hidden aria-label="选择上传资料" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e=>{const selected=Array.from(e.target.files??[]);e.target.value='';void append(selected)}}/>
    <input ref={camera} hidden aria-label="拍摄资料照片" type="file" capture="environment" accept="image/jpeg,image/png,image/webp" onChange={e=>{const selected=Array.from(e.target.files??[]);e.target.value='';void append(selected)}}/>
    <button className="health-profile-smart-record" disabled={!member||!token} onClick={()=>openPicker()} type="button"><span><strong>上传资料</strong><small>报告、病历、接种回执，自动整理到各项档案</small></span><Upload aria-hidden="true" size={24} strokeWidth={1.6}/></button>
    {!owner&&error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <BottomSheetSurface open={!!owner} label={ready?'整理结果':'上传资料'} title={ready?'整理结果':'上传资料'} onClose={()=>void close()} size="workspace" className="profile-upload-sheet" footer={<HohoButton disabled={busy||(!ready&&!files.length)} loading={busy} onClick={()=>void(ready?save():organize())}>{busy?'正在整理资料…':ready?'保存到档案':'开始整理'}</HohoButton>}>
      <p>资料归属：{owner?.name}</p>
      {busy&&<p role="status">正在整理资料…</p>}{error&&<p role="alert">{error}。资料仍保留，可重试。</p>}
      {!ready?<><ul className="profile-upload-files">{files.map(added=><li key={added.id}>{added.file.type.startsWith('image/')?<CompleteImage src={added.url} alt="已添加资料"/>:<span>PDF</span>}<a href={added.url} target="_blank" rel="noreferrer">{added.file.name}</a><button disabled={busy} aria-label={`移除${added.file.name}`} type="button" onClick={()=>{setFiles(old=>old.filter(f=>f.id!==added.id));currentReset()}}>移除</button></li>)}</ul><div className="profile-upload-add"><HohoButton variant="secondary" disabled={busy} onClick={()=>openPicker()}>继续添加</HohoButton><HohoButton variant="text" disabled={busy} onClick={()=>openPicker(true)}>继续拍照</HohoButton></div></>:<>
        {groups.map(([id,name])=>{const items=draft.items.filter(i=>i.archiveCategory===id);return items.length?<section key={id}><h3>{name}</h3>{items.map(renderItem)}</section>:null})}
        {draft.items.some(i=>!groups.some(([id])=>id===i.archiveCategory))&&<section><h3>资料与识别内容（待确认）</h3>{draft.items.filter(i=>!groups.some(([id])=>id===i.archiveCategory)).map(renderItem)}</section>}
        {draft.documentWarnings?.length>0&&<label><input type="checkbox" onChange={e=>queue('pageWarnings',{confirmPageWarnings:e.target.checked})}/>{draft.documentWarnings.join(' ')} 已对照原件核对，按现有资料保存</label>}
        {draft.unmappedRows?.length>0&&<section><h3>原文待确认</h3>{draft.unmappedRows.map((row,i)=><p key={i}>{row.text}</p>)}<p>保留在原件与识别内容中，不据此生成诊断。</p></section>}
        {draft.sources.map(source=><details key={`${source.id}:${source.page}`}><summary>{draft.pages.find(p=>p.id===source.id)?.name??'资料'} · 第{source.page}页原文</summary><p className="profile-upload-source">{source.text}</p>{source.status==='uncertain'&&<label><input type="checkbox" onChange={e=>queue(`page:${source.id}:${source.page}`,{confirmPage:`${source.id}:${source.page}`,confirmed:e.target.checked})}/>已对照原件核对不清楚内容</label>}</details>)}
        <details><summary>查看本批原件</summary>{files.map(f=><p key={f.id}><a href={f.url} target="_blank" rel="noreferrer">{f.file.name}</a></p>)}</details>
      </>}
    </BottomSheetSurface>
  </>
}
