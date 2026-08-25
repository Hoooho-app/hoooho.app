import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, ChevronRight, ClipboardPlus, Mic, PencilLine, Pill, RotateCcw, Stethoscope, Thermometer } from 'lucide-react'
import { Avatar } from '../../../components/common'
import { HealthCard, HohoButton, Typography } from '../../../components/design-system'
import { createQuickRecordCandidates, type QuickRecordCandidate } from '../../../features/quick-record'
import { usePageScrollLock } from '../../../hooks/usePageScrollLock'
import type { HealthEventRecordType, HealthRecordOrganizationPreviewApiDto } from '../../../types'
import { localDateTimeValue } from '../../../utils/healthOccurredAt'

type FlowState = 'ready' | 'listening' | 'processing' | 'result'
interface RecognitionEvent { results: ArrayLike<{ 0: { transcript: string } }> }
interface Recognition { continuous: boolean; interimResults: boolean; lang: string; onend: null | (() => void); onerror: null | (() => void); onresult: null | ((event: RecognitionEvent) => void); start: () => void; stop: () => void }
type RecognitionConstructor = new () => Recognition

interface QuickVoiceRecordFlowProps {
  eventLabel: string
  member: { name: string; avatar?: string }
  onClose: () => void
  onConfirm: (records: Array<{ type: HealthEventRecordType; content: string; occurredAt: string }>) => Promise<void>
  onParse: (text: string, occurredAt: string) => Promise<HealthRecordOrganizationPreviewApiDto>
  onSwitchEvent: () => void
  open: boolean
}

const examples = ['晚上九点给她吃了五毫升美林', '刚刚量了 38.5 度', '下午开始咳嗽']
const recognitionConstructor = () => {
  const speechWindow = window as typeof window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor }
  return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition
}
const iconFor = (candidate: QuickRecordCandidate) => candidate.title === '体温' ? Thermometer : candidate.title === '用药' ? Pill : candidate.title === '就诊' ? Stethoscope : ClipboardPlus

