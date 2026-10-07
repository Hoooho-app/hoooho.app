import { useEffect, useState } from 'react'
import { Mic } from 'lucide-react'
import { BottomSheetSurface, HohoButton } from '../../components/design-system'
import { useSymptomVoice } from './useSymptomVoice'
export function SymptomVoiceSheet({onClose,onApply}:{onClose:()=>void;onApply:(text:string)=>boolean}) {
  const [text,setText]=useState(''),[error,setError]=useState('')
  const voice=useSymptomVoice(text,setText)
  useEffect(()=>{void voice.start();return()=>voice.cancel()},[])
  const close=()=>{voice.cancel();onClose()}
  return <BottomSheetSurface open label="普通语音输入" title="语音输入" leading={<Mic size={21}/>} viewportAware className="symptom-voice-sheet" layerClassName="symptom-input-layer" onClose={close} headerAction={voice.busy?<HohoButton variant="ghost" onClick={voice.stop}>结束语音</HohoButton>:undefined} footer={<HohoButton fullWidth disabled={voice.busy||!text.trim()} onClick={()=>{if(onApply(text.trim()))close();else setError('追加后超过1000字，请精简这段文字再使用。')}}>使用这段文字</HohoButton>}>
    <span className="symptom-input-target">写入：症状描述</span><p>说一段，转成文字。不会主动追问。</p>
    <label>这段文字<textarea className="hoho-textarea" aria-label="语音转写文字" maxLength={1000} readOnly={voice.busy} value={text} onChange={e=>setText(e.target.value)}/></label>
    <p role="status">{voice.busy?'正在转写，请结束语音后核对。':'原有症状内容保留，新文字追加在末尾。'}</p>
    {(voice.error||error)&&<p role="alert">{voice.error||error}</p>}
    {!voice.busy&&<HohoButton variant="secondary" onClick={()=>void voice.start()}>{voice.error?'重试语音':'继续语音'}</HohoButton>}
  </BottomSheetSurface>
}
