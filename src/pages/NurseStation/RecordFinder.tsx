import { useEffect, useMemo, useRef, useState } from 'react'
import { Keyboard, Mic, Search } from 'lucide-react'
import { BottomSheetSurface, HohoButton, HohoInput, StatusNotice } from '../../components/design-system'
import { useJournal } from '../HealthEvents/useJournal'
import { JournalRecordDetail } from '../HealthEvents/JournalRecordDetail'
import { JournalSearchResults } from '../HealthEvents/JournalSearchResults'
import type { JournalEntry } from '../HealthEvents/timeViewModel'
import { getLocalDateKey } from '../../utils/localCalendarDate'
import { NurseMessage } from '../../features/ai-nurse/NurseMessage'
import { captureDraft, type CaptureDraft } from '../../features/ai-business/captureDraft'
import { useSmartRecordVoice } from '../../features/ai-business/useSmartRecordVoice'
import { useAppStore } from '../../store/useAppStore'
import { finderPlan, lookupRecords, orderLookupMatches } from './recordFinderModel'

export function RecordFinder({ memberId, token, onClose }: { memberId: string; token: string; onClose: () => void }) {
  const { sourceEntries, loading, error, retry } = useJournal(memberId, token, 0)
  const accountId = useAppStore(s => s.authUser?.id ?? 'guest')
  const draftKey = `lookup:${accountId}:${memberId}`
  const [text, setText] = useState(''), [question, setQuestion] = useState('')
  const [keyboard, setKeyboard] = useState(false)
  const [selected, setSelected] = useState<JournalEntry | null>(null)
  const [pendingVoice, setPendingVoice] = useState<File>()
  const [ready, setReady] = useState(false), [draftError, setDraftError] = useState('')
  const input = useRef<HTMLInputElement>(null), content = useRef<HTMLDivElement>(null), scrollTop = useRef(0)
  const mounted = useRef(true), writes = useRef<Promise<unknown>>(Promise.resolve())
  const draft = useRef<CaptureDraft>({ text: '', files: [], occurredAt: '', timeUnknown: true, requestId: crypto.randomUUID() })

  const persist = async (patch: Partial<CaptureDraft>) => {
    draft.current = { ...draft.current, ...patch }
    const next = draft.current
    writes.current = writes.current.catch(() => undefined).then(() => captureDraft(draftKey, next))
    try { await writes.current; if (mounted.current) setDraftError('') }
    catch { if (mounted.current) setDraftError('本机查找草稿未保存，请保持页面打开后重试'); throw new Error('查找草稿保存未完成') }
  }
  useEffect(() => {
    mounted.current = true
    void captureDraft(draftKey).then(saved => {
      if (!mounted.current) return
      if (saved) { draft.current = saved; setText(saved.text); setQuestion(saved.text); setPendingVoice(saved.pendingVoice) }
      setReady(true)
    }).catch(() => { if (mounted.current) { setReady(true); setDraftError('查找草稿未恢复，仍可输入文字查找') } })
    return () => { mounted.current = false }
  }, [draftKey])
  const search = (value: string) => setQuestion(value.trim())
  const openKeyboard = () => { setKeyboard(true); requestAnimationFrame(() => input.current?.focus()) }
  const changeText = (value: string) => { setText(value); void persist({ text: value }).catch(() => undefined) }
  const voice = useSmartRecordVoice({ memberId, token, pendingVoice,
    onRecorded: async file => { if (mounted.current) setPendingVoice(file); await persist({ pendingVoice: file }) },
    onTranscript: async value => {
      await persist({ text: value, pendingVoice: undefined })
      if (mounted.current) { setText(value); setPendingVoice(undefined); search(value) }
    },
  })
  useEffect(() => {
    if (!ready || voice.busy) return
    const timer = window.setTimeout(() => search(text), 300)
    return () => window.clearTimeout(timer)
  }, [text, ready, voice.busy])
  useEffect(() => {
    if (selected) return
    const frame = requestAnimationFrame(() => { const body = content.current?.closest<HTMLElement>('.hoho-bottom-sheet__body'); if (body) body.scrollTop = scrollTop.current })
    return () => cancelAnimationFrame(frame)
  }, [selected])

  const matches = useMemo(() => orderLookupMatches(lookupRecords(sourceEntries, question), finderPlan(question).first ? 'earliest' : 'recent').sort((a, b) => Number(a.related) - Number(b.related)), [sourceEntries, question])
  const evidence = new Map(matches.map(match => [match.entry.id, match.evidence]))
  const today = getLocalDateKey(new Date())!
  const openEntry = (entry: JournalEntry) => { scrollTop.current = content.current?.closest<HTMLElement>('.hoho-bottom-sheet__body')?.scrollTop ?? 0; voice.stop(); setSelected(entry) }

  return <>
    <BottomSheetSurface open={!selected} viewportAware size="workspace" className="nurse-conversation-sheet record-finder-sheet" layerClassName="symptom-input-layer" leading={<Search size={23} aria-hidden="true" />} title="快速回看查找" label="查找记录" dismissText="收起" onClose={() => { voice.stop(); onClose() }} footer={
      <form className="record-finder-compose nurse-voice-compose" onSubmit={e => { e.preventDefault(); search(text); setKeyboard(false) }}>
        {keyboard && <HohoInput ref={input} label="查找记录文字" hideLabel placeholder="输入关键词，例如：睡觉、红疹" value={text} onChange={e => changeText(e.target.value)} disabled={!ready || voice.busy} enterKeyHint="search" />}
        <div className="record-finder-tools">
          <HohoButton aria-label={keyboard ? "收起文字输入" : "文字输入"} aria-expanded={keyboard} size="icon" variant="ghost" disabled={voice.busy} onClick={() => keyboard ? setKeyboard(false) : openKeyboard()}><Keyboard size={23} aria-hidden="true" /></HohoButton>
          <HohoButton className="nurse-voice-action record-finder-hold" type="button" variant="secondary" disabled={!ready || !!pendingVoice || voice.busy && voice.state !== 'listening' && voice.state !== 'requesting'}
            onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); setKeyboard(false); void voice.start() }} onPointerUp={voice.stop} onPointerCancel={voice.discard}
            onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); setKeyboard(false); void voice.start() } if (e.key === 'Escape') voice.discard() }} onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); voice.stop() } }}>
            <Mic size={23} aria-hidden="true" />{voice.state === 'listening' ? '正在听…' : voice.state === 'transcribing' ? '识别中…' : '按住说话'}
          </HohoButton>
          {keyboard && <HohoButton type="submit" disabled={!text.trim() || voice.busy}>查找</HohoButton>}
        </div>
      </form>
    }>
      <div className="record-finder-content" ref={content}>
        {!question && <NurseMessage role="assistant"><p>说说要找的记录。</p></NurseMessage>}
        {!question && <div className="record-finder-examples">{['红疹', '上周用药', '红疹那次有什么变化'].map(example => <HohoButton key={example} variant="text" disabled={!ready || voice.busy} onClick={() => { changeText(example); search(example) }}>{example}<Search size={16} aria-hidden="true" /></HohoButton>)}</div>}
        {voice.busy && <p role="status">{voice.state === 'requesting' ? '正在开启麦克风…' : voice.state === 'transcribing' ? '正在识别，完成后直接查找…' : '正在收音，松手查找'}</p>}
        {(voice.error || pendingVoice) && <StatusNotice tone={voice.error ? 'error' : 'info'} title={pendingVoice ? '录音已保留' : '语音未完成'}>{voice.error}{pendingVoice && <HohoButton variant="text" disabled={voice.busy} onClick={voice.retry}>重试识别</HohoButton>}<HohoButton variant="text" disabled={voice.busy} onClick={openKeyboard}>改用文字</HohoButton></StatusNotice>}
        {draftError && <p role="alert">{draftError}</p>}
        {loading && <p role="status">正在读取当前孩子的记录，查找文字已保留…</p>}
        {error && <StatusNotice tone="error" title="记录同步未完成">{error}。当前结果可能不完整。<HohoButton variant="text" onClick={retry}>重试加载</HohoButton></StatusNotice>}
        {question && <section aria-label="查找结果" aria-live="polite">
          {!!matches.length && <JournalSearchResults entries={matches.map(match => match.entry)} query={question} today={today} onOpen={openEntry} summaryFor={entry => evidence.get(entry.id) ?? entry.content} />}
          {!matches.length && !loading && <div className="journal-search-empty"><strong>没有找到相关记录</strong><span>换个关键词试试</span></div>}
        </section>}
      </div>
    </BottomSheetSurface>
    {selected && (selected.id.startsWith('event:') ? <BottomSheetSurface open title="记录详情" label="记录详情" onClose={() => setSelected(null)}><p>{selected.content}</p><p className="hoho-text-caption">来源：已有事项标题，尚无单独的随记或原话。</p></BottomSheetSurface> : <JournalRecordDetail eventId={selected.eventId} recordId={selected.id} onChanged={retry} onClose={() => setSelected(null)} />)}
  </>
}