export function QuickVoiceRecordFlow({ eventLabel, member, onClose, onConfirm, onParse, onSwitchEvent, open }: QuickVoiceRecordFlowProps) {
  const [state, setState] = useState<FlowState>('ready')
  const [transcript, setTranscriptState] = useState('')
  const [candidates, setCandidates] = useState<QuickRecordCandidate[]>([])
  const [error, setError] = useState('')
  const [editingText, setEditingText] = useState(false)
  const [editingTime, setEditingTime] = useState(false)
  const [saving, setSaving] = useState(false)
  const recognitionRef = useRef<Recognition | null>(null)
  const transcriptRef = useRef('')
  const finishRequestedRef = useRef(false)
  const speechSupported = useMemo(() => Boolean(recognitionConstructor()), [])
  usePageScrollLock(open)
  const setTranscript = (value: string) => { transcriptRef.current = value; setTranscriptState(value) }

  useEffect(() => {
    if (!open) return
    setState('ready'); setTranscript(''); setCandidates([]); setError(''); setEditingText(false); setEditingTime(false); setSaving(false)
    return () => recognitionRef.current?.stop()
  }, [open])

  if (!open) return null

  const parse = async (text: string) => {
    const value = text.trim()
    if (!value) { setError('没有识别到内容，可以再说一次或直接输入文字'); setState('ready'); return }
    setState('processing'); setError('')
    const fallbackOccurredAt = new Date().toISOString()
    try {
      const preview = await onParse(value, fallbackOccurredAt)
      setCandidates(createQuickRecordCandidates(preview, fallbackOccurredAt))
      setState('result')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '整理失败，请稍后重试')
      setState('ready')
    }
  }

  const beginListening = () => {
    const RecognitionApi = recognitionConstructor()
    if (!RecognitionApi) { setError('当前浏览器不支持语音识别，请在下方输入文字'); return }
    setError(''); setTranscript(''); setState('listening'); finishRequestedRef.current = false
    const recognition = new RecognitionApi()
    recognition.lang = 'zh-CN'; recognition.continuous = true; recognition.interimResults = true
    recognition.onresult = (event) => {
      let next = ''
      for (let index = 0; index < event.results.length; index += 1) next += event.results[index][0].transcript
      setTranscript(next)
    }
    recognition.onerror = () => { finishRequestedRef.current = false; setError('没有听清，可以再试一次或直接输入文字'); setState('ready') }
    recognition.onend = () => { recognitionRef.current = null; if (finishRequestedRef.current) void parse(transcriptRef.current) }
    recognitionRef.current = recognition
    recognition.start()
  }

  const finishListening = () => {
    if (state !== 'listening') return
    finishRequestedRef.current = true
    recognitionRef.current?.stop()
  }

  const confirm = async () => {
    if (!candidates.length) return
    setSaving(true); setError('')
    try {
      await onConfirm(candidates.map(({ type, content, occurredAt }) => ({ type, content, occurredAt })))
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '记录失败，请稍后重试')
      setSaving(false)
    }
  }

  return (
    <section aria-label="说一句快捷记录" aria-modal="true" className="quick-voice-flow" role="dialog">
      <header className="quick-voice-flow__header"><button aria-label="返回" className="grid h-11 w-11 place-items-center rounded-full" onClick={onClose} type="button"><ArrowLeft size={23} /></button><Typography variant="sectionTitle">说一句</Typography><span className="h-11 w-11" /></header>
      <div className="quick-voice-flow__context"><span className="inline-flex min-h-11 items-center gap-2 rounded-pill border bg-surface px-3 text-sm font-medium"><Avatar name={member.name} size="sm" src={member.avatar} />{member.name}</span><span className="inline-flex min-h-11 items-center gap-2 rounded-pill border bg-surface px-3 text-sm font-medium"><Thermometer className="text-primary" size={18} />{eventLabel}</span></div>
      <div className="quick-voice-flow__body">
        {state === 'result'
          ? <ResultContent candidates={candidates} editingText={editingText} editingTime={editingTime} eventLabel={eventLabel} memberName={member.name} onCandidatesChange={setCandidates} onEditText={() => setEditingText((current) => !current)} onEditTime={() => setEditingTime((current) => !current)} onReparse={() => void parse(transcript)} onSwitchEvent={onSwitchEvent} setTranscript={setTranscript} transcript={transcript} />
          : <VoiceInputContent error={error} onExample={(value) => { setTranscript(value); void parse(value) }} onPointerDown={beginListening} onPointerUp={finishListening} onTypedParse={() => void parse(transcript)} setTranscript={setTranscript} speechSupported={speechSupported} state={state} transcript={transcript} />}
      </div>
      {state === 'result' && <footer className="quick-voice-flow__footer"><HohoButton disabled={!candidates.length || saving} fullWidth onClick={() => void confirm()}><Check size={18} />{saving ? '正在记录…' : `确认记录${candidates.length ? `（${candidates.length}条）` : ''}`}</HohoButton>{error && <p className="text-center text-xs text-danger">{error}</p>}</footer>}
    </section>
  )
}

function VoiceInputContent({ error, onExample, onPointerDown, onPointerUp, onTypedParse, setTranscript, speechSupported, state, transcript }: { error: string; onExample: (value: string) => void; onPointerDown: () => void; onPointerUp: () => void; onTypedParse: () => void; setTranscript: (value: string) => void; speechSupported: boolean; state: FlowState; transcript: string }) {
  const listening = state === 'listening'
  return <div className="grid min-h-full content-between gap-6"><div className={`quick-voice-listener ${listening ? 'is-listening' : ''}`}><button aria-label={listening ? '松开完成' : '按住说话'} className="quick-voice-listener__button" disabled={state === 'processing'} onPointerCancel={onPointerUp} onPointerDown={onPointerDown} onPointerLeave={listening ? onPointerUp : undefined} onPointerUp={onPointerUp} type="button"><Mic size={38} /></button><Typography variant="sectionTitle">{state === 'processing' ? '正在整理…' : listening ? '正在听…' : '按住，说发生了什么'}</Typography><Typography variant="body">{listening ? '松开完成' : '松开后，Hoho 会自动整理成记录'}</Typography>{listening && <div aria-hidden="true" className="quick-voice-wave">{Array.from({ length: 17 }, (_, index) => <span key={index} />)}</div>}{(listening || !speechSupported) && <label className="mt-2 block w-full"><span className="hoho-text-label">{listening ? '实时识别' : '当前浏览器不支持语音识别，可输入文字体验'}</span><textarea className="hoho-textarea mt-2" onChange={(event) => setTranscript(event.target.value)} placeholder="说话时，识别文字会显示在这里" value={transcript} />{!speechSupported && <HohoButton className="mt-2" disabled={!transcript.trim()} fullWidth onClick={onTypedParse} variant="secondary">整理记录</HohoButton>}</label>}{error && <p className="text-sm text-danger">{error}</p>}</div>{!listening && state !== 'processing' && <section><Typography variant="label">试试这样说</Typography><div className="mt-2 grid gap-2">{examples.map((example) => <button className="hoho-surface-row rounded-card border bg-surface" key={example} onClick={() => onExample(example)} type="button"><span className="grid h-9 w-9 place-items-center rounded-full bg-primary-soft text-primary"><Mic size={17} /></span><span className="min-w-0 flex-1 text-left text-sm">{example}</span><ChevronRight className="text-text-weak" size={18} /></button>)}</div></section>}</div>
}

