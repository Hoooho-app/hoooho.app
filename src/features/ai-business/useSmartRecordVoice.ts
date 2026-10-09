import { useEffect, useRef, useState } from 'react'
import { recordingToWav } from './recordingAudio'
import { AudioRequestError, audioErrorMessage } from './audioErrors'

const asDataUrl = (blob:Blob) => new Promise<string>((resolve,reject) => { const reader=new FileReader(); reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('录音读取失败'));reader.readAsDataURL(blob) })
type Options = {memberId:string;token:string;pendingVoice?:File;onRecorded:(file:File)=>Promise<void>;onTranscript:(text:string)=>Promise<void>}
// The raw recording is persisted before contacting ASR. Retry consumes the same
// file, so a network failure or closing the workspace never requires re-recording.
export function useSmartRecordVoice(options:Options) {
  const latest=useRef(options);latest.current=options
  const [state,setState]=useState<'idle'|'requesting'|'listening'|'transcribing'>('idle'),[error,setError]=useState('')
  const recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),controller=useRef<AbortController|null>(null),limit=useRef<ReturnType<typeof setTimeout>|null>(null)
  const mounted=useRef(true),generation=useRef(0),locked=useRef(false),keep=useRef(true),stopRequested=useRef(false)
  const clean=()=>{stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;if(limit.current)clearTimeout(limit.current);limit.current=null}
  const transcribe=async(file:File)=>{
    if(locked.current)return
    locked.current=true;const turn=generation.current,config=latest.current,abort=new AbortController();controller.current=abort
    if(mounted.current){setState('transcribing');setError('')}
    const timeout=setTimeout(()=>abort.abort(),60000)
    try{
      const wav=await recordingToWav(file)
      if(!mounted.current||turn!==generation.current)return
      const response=await fetch('/api/ai/audio/transcriptions',{method:'POST',headers:{Authorization:`Bearer ${latest.current.token}`,'Content-Type':'application/json'},signal:abort.signal,body:JSON.stringify({memberId:config.memberId,mimeType:wav.type,dataUrl:await asDataUrl(wav),name:'recording.wav'})})
      const result=await response.json().catch(()=>{throw new AudioRequestError('ASR_OUTPUT_INVALID',response.status)})
      if(!response.ok)throw new AudioRequestError(result.error?.code??'ASR_UPSTREAM_UNAVAILABLE',response.status)
      if(typeof result.transcript!=='string'||!result.transcript.trim())throw new AudioRequestError('ASR_NO_SPEECH',422)
      if(mounted.current&&turn===generation.current)await latest.current.onTranscript(result.transcript)
    }catch(e){if(mounted.current&&turn===generation.current)setError(audioErrorMessage(abort.signal.aborted?{code:'ASR_TIMEOUT'}:e))}
    finally{clearTimeout(timeout);locked.current=false;if(mounted.current&&turn===generation.current)setState('idle')}
  }
  const stop=()=>{stopRequested.current=true;if(recorder.current?.state==='recording')recorder.current.stop()}
  const discard=()=>{keep.current=false;stop()}
  const start=async()=>{
    if(locked.current||recorder.current||latest.current.pendingVoice)return
    if(!navigator.mediaDevices?.getUserMedia||!globalThis.MediaRecorder){setError('当前浏览器不支持录音，请输入文字');return}
    const turn=++generation.current;locked.current=true;keep.current=true;stopRequested.current=false;setState('requesting');setError('')
    try{
      const media=await navigator.mediaDevices.getUserMedia({audio:true})
      if(!mounted.current||turn!==generation.current||stopRequested.current){media.getTracks().forEach(t=>t.stop());locked.current=false;if(mounted.current)setState('idle');return}
      stream.current=media
      const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(m=>MediaRecorder.isTypeSupported(m)),r=new MediaRecorder(media,mime?{mimeType:mime}:undefined),chunks:Blob[]=[],started=Date.now()
      recorder.current=r;const config=latest.current
      r.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)}
      r.onerror=()=>{stop();if(mounted.current)setError('录音中断，已收音的内容会保留，可重试')}
      r.onstop=()=>{void(async()=>{
        clean();recorder.current=null;locked.current=false
        if(mounted.current)setState('idle')
        if(!keep.current)return
        const blob=new Blob(chunks,{type:r.mimeType});chunks.length=0
        if(blob.size<300||Date.now()-started<500){if(mounted.current)setError('录音太短，请重新录音');return}
        const file=new File([blob],`语音原件-${started}.${r.mimeType.includes('mp4')?'m4a':'webm'}`,{type:r.mimeType})
        try{await config.onRecorded(file);if(mounted.current&&turn===generation.current)await transcribe(file)}catch{if(mounted.current)setError('录音草稿保存失败，请保持页面打开并重试')}
      })()}
      r.start(250);locked.current=false;setState('listening');limit.current=setTimeout(stop,90000)
    }catch(e){clean();locked.current=false;if(mounted.current){setState('idle');setError(e instanceof DOMException&&e.name==='NotAllowedError'?'麦克风未获授权，请允许麦克风或输入文字':'麦克风暂不可用，请输入文字')}}
  }
  useEffect(()=>{mounted.current=true;const hidden=()=>{if(document.hidden)stop()};document.addEventListener('visibilitychange',hidden);return()=>{mounted.current=false;generation.current++;controller.current?.abort();stop();clean();document.removeEventListener('visibilitychange',hidden)}},[])
  return {state,error,busy:state!=='idle',start,stop,discard,retry:()=>{if(latest.current.pendingVoice)void transcribe(latest.current.pendingVoice)}}
}
