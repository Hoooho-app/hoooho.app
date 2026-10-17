import { useEffect, useMemo, useRef, useState, useTransition, type CSSProperties } from 'react'
import { Search, X } from 'lucide-react'
import { BottomSheetSurface, HohoButton, HoldToTalkButton, StatusNotice } from '../../components/design-system'
import { useJournal } from '../HealthEvents/useJournal'
import { JournalRecordDetail } from '../HealthEvents/JournalRecordDetail'
import { JournalSearchResults } from '../HealthEvents/JournalSearchResults'
import type { JournalEntry } from '../HealthEvents/timeViewModel'
import { getLocalDateKey } from '../../utils/localCalendarDate'
import { Navigate, useNavigate } from 'react-router-dom'
import { WebPageHeader } from '../../components/common'
import { useVisibleViewport } from '../../hooks/useVisibleViewport'
import '../HealthEvents/JournalSearchPage.css'
import './QuickSearchPage.css'
import { captureDraft } from '../../features/ai-business/captureDraft'
import { recordingToSearchWav } from '../../features/ai-business/recordingAudio'
import { useSmartRecordVoice } from '../../features/ai-business/useSmartRecordVoice'
import { useAppStore } from '../../store/useAppStore'
import { finderPlan, lookupRecords, orderLookupMatches } from './recordFinderModel'

export function QuickSearchPage() {
  const navigate = useNavigate()
  const accountId = useAppStore(s => s.authUser?.id ?? 'guest')
  const memberId = useAppStore(s => s.currentMemberId)
  const token = useAppStore(s => s.authToken)
  if (!memberId || !token) return <Navigate to="/nurse-station" replace />
  return <RecordFinder key={`${accountId}:${memberId}`} memberId={memberId} token={token} onClose={() => navigate('/nurse-station', { replace: true })} />
}

