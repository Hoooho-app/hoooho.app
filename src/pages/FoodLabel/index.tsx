import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LoaderCircle } from 'lucide-react'
import { WebPageHeader } from '../../components/common/WebPageHeader'
import { HealthTag, HohoButton } from '../../components/design-system'
import hero from '../../assets/food-label/food-label-camera.png'
import { useAppStore } from '../../store/useAppStore'
import { prepareFoodLabelPhoto } from './preparePhoto'
import './foodLabel.css'

type Ingredient={original:string;chinese:string;status:'known'|'possible'|'pending'|'clear';reason:string;parent?:number|null}
type Result={taskId:string;memberId:string;ingredients:Ingredient[];contains:Ingredient[];advisory:Ingredient[];title:string;counts:string;scope:string;tone:'error'|'success'|'warning';previews?:string[]}
const statusText={known:'已知过敏',possible:'可能风险',pending:'待确认',clear:'未发现冲突'}
const statusTone={known:'error',possible:'warning',pending:'neutral',clear:'success'} as const

export function FoodLabelPage(){
  const memberId=useAppStore(s=>s.currentMemberId),accountId=useAppStore(s=>s.authUser?.id??'')
  return <FoodLabelSession key={`${accountId}:${memberId}`} memberId={memberId}/>
}
function FoodLabelSession({memberId}:{memberId:string}){
  const navigate=useNavigate(),token=useAppStore(s=>s.authToken)
  const camera=useRef<HTMLInputElement>(null),album=useRef<HTMLInputElement>(null)
  const controller=useRef<AbortController>(),generation=useRef(0),mounted=useRef(true)
  const [screen,setScreen]=useState<'entry'|'result'>('entry'),[photos,setPhotos]=useState<{dataUrl:string}[]>([])
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<Result|null>(null)
  const clear=()=>{generation.current++;controller.current?.abort();setPhotos([]);setResult(null);setError('');setBusy(false);setScreen('entry')}
  useEffect(()=>{mounted.current=true;const leave=()=>clear();window.addEventListener('pagehide',leave);return()=>{mounted.current=false;generation.current++;controller.current?.abort();window.removeEventListener('pagehide',leave)}},[])
  const back=()=>{if(screen==='result')clear();else navigate('/nurse-station')}
  async function choose(files:File[]){
    if(!files.length)return
    controller.current?.abort();const version=++generation.current
    const taskId=crypto.randomUUID(),abort=new AbortController();controller.current=abort
    const active=()=>mounted.current&&generation.current===version&&!abort.signal.aborted&&useAppStore.getState().currentMemberId===memberId
    setScreen('result');setBusy(true);setResult(null);setError('')
    try{
      if(photos.length+files.length>6)throw new Error('一次可核对同一食品的1–6张照片，请重新拍摄')
      const added=[]
      for(const file of files){const photo=await prepareFoodLabelPhoto(file);if(!active())return;added.push(photo)}
      const all=[...photos,...added];if(!active())return;setPhotos(all)
      const response=await fetch('/api/food-label/check',{method:'POST',credentials:'same-origin',cache:'no-store',signal:abort.signal,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({memberId,taskId,photos:all})})
      const body=await response.json()
      if(!active())return
      if(!response.ok)throw new Error(body.error?.message??'本次识别未完成，请补拍或重新拍摄')
      if(body.taskId!==taskId||body.memberId!==memberId)throw new Error('本次核对状态已变化，请重新拍摄')
      setResult(body)
    }catch(failure){if(active())setError(failure instanceof Error?failure.message:'本次识别未完成，请补拍或重新拍摄')}
    finally{if(active())setBusy(false)}
  }
  const onFiles=(event:React.ChangeEvent<HTMLInputElement>)=>{const files=Array.from(event.target.files??[]);event.target.value='';void choose(files)}
  const retake=()=>{clear();camera.current?.click()}
  return <main className="app-shell food-label-page">
    <WebPageHeader title={screen==='entry'?'食品标签核对':'核对结果'} onBack={back}/>
    <div className="food-label-content">
      {screen==='entry'?<div className="food-label-entry">
        <img className="food-label-hero" src={hero} alt="手机正对食品罐背面的英文 INGREDIENTS 标签拍摄"/>
        <HohoButton fullWidth size="large" onClick={()=>camera.current?.click()}>拍摄食品标签</HohoButton>
        <HohoButton fullWidth size="large" variant="secondary" onClick={()=>album.current?.click()}>从相册选择</HohoButton>
      </div>:<>
        <div className="food-label-photo-actions"><HohoButton size="small" variant="secondary" onClick={()=>camera.current?.click()}>补拍</HohoButton></div>
        <div className="food-label-photos">{photos.map((photo,index)=><img alt={`本次标签照片 ${index+1}`} key={index} src={result?.previews?.[index]??photo.dataUrl}/>)}</div>
        <section className="food-label-summary" data-tone={busy||error?'neutral':result?.tone} role="status" aria-live="polite" aria-busy={busy}>
          <h2>{busy?<><LoaderCircle aria-hidden="true" className="food-label-spinner"/>正在核对成分</>:error||result?.title}</h2>
          {busy?<p>识别配料并对照当前过敏记录</p>:result?<><p>{result.counts}</p><p>{result.scope}</p></>:null}
        </section>
        {result&&<>
          <h2 className="hoho-text-card-title food-label-list-title">全部成分 · {result.ingredients.length}项</h2>
          <ol className="food-label-ingredients">{result.ingredients.map((row,index)=><li key={index}>
            <span className="food-label-number">{String(index+1).padStart(2,'0')}</span>
            <div><div className="food-label-row-heading"><strong>{row.parent!=null?'↳ ':''}{row.chinese}</strong><HealthTag tone={statusTone[row.status]}>{statusText[row.status]}</HealthTag></div><p className="food-label-original" lang="und">{row.original}</p>{row.reason&&<p className="food-label-reason">{row.reason}</p>}</div>
          </li>)}</ol>
          {[...result.contains.map(row=>({...row,kind:'包装含有声明'})),...result.advisory.map(row=>({...row,kind:'包装交叉接触提示'}))].map((row,index)=><div className="food-label-package-note" key={index}><strong>{row.kind}：{row.chinese}</strong><HealthTag tone={statusTone[row.status]}>{statusText[row.status]}</HealthTag><p>{row.original}</p><p>{row.reason}</p></div>)}
          <p className="food-label-footnote">绿色仅表示本次未发现已知冲突，不保证绝无过敏风险。</p>
        </>}
        <HohoButton fullWidth variant="secondary" size="large" onClick={retake}>重新拍摄</HohoButton>
      </>}
    </div>
    <input hidden ref={camera} type="file" accept="image/*,.heic,.heif" capture="environment" onChange={onFiles}/>
    <input hidden ref={album} type="file" accept="image/*,.heic,.heif" multiple onChange={onFiles}/>
  </main>
}
