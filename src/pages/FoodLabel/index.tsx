import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LoaderCircle, Plus } from 'lucide-react'
import { WebPageHeader } from '../../components/common/WebPageHeader'
import { HealthTag, HohoButton } from '../../components/design-system'
import hero from '../../assets/food-label/food-label-camera.png'
import { useAppStore } from '../../store/useAppStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { getAccountPreferences } from '../../features/settings/preferences'
import { foodLabelCopy, foodLabelLanguage, ingredientTranslation } from './presentation'
import { prepareFoodLabelPhoto } from './preparePhoto'
import './foodLabel.css'

type Ingredient={original:string;chinese:string;english?:string;sourceLanguage?:string;status:'known'|'possible'|'pending'|'clear';reason:string;parent?:number|null}
type Result={taskId:string;memberId:string;ingredients:Ingredient[];contains:Ingredient[];advisory:Ingredient[];title:string;counts:string;scope:string;tone:'error'|'success'|'warning';previews?:string[]}

export function FoodLabelPage(){
  const memberId=useAppStore(s=>s.currentMemberId),accountId=useAppStore(s=>s.authUser?.id??'')
  return <FoodLabelSession key={`${accountId}:${memberId}`} memberId={memberId}/>
}
function FoodLabelSession({memberId}:{memberId:string}){
  const navigate=useNavigate(),token=useAppStore(s=>s.authToken)
  const accountId=useAppStore(s=>s.authUser?.id),accounts=useSettingsStore(s=>s.accounts)
  const language=foodLabelLanguage(getAccountPreferences(accounts,accountId).interfaceLanguage),copy=foodLabelCopy[language]
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
      if(!response.ok)throw new Error(body.error?.code==='FOOD_NO_INGREDIENTS'?copy.empty:body.error?.message??'本次识别未完成，请补拍或重新拍摄')
      if(body.taskId!==taskId||body.memberId!==memberId)throw new Error('本次核对状态已变化，请重新拍摄')
      setResult(body)
    }catch(failure){if(active())setError(failure instanceof Error?failure.message:'本次识别未完成，请补拍或重新拍摄')}
    finally{if(active())setBusy(false)}
  }
  const onFiles=(event:React.ChangeEvent<HTMLInputElement>)=>{const files=Array.from(event.target.files??[]);event.target.value='';void choose(files)}
  const retake=()=>{clear();camera.current?.click()}
  return <main className="app-shell food-label-page">
    <WebPageHeader title={screen==='entry'?copy.entry:copy.result} onBack={back}/>
    <div className="food-label-content">
      {screen==='entry'?<div className="food-label-entry">
        <img className="food-label-hero" src={hero} alt="手机正对食品罐背面的英文 INGREDIENTS 标签拍摄"/>
        <HohoButton fullWidth size="large" onClick={()=>camera.current?.click()}>{copy.camera}</HohoButton>
        <HohoButton fullWidth size="large" variant="secondary" onClick={()=>album.current?.click()}>{copy.album}</HohoButton>
      </div>:<>
        <div className="food-label-photos">
          {photos.map((photo,index)=><img alt={`${copy.photo} ${index+1}`} key={index} src={result?.previews?.[index]??photo.dataUrl}/>)}
          <button className="food-label-supplement" type="button" aria-label={copy.supplement} onClick={()=>camera.current?.click()}><Plus aria-hidden="true"/></button>
        </div>
        <section className="food-label-summary" role="status" aria-live="polite" aria-busy={busy}>
          <p>{busy?<><LoaderCircle aria-hidden="true" className="food-label-spinner"/>{copy.loading}</>:error|| (result?copy.stats(result.ingredients.length,result.ingredients.filter(row=>row.status==='known').length):'')}</p>
        </section>
        {result&&<>
          <h2 className="hoho-text-card-title food-label-list-title">{copy.all}</h2>
          <ol className="food-label-ingredients">{result.ingredients.map((row,index)=><li key={index}>
            <span className="food-label-number">{String(index+1).padStart(2,'0')}</span>
            <div><div className="food-label-row-heading"><strong lang={row.sourceLanguage??'und'}>{row.original}</strong>{row.status==='known'&&<HealthTag tone="error">{copy.known}</HealthTag>}</div>{ingredientTranslation(row,language)&&<p className="food-label-translation" lang={language}>{ingredientTranslation(row,language)}</p>}</div>
          </li>)}</ol>
        </>}
        <HohoButton fullWidth variant="secondary" size="large" onClick={retake}>{copy.retake}</HohoButton>
      </>}
    </div>
    <input hidden ref={camera} type="file" accept="image/*,.heic,.heif" capture="environment" onChange={onFiles}/>
    <input hidden ref={album} type="file" accept="image/*,.heic,.heif" multiple onChange={onFiles}/>
  </main>
}
