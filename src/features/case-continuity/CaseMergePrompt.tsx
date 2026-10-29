import {useRef,useState} from 'react'
import {Link2} from '../../components/icons'
import {HohoButton} from '../../components/design-system'
import {useCases} from './useCases'
import {mergeSuggestion} from './mergeSuggestion'
import {caseService} from './api'
import {useAppStore} from '../../store/useAppStore'
import './caseMergePrompt.css'

export function CaseMergePrompt({focusIds}:{focusIds:string[]}) {
 const {data,reload,memberId,token}=useCases(),accountId=useAppStore(s=>s.authUser?.id)
 const suggestion=mergeSuggestion(data?.active??[],focusIds)
 const pending=useRef(false)
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[resolved,setResolved]=useState<string[]>([])
 if(!suggestion)return null
 const {target,source,title}=suggestion
 const pair=[target.event.id,source.event.id].sort().join(':')
 if(resolved.includes(pair))return null
 async function submit(action:'merge'|'separate') {
  if(pending.current)return
  pending.current=true;setBusy(true);setError('')
  try {
   await caseService.merge(memberId,token,target,source,action,title)
   if(useAppStore.getState().currentMemberId!==memberId||useAppStore.getState().authUser?.id!==accountId)return
   setResolved(current=>[...current,pair]);reload()
  } catch(e){setError(e instanceof Error?e.message:'操作没有完成，请重试');reload()}
  finally{pending.current=false;setBusy(false)}
 }
 return <section className="case-merge-prompt" aria-label="症状合并建议">
  <h3><Link2 size={18} aria-hidden="true"/>可能是同一次症状</h3>
  <p>“{source.followup.title}”与已有的“{target.followup.title}”相似，要归入同一个症状事件吗？</p>
  <small>由你确认后合并，原文、图片和时间都会保留。</small>
  <div className="case-merge-prompt__actions"><HohoButton variant="secondary" disabled={busy} onClick={()=>void submit('separate')}>保持独立</HohoButton><HohoButton loading={busy} disabled={busy} onClick={()=>void submit('merge')}>合并到该事件</HohoButton></div>
  {error&&<p role="alert">{error}</p>}
 </section>
}