function RecordFinder({ memberId, token, onClose }: { memberId: string; token: string; onClose: () => void }) {
  const { sourceEntries, loading, error, retry } = useJournal(memberId, token, 0)
  const accountId = useAppStore(s => s.authUser?.id ?? 'guest')
  const draftKey = `lookup:${accountId}:${memberId}`
  const [text, setText] = useState(''), [question, setQuestion] = useState('')
  const viewport = useVisibleViewport()
  const [selected, setSelected] = useState<JournalEntry | null>(null)
  const [searchPending, startSearch] = useTransition()
  const [finalizing, setFinalizing] = useState(false)
  const [slow, setSlow] = useState(false)
  const [showLookupProgress, setShowLookupProgress] = useState(false)
  const input = useRef<HTMLInputElement>(null), content = useRef<HTMLDivElement>(null), scrollTop = useRef(0)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    // Quick lookup is a fresh session on every entry. Remove only its legacy
    // draft; storage availability must never delay typing or recording.
    void captureDraft(draftKey, null).catch(() => undefined)
    return () => { mounted.current = false }
  }, [draftKey])
  const search = (value: string) => startSearch(() => setQuestion(value.trim()))
  const changeText = (value: string) => { voice.clearError(); setText(value) }
  const voice = useSmartRecordVoice({ memberId, token, prepareAudio: recordingToSearchWav, timeoutMs: 25000,
    onFinalizationStart: () => { setFinalizing(true); return () => { if (mounted.current) setFinalizing(false) } },
    onRecorded: async () => {},
    onTranscript: async value => {
      if (mounted.current) { setText(value); search(value) }
    },
  })
  useEffect(() => {
    if (voice.busy || finalizing) return
    const timer = window.setTimeout(() => search(text), 120)
    return () => window.clearTimeout(timer)
  }, [text, voice.busy, finalizing])
  useEffect(() => {
    if (selected) return
    const frame = requestAnimationFrame(() => { const body = content.current; if (body) body.scrollTop = scrollTop.current })
    return () => cancelAnimationFrame(frame)
  }, [selected])

  const plan = useMemo(() => finderPlan(question), [question])
  const matches = useMemo(() => orderLookupMatches(lookupRecords(sourceEntries, question), plan.first ? 'earliest' : 'recent').sort((a, b) => Number(a.related) - Number(b.related)), [sourceEntries, question, plan])
  const working = finalizing || voice.busy || loading || searchPending || text.trim() !== question
  const immediateProgress = finalizing || voice.busy || loading
  const showProgress = working && (immediateProgress || showLookupProgress)
  useEffect(() => {
    setShowLookupProgress(false)
    if (!working || immediateProgress) return
    const timer = window.setTimeout(() => setShowLookupProgress(true), 180)
    return () => window.clearTimeout(timer)
  }, [working, immediateProgress])
  const progress = voice.state === 'requesting' ? '正在开启麦克风…' : voice.state === 'listening' ? '正在听你说…' : voice.state === 'transcribing' ? (voice.phase === 'delivering' ? '正在整理结果…' : '正在识别你说的话…') : finalizing ? '正在准备识别…' : loading ? '正在读取记录…' : '正在查找相关记录…'
  useEffect(() => {
    setSlow(false)
    if (!working) return
    const timer = window.setTimeout(() => setSlow(true), 8000)
    return () => window.clearTimeout(timer)
  }, [working])
  const evidence = new Map(matches.map(match => [match.entry.id, match.evidence]))
  const today = getLocalDateKey(new Date())!
  const openEntry = (entry: JournalEntry) => { scrollTop.current = content.current?.scrollTop ?? 0; voice.stop(); setSelected(entry) }

  return <main className="quick-search-page journal-search-page app-shell" style={{ '--quick-search-height': `${viewport.height}px`, '--quick-search-top': `${viewport.top}px` } as CSSProperties}>
    <WebPageHeader title="快速查找" onBack={() => { voice.discard(); onClose() }} />
    <form className="quick-search-header" role="search" onSubmit={e => { e.preventDefault(); search(text); input.current?.blur() }}>
      <label className="journal-search-field">
        <Search size={19} aria-hidden="true" />
        <input aria-label="查找记录文字" type="search" inputMode="search" enterKeyHint="search" autoComplete="off" placeholder="输入关键词，例如：睡觉、红疹" ref={input} value={text} onChange={e => changeText(e.target.value)} disabled={voice.busy || finalizing} />
        {text && <button aria-label="清除搜索" type="button" disabled={voice.busy || finalizing} onPointerDown={e => e.preventDefault()} onClick={() => { changeText(''); search(''); input.current?.focus() }}><X size={15} aria-hidden="true" /></button>}
      </label>
    </form>
    <div className="journal-search-body" ref={content} aria-busy={working}>
      {showProgress && <div className="quick-search-progress" role="status" aria-live="polite" aria-atomic="true">
        <div className="quick-search-progress__art" aria-hidden="true">
          <svg viewBox="0 0 96 80" fill="none"><g className="quick-search-progress__lines" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 24h42M22 36h32M22 48h42M22 60h25" /></g><g className="quick-search-progress__lens" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="46" cy="35" r="15"/><path d="m57 46 13 13"/></g></svg>
        </div>
        <span key={progress} className="quick-search-progress__label">{progress}</span>
        {slow && <span className="quick-search-progress__hint">{voice.busy || finalizing ? '识别比平时久，正在等待返回' : '记录较多，正在继续查找'}</span>}
      </div>}
      {!working && voice.error && <p role="alert">{voice.error.includes('麦克风') || voice.error.includes('不支持录音') ? voice.error : '没能识别这段语音，请重新按住说话'}</p>}
      {error && <StatusNotice tone="error" title="记录同步未完成">{error}。当前结果可能不完整。<HohoButton variant="text" onClick={retry}>重试加载</HohoButton></StatusNotice>}
      {!showProgress && !voice.busy && !finalizing && question && <section className="quick-search-settled" aria-label="查找结果" aria-live="polite">
        {!!matches.length && <JournalSearchResults layout="lookup" entries={matches.map(match => match.entry)} query={question} today={today} onOpen={openEntry} summaryFor={entry => evidence.get(entry.id) ?? entry.content} />}
        {!matches.length && !working && !voice.error && !loading && !error && <div className="journal-search-empty"><strong>没有找到相关记录</strong><span>换个关键词试试</span></div>}
      </section>}
    </div>
    <footer className="quick-search-footer">
      <HoldToTalkButton fullWidth className="quick-search-hold" disabled={finalizing} listening={voice.state === 'listening'} requesting={voice.state === 'requesting'} processing={voice.state === 'transcribing'} audioLevel={voice.audioLevel} onStart={() => { input.current?.blur(); void voice.start() }} onStop={voice.stop} onDiscard={voice.discard}/>

    </footer>
    {selected && (selected.id.startsWith('event:') ? <BottomSheetSurface open title="记录详情" label="记录详情" onClose={() => setSelected(null)}><p>{selected.content}</p><p className="hoho-text-caption">来源：已有事项标题，尚无单独的随记或原话。</p></BottomSheetSurface> : <JournalRecordDetail eventId={selected.eventId} recordId={selected.id} onChanged={retry} onClose={() => setSelected(null)} />)}
  </main>
}
