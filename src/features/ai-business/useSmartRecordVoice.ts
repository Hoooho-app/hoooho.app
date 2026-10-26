import {startLiveAudioPreview} from './liveAudioPreview'
import {startAITiming} from '../../services/aiTiming'
import { observeAudioLevel } from './observeAudioLevel'
import { useEffect, useRef, useState } from 'react'
import { recordingToWav } from './recordingAudio'
import { AudioRequestError, audioErrorMessage } from './audioErrors'
import { apiRequest } from '../../services/apiClient'
import { abortable } from '../../services/abortable'
import { fileDataUrl } from './draftFiles'

export type VoiceDraft = {id:string;text:string;at:number;phase:'listening'|'finalizing'|'partial'|'interrupted'}

type Options = {
  /** Stable account/member/conversation identity, not a rotating auth token. */
  scopeKey?:string
  transcriptOnly?:boolean
  livePreview?:boolean
  prepareAudio?: (file: File) => Promise<Blob>; timeoutMs?: number; audioBitsPerSecond?: number; ephemeral?: boolean; autoTranscribe?: boolean
  memberId: string; token: string; pendingVoice?: File; pendingTranscript?: string
  onFinalizationStart?: () => () => void
  onRecorded: (file: File,previewText?:string) => Promise<void>; onTranscript: (text: string, file: File, sessionId?:string, recordedAt?:number) => Promise<void>
}
type Operation = { turn: number; controller: AbortController; timer: ReturnType<typeof setTimeout> }
// Other recording workspaces persist the immutable original before ASR. Quick
// lookup opts into compressed audio and a deadline starting when the user releases.
export function useSmartRecordVoice(options: Options) {
  const latest = useRef(options); latest.current = options
  const [liveText,setLiveText]=useState(''),[liveUnavailable,setLiveUnavailable]=useState(false)
  const [draft,setDraft]=useState<VoiceDraft>(),draftRef=useRef<VoiceDraft>(),adopted=useRef(false)
  const publishDraft=(value:VoiceDraft|undefined)=>{draftRef.current=value;if(mounted.current)setDraft(value)}
  const updateDraft=(patch:Partial<VoiceDraft>)=>{if(draftRef.current)publishDraft({...draftRef.current,...patch})}
  const liveStop=useRef<(()=>void)|undefined>(),liveTextRef=useRef('')
  const endLive=()=>{liveStop.current?.();liveStop.current=undefined}
  const [audioLevel, setAudioLevel] = useState(0)
  const [phase, setPhase] = useState<'preparing' | 'recognizing' | 'delivering'>('preparing')
  const [state, setState] = useState<'idle' | 'requesting' | 'listening' | 'transcribing'>('idle')
  const [error, setError] = useState(''), [errorCode, setErrorCode] = useState('')
  const prepared = useRef(new WeakMap<File, Promise<Blob>>()), transcripts = useRef(new WeakMap<File, string>())
  const stopMeter = useRef<(() => void) | undefined>()
  const recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null)
  const operation = useRef<Operation | null>(null), limit = useRef<ReturnType<typeof setTimeout> | null>(null)
  const captureScope=useRef(options.scopeKey??(options.transcriptOnly?options.memberId:'legacy'))
  const mounted = useRef(true), generation = useRef(0), locked = useRef(false), keep = useRef(true), stopRequested = useRef(false)
  const releaseFinalization = useRef<(() => void) | undefined>()
  const current = (turn: number) => mounted.current && generation.current === turn&&captureScope.current===(latest.current.scopeKey??(latest.current.transcriptOnly?latest.current.memberId:'legacy'))
  const release = () => { releaseFinalization.current?.(); releaseFinalization.current = undefined }
  const clean = () => {
    endLive()
    stopMeter.current?.(); stopMeter.current = undefined
    if(mounted.current)setAudioLevel(0)
    stream.current?.getTracks().forEach(t => t.stop()); stream.current = null
    if (limit.current) clearTimeout(limit.current)
    limit.current = null
  }
  const finish = (op: Operation) => {
    clearTimeout(op.timer)
    if (operation.current === op) operation.current = null
  }
  // Adoption, interruption and cancellation all invalidate every late stage,
  // including MediaRecorder.onstop and non-cancellable decode promises.
  const invalidate=(retained?:VoiceDraft)=>{
    generation.current++;keep.current=false;stopRequested.current=true;adopted.current=false
    const op=operation.current
    if(op){op.controller.abort();finish(op)}
    const activeRecorder=recorder.current;recorder.current=null
    try{if(activeRecorder?.state==='recording')activeRecorder.stop()}catch{}
    clean();release();locked.current=false
    liveTextRef.current=retained?.text??''
    if(mounted.current){setState('idle');setLiveText(retained?.text??'');setAudioLevel(0)}
    publishDraft(retained)
  }
  const interrupt=(message:string)=>{
    const value=draftRef.current
    invalidate(value?{...value,phase:value.text.trim()?'partial':'interrupted'}:undefined)
    if(mounted.current){setLiveUnavailable(true);setError(message)}
  }
  // The caller adopts this exact visible text into its own editable/committed
  // turn under the same ID. No audio or second ASR request is required.
  const adoptPartial=()=>{
    const value=draftRef.current
    if(captureScope.current!==(latest.current.scopeKey??(latest.current.transcriptOnly?latest.current.memberId:'legacy'))||adopted.current||!value?.text.trim())return undefined
    const snapshot={...value,phase:'partial' as const}
    invalidate();if(mounted.current){setError('');setErrorCode('')}
    return snapshot
  }
  const begin = (turn: number) => {
    const existing = operation.current
    if (existing?.turn === turn) return existing
    const controller = new AbortController()
    const op: Operation = { turn, controller, timer: setTimeout(() => {
      controller.abort()
      if (!current(turn)) return
      // Invalidate every late stage, including recorder finalization, file reads,
      // decoding and session recovery, even when it ignores cancellation.
      if(latest.current.transcriptOnly){interrupt(draftRef.current?.text.trim()?'转写未完成，已识别的部分文字仍在，可以编辑或核对。':'这段没有转成文字，可以重新说一次，或改用文字。');setErrorCode('ASR_TIMEOUT');return}
      generation.current++; locked.current = false; recorder.current = null
      clean(); release(); finish(op)
      setState('idle'); setErrorCode('ASR_TIMEOUT'); setError(audioErrorMessage({ code: 'ASR_TIMEOUT' }))
    }, latest.current.timeoutMs ?? 60000) }
    operation.current = op
    return op
  }
  const prepare = (file: File) => {
    let value = prepared.current.get(file)
    if (!value) {
      value = (latest.current.prepareAudio ?? recordingToWav)(file)
      prepared.current.set(file, value)
      void value.catch(() => prepared.current.delete(file))
    }
    return value
  }
  const transcribe = async (file: File) => {
    if (locked.current) return
    locked.current = true
    const turn = generation.current, config = latest.current, sessionId=draftRef.current?.id, op = begin(turn), signal = op.controller.signal
    const timing=startAITiming('audio-transcription',config.token)
    let delivering=false
    if (current(turn)) { setState('transcribing'); setPhase('preparing'); setError(''); setErrorCode('') }
    try {
      let transcript = config.transcriptOnly?undefined:config.pendingTranscript ?? transcripts.current.get(file)
      if (!transcript) {
        const audio = await abortable(prepare(file), signal)
        if (!current(turn)) return
        const dataUrl = await abortable(fileDataUrl(audio), signal)
        if (!current(turn)) return
        setPhase('recognizing')
        const extension = ({ 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3' } as Record<string, string>)[audio.type] ?? 'wav'
        const result = await abortable(apiRequest<{ transcript: string }>('/api/ai/audio/transcriptions', {
          method: 'POST', token: latest.current.token, signal, headers:{'X-Hoooho-Trace-Id':timing.traceId},
          body: { memberId: config.memberId, mimeType: audio.type, dataUrl, name: `recording.${extension}` },
        }), signal)
        if (!current(turn)) return
        if (typeof result.transcript !== 'string' || !result.transcript.trim()) throw new AudioRequestError('ASR_NO_SPEECH', 422)
        transcript = result.transcript; transcripts.current.set(file, transcript)
      }
      timing.finish('ready')
      if (current(turn)) {
        delivering=true;adopted.current=true
        setPhase('delivering');updateDraft({text:transcript,phase:'finalizing'})
        await abortable(latest.current.onTranscript(transcript, file, sessionId, draftRef.current?.at), signal)
        if(current(turn)&&draftRef.current?.id===sessionId)publishDraft(undefined)
      }
    } catch (e) {
      if (current(turn)) {
        setErrorCode(e && typeof e === 'object' && 'code' in e ? String(e.code) : '')
        if(config.transcriptOnly){
          adopted.current=false
          if(delivering)setErrorCode('VOICE_DELIVERY_FAILED')
          updateDraft({phase:draftRef.current?.text.trim()?'partial':'interrupted'})
          setError(delivering?'这段文字已形成，提交未完成；可以编辑或再次提交。':draftRef.current?.text.trim()?'转写未完成，已识别的部分文字仍在，可以编辑或核对。':'这段没有转成文字，可以重新说一次，或改用文字。')
        }else setError(audioErrorMessage(signal.aborted ? { code: 'ASR_TIMEOUT' } : e))
      }
    } finally {
      timing.finish(signal.aborted||!current(turn)?'cancelled':'failed')
      finish(op)
      if(config.transcriptOnly){prepared.current.delete(file);transcripts.current.delete(file)}
      if (current(turn)) { locked.current = false; setState('idle') }
    }
  }
  const stop = () => {
    if(recorder.current?.state==='recording')updateDraft({phase:'finalizing'})
    endLive()
    stopRequested.current = true
    if (mounted.current && latest.current.timeoutMs && latest.current.autoTranscribe !== false && (recorder.current?.state === 'recording' || (locked.current && !recorder.current))) begin(generation.current)
    if (recorder.current?.state === 'recording') {
      releaseFinalization.current ??= latest.current.onFinalizationStart?.()
      if (latest.current.timeoutMs && latest.current.autoTranscribe !== false) begin(generation.current)
      try { recorder.current.stop() } catch { release(); clean() }
    }
  }
  const discard = () => {
    if(latest.current.transcriptOnly){invalidate();if(mounted.current){setError('');setErrorCode('')};return}
    keep.current = false; stop()
    const op = operation.current
    if (op) { generation.current++; op.controller.abort(); finish(op); locked.current = false; recorder.current = null; clean(); release(); if (mounted.current) setState('idle') }
  }
  const start = async () => {
    if (locked.current || recorder.current || (latest.current.autoTranscribe !== false && latest.current.pendingVoice)) return
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) { setError('当前浏览器不支持录音，请输入文字'); return }
    const turn = ++generation.current
    captureScope.current=latest.current.scopeKey??(latest.current.transcriptOnly?latest.current.memberId:'legacy')
    locked.current = true; keep.current = true; stopRequested.current = false
    setState('requesting'); setError(''); setErrorCode('');setLiveText('');liveTextRef.current='';setLiveUnavailable(false)
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!current(turn) || stopRequested.current) {
        media.getTracks().forEach(t => t.stop())
        if (current(turn)) { locked.current = false; release(); if (operation.current) finish(operation.current); setState('idle') }
        return
      }
      stream.current = media; stopMeter.current = observeAudioLevel(media, setAudioLevel)
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(m => MediaRecorder.isTypeSupported(m))
      const r = new MediaRecorder(media, { ...(mime ? { mimeType: mime } : {}), ...(latest.current.audioBitsPerSecond ? { audioBitsPerSecond: latest.current.audioBitsPerSecond } : {}) })
      const chunks: Blob[] = [], started = Date.now(), config = latest.current
      recorder.current = r
      r.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
      r.onerror = () => {
        if(!current(turn))return
        if(config.transcriptOnly){interrupt('转写已中断，请核对已识别的文字，或重新说一次。');return}
        stop();setError('录音中断，已收音的内容会保留，可重试')
      }
      r.onstop = () => { void (async () => {
        if (!current(turn) && (config.ephemeral||config.transcriptOnly)) { chunks.length = 0; return }
        clean(); recorder.current = null; locked.current = false; if (current(turn)) setState(config.transcriptOnly?'transcribing':'idle')
        if (!keep.current) { release(); if (operation.current) finish(operation.current); return }
        const blob = new Blob(chunks, { type: r.mimeType }); chunks.length = 0
        if (blob.size < 300 || Date.now() - started < 500) {
          release(); if (operation.current) finish(operation.current)
          if(current(turn)){
            setState('idle')
            if(config.transcriptOnly){updateDraft({phase:draftRef.current?.text.trim()?'partial':'interrupted'});setError(draftRef.current?.text.trim()?'这段转写未完成，可以核对已识别文字，或重新说。':'这段没有转成文字，可以重新说一次，或改用文字。')}
            else setError('录音太短，请重新录音')
          }
          return
        }
        const file = new File([blob], `语音原件-${started}.${r.mimeType.includes('mp4') ? 'm4a' : 'webm'}`, { type: r.mimeType })
        try {
          if(!config.transcriptOnly){
            const saved = config.onRecorded(file,liveTextRef.current), op = operation.current
            await (op ? abortable(saved, op.controller.signal) : saved)
          }
          if(!config.transcriptOnly)release()
          if (!current(turn)) return
          // Ephemeral capture never enters onRecorded, IDB or asset upload.
          // The actual File exists only for this direct transcription request.
          if (config.transcriptOnly||config.autoTranscribe !== false) await transcribe(file)
          release()
        } catch {
          release()
          if (current(turn)) { if (operation.current) finish(operation.current);setState('idle');if(config.transcriptOnly){updateDraft({phase:draftRef.current?.text.trim()?'partial':'interrupted'});setError('这段文字处理尚未完成，可以核对已有文字，或重新说一次。')}else setError('录音草稿保存失败，请保持页面打开并重试') }
        }
      })() }
      r.start(250); locked.current = false; setState('listening')
      adopted.current=false
      if(config.transcriptOnly)for(const track of media.getTracks())track.addEventListener?.('ended',()=>{
        if(current(turn)&&!stopRequested.current)interrupt('转写已中断，请核对已识别的文字，或重新说一次。')
      },{once:true})
      if(config.transcriptOnly)publishDraft({id:`voice:${crypto.randomUUID()}`,text:'',at:Date.now(),phase:'listening'})
      if(config.livePreview)liveStop.current=startLiveAudioPreview({stream:media,memberId:config.memberId,token:config.token,onText:text=>{if(current(turn)&&!stopRequested.current){liveTextRef.current=text;setLiveText(text);updateDraft({text})}},onUnavailable:disconnected=>{
        if(!current(turn)||stopRequested.current)return
        if(config.transcriptOnly&&disconnected)interrupt('转写已中断，请核对已识别的文字，或重新说一次。')
        else setLiveUnavailable(true)
      }});  limit.current = setTimeout(stop, 90000)
    } catch (e) {
      if (!current(turn)) return
      clean(); locked.current = false; release()
      if (operation.current?.turn === turn) finish(operation.current)
      setState('idle')
      setError(e instanceof DOMException && e.name === 'NotAllowedError' ? '麦克风未获授权，请允许麦克风或输入文字' : '麦克风暂不可用，请输入文字')
    }
  }
  useEffect(() => {
    mounted.current = true
    const hidden = () => {if(!document.hidden)return;if(latest.current.transcriptOnly){if(!adopted.current)interrupt('转写已中断，请核对已识别的文字，或重新说一次。')}else stop()}
    document.addEventListener('visibilitychange', hidden)
    return () => {
      mounted.current = false; generation.current++
      stop(); if (operation.current) { operation.current.controller.abort(); finish(operation.current) }
      if (latest.current.ephemeral||latest.current.transcriptOnly) release()
      clean(); document.removeEventListener('visibilitychange', hidden)
    }
  }, [])
  const scope=options.scopeKey??(options.transcriptOnly?options.memberId:'legacy')
  const priorScope=useRef(scope)
  useEffect(()=>{
    if(priorScope.current===scope)return
    priorScope.current=scope;invalidate()
    if(mounted.current){setError('');setErrorCode('');setLiveUnavailable(false)}
  },[scope])
  return { draft:captureScope.current===scope?draft:undefined,adoptPartial,errorCode,liveText:captureScope.current===scope?liveText:'',liveUnavailable,audioLevel:captureScope.current===scope?audioLevel:0, state:captureScope.current===scope?state:'idle', phase, error, busy: captureScope.current===scope&&state !== 'idle', start, stop, discard,
    unreadable: ['AUDIO_DECODE_FAILED', 'FILE_READ_FAILED', 'ASR_AUDIO_FORMAT_UNSUPPORTED', 'INVALID_AUDIO_DATA', 'AUDIO_EMPTY'].includes(errorCode),
    clearError: () => { setError(''); setErrorCode('') }, retry: () => { if (!latest.current.transcriptOnly&&latest.current.pendingVoice) void transcribe(latest.current.pendingVoice) },
  }
}