function ResultContent({ candidates, editingText, editingTime, eventLabel, memberName, onCandidatesChange, onEditText, onEditTime, onReparse, onSwitchEvent, setTranscript, transcript }: { candidates: QuickRecordCandidate[]; editingText: boolean; editingTime: boolean; eventLabel: string; memberName: string; onCandidatesChange: (value: QuickRecordCandidate[]) => void; onEditText: () => void; onEditTime: () => void; onReparse: () => void; onSwitchEvent: () => void; setTranscript: (value: string) => void; transcript: string }) {
  return <div className="grid gap-4"><div className="rounded-control border bg-surface px-3 py-3 text-sm"><span className="text-primary">识别内容：</span>{transcript}</div><Typography className="text-center text-primary" variant="label">识别到 {candidates.length} 条记录</Typography>{!candidates.length && <HealthCard className="text-center shadow-none"><Typography variant="body">暂未识别到可记录的健康事实。你可以修改原文后重新整理。</Typography></HealthCard>}{candidates.map((candidate, index) => { const Icon = iconFor(candidate); return <HealthCard className="shadow-none" key={candidate.id}><div className="flex items-center gap-2"><span className="grid h-10 w-10 place-items-center rounded-full bg-primary-soft text-primary"><Icon size={20} /></span><Typography variant="cardTitle">{candidate.title}</Typography></div><dl className="mt-3 divide-y">{candidate.fields.map((field, fieldIndex) => <div className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm" key={`${candidate.id}-${field.label}`}><dt className="text-text-secondary">{field.label}</dt><dd className="text-right font-medium">{editingTime && fieldIndex === 0 ? <input aria-label={`${candidate.title}发生时间`} className="hoho-input max-w-[190px]" max={localDateTimeValue()} onChange={(event) => { const next = [...candidates]; next[index] = { ...candidate, occurredAt: new Date(event.target.value).toISOString(), fields: candidate.fields.map((item, itemIndex) => itemIndex === 0 ? { ...item, value: event.target.value } : item) }; onCandidatesChange(next) }} type="datetime-local" value={localDateTimeValue(new Date(candidate.occurredAt))} /> : field.value}</dd></div>)}</dl></HealthCard> })}<button className="hoho-surface-row rounded-card border bg-surface" onClick={onSwitchEvent} type="button"><span className="grid h-9 w-9 place-items-center rounded-full bg-primary-soft text-primary"><RotateCcw size={17} /></span><span className="min-w-0 flex-1 text-left text-sm font-medium">记录到</span><span className="text-sm text-text-secondary">{memberName} · {eventLabel}</span><ChevronRight size={18} /></button>{editingText && <div><textarea className="hoho-textarea" onChange={(event) => setTranscript(event.target.value)} value={transcript} /><HohoButton className="mt-2" fullWidth onClick={onReparse} variant="secondary">重新整理</HohoButton></div>}<div className="grid grid-cols-3 gap-2"><HohoButton onClick={onEditTime} variant="text">时间不对</HohoButton><HohoButton onClick={onSwitchEvent} variant="text">换一个事件</HohoButton><HohoButton onClick={onEditText} variant="text"><PencilLine size={15} />修改</HohoButton></div></div>
}
