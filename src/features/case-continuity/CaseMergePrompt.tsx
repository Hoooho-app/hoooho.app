import {createPortal} from 'react-dom'
import {useState} from 'react'
import {BottomSheetSurface,HohoButton,HohoInput} from '../../components/design-system'
import {useCases} from './useCases'
import {mergeSuggestion} from './mergeSuggestion'
import {caseService} from './api'
import {useAppStore} from '../../store/useAppStore'
export function CaseMergePrompt({focusIds}:{focusIds?:string[]}) {
 const {data,reload,memberId,token}=useCases(),accountId=useAppStore(s=>s.authUser?.id)
 const suggestion=mergeSuggestion(data?.active??[],focusIds)
 const [open,setOpen]=useState(false),[name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 if(!suggestion)return null
 const {target,source,title}=suggestion
 async function submit(action:'merge'|'separate') {
  if(busy)return;setBusy(true);setError('')
  try {await caseService.merge(memberId,token,target,source,action,name||title);if(useAppStore.getState().currentMemberId!==memberId||useAppStore.getState().authUser?.id!==accountId)return;setOpen(false);reload()}
  catch(e){setError(e instanceof Error?e.message:'操作没有完成，请重试');reload()}
  finally{setBusy(false)}
 }
 return <div className="case-merge-prompt"><HohoButton variant="secondary" fullWidth onClick={()=>{setName(title);setError('');setOpen(true)}}>合并这两项</HohoButton>{createPortal(<BottomSheetSurface open={open} title="合并为同一件事" label="合并情况" onClose={()=>{if(!busy)setOpen(false)}} footer={<><HohoButton fullWidth loading={busy} disabled={busy||!name.trim()} onClick={()=>void submit('merge')}>确认合并</HohoButton><HohoButton fullWidth variant="secondary" disabled={busy} onClick={()=>void submit('separate')}>分开保留</HohoButton></>}><p>合并，就是把相关记录归到同一件事里，方便持续跟进。</p><p className="hoho-text-caption">原文、图片和时间都会保留。是否属于同一件事，由你确认。</p><ul>{[target,source].map(item=><li key={item.event.id}><strong>{item.followup.title}</strong><p>{item.followup.recordCount} 条记录 · {item.followup.latestOccurredAt?new Date(item.followup.latestOccurredAt).toLocaleString('zh-CN',{hour12:false}):'时间未提供'}</p><p>{item.followup.description}</p></li>)}</ul><HohoInput label="合并后的名称" maxLength={24} value={name} onChange={e=>setName(e.target.value)}/>{error&&<p role="alert">{error}</p>}</BottomSheetSurface>,document.body)}</div>
}
