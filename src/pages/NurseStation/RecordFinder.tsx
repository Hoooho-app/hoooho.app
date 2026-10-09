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
import { finderPlan, lookupRecords, orderLookupMatches, type FinderMatch } from './recordFinderModel'

interface LookupScope { question: string; matches: FinderMatch[] }

export function RecordFinder({ memberId, token, onClose }: { memberId: string; token: string; onClose: () => void }) {
  const { sourceEntries, loading, error, retry } = useJournal(memberId, token, 0)
  const accountId = useAppStore(s => s.authUser?.id ?? 'guest')
  const draftKey = `lookup:${accountId}:${memberId}`
  const [text, setText] = useState(''), [question, setQuestion] = useState('')
  const [scope, setScope] = useState<LookupScope | null>(null)
  const [order, setOrder] = useState<'recent' | 'earliest'>('recent')
  const [selected, setSelected] = useState<JournalEntry | null>(null)
  const [pendingVoice, setPendingVoice] = useState<File>()
  const [ready, setReady] = useState(false), [draftError, setDraftError] = useState('')
  const [copied, setCopied] = useState(false), [copyError, setCopyError] = useState('')
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
  const search = (value: string) => { setQuestion(value.trim()); setCopied(false); setCopyError('') }
  const changeText = (value: string) => { setText(value); void persist({ text: value }).catch(() => undefined) }
  const voice = useSmartRecordVoice({ memberId, token, pendingVoice,
    onRecorded: async file => { if (mounted.current) setPendingVoice(file); await persist({ pendingVoice: file }) },
    onTranscript: async value => {
      if (value.length > 500) throw new Error('查找文字超过500字，录音保留，请缩短后重试')
      await persist({ text: value, pendingVoice: undefined })
      if (mounted.current) { setText(value); setPendingVoice(undefined); search(value) }
    },
  })
  useEffect(() => {
    if (!ready || voice.busy) return
    const timer = window.setTimeout(() => search(text), 300)
    return () => window.clearTimeout(timer)
  }, [text, ready, voice.busy])
  useEffect(() => { setOrder(finderPlan(question).first ? 'earliest' : 'recent') }, [question])
  useEffect(() => {
    if (selected) return
    const frame = requestAnimationFrame(() => { const body = content.current?.closest<HTMLElement>('.hoho-bottom-sheet__body'); if (body) body.scrollTop = scrollTop.current })
    return () => cancelAnimationFrame(frame)
  }, [selected])

  const scopedMatches = useMemo(() => new Map(scope?.matches.map(match => [match.entry.id, match]) ?? []), [scope])
  const scopedSources = useMemo(() => scope ? sourceEntries.filter(entry => scopedMatches.has(entry.id)) : sourceEntries, [sourceEntries, scope, scopedMatches])
  const matches = useMemo(() => {
    const found = question ? lookupRecords(scopedSources, question) : scope ? scopedSources.map(entry => ({ ...scopedMatches.get(entry.id)!, entry })) : []
    const retained = found.map(match => {
      const original = scopedMatches.get(match.entry.id)
      return original?.related ? { ...match, related: true, reason: original.reason } : match
    })
    return orderLookupMatches(retained, order)
  }, [scopedSources, question, scope, scopedMatches, order])
  const direct = matches.filter(match => !match.related).map(match => match.entry)
  const related = matches.filter(match => match.related).map(match => match.entry)
  const evidence = new Map(matches.map(match => [match.entry.id, match.evidence]))
  const today = getLocalDateKey(new Date())!
  const openEntry = (entry: JournalEntry) => { scrollTop.current = content.current?.closest<HTMLElement>('.hoho-bottom-sheet__body')?.scrollTop ?? 0; voice.stop(); setSelected(entry) }
  const refine = () => { setScope({ question: [scope?.question, question].filter(Boolean).join('；'), matches }); setQuestion(''); changeText(''); input.current?.focus() }
  const resetScope = () => { setScope(null); setQuestion(''); changeText(''); input.current?.focus() }
  async function copy() {
    try { await navigator.clipboard.writeText([scope?.question, question, ...matches.map(match => `${match.related ? '可能相关：' : ''}${match.entry.timePrecision === 'unknown' ? '时间未明确' : new Date(match.entry.occurredAt).toLocaleString('zh-CN')} ${match.evidence}`)].filter(Boolean).join('\n')); setCopied(true) }
    catch { setCopyError('复制未完成，请重试或打开详情复制原文') }
  }

  return <>
    <BottomSheetSurface open={!selected} viewportAware size="workspace" className="nurse-conversation-sheet record-finder-sheet" layerClassName="symptom-input-layer" leading={<Search size={23} aria-hidden="true" />} title="快速回看查找" label="查找记录" dismissText="收起" onClose={() => { voice.stop(); onClose() }} footer={
      <form className="record-finder-compose nurse-voice-compose" onSubmit={e => { e.preventDefault(); search(text) }}>
        {scope && <div className="record-finder-toolbar"><span>在当前 {scope.matches.length} 条结果中查找</span><HohoButton variant="text" onClick={resetScope}>重新查全部</HohoButton></div>}
        <HohoInput ref={input} label="想查什么" placeholder={scope ? '例如：只看脸颊' : '例如：红疹、上周用药'} value={text} maxLength={500} onChange={e => changeText(e.target.value)} disabled={!ready || voice.busy} enterKeyHint="search" />
        <div className="record-finder-tools">
          <HohoButton aria-label="键盘输入" size="icon" variant="ghost" onClick={() => input.current?.focus()}><Keyboard size={23} aria-hidden="true" /></HohoButton>
          <HohoButton className="nurse-voice-action record-finder-hold" type="button" variant="secondary" disabled={!ready || !!pendingVoice || voice.busy && voice.state !== 'listening' && voice.state !== 'requesting'}
            onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); void voice.start() }} onPointerUp={voice.stop} onPointerCancel={voice.discard}
            onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); void voice.start() } if (e.key === 'Escape') voice.discard() }} onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); voice.stop() } }}>
            <Mic size={23} aria-hidden="true" />{voice.state === 'listening' ? '正在听…' : voice.state === 'transcribing' ? '识别中…' : '按住说话'}
          </HohoButton>
          <HohoButton type="submit" disabled={!text.trim() || voice.busy}>查找</HohoButton>
        </div>
        <p className="nurse-input-status">说完直接展示记录 · 识别文字可修改</p>
      </form>
    }>
      <div className="record-finder-content" ref={content}>
        {!question && !scope && <NurseMessage role="assistant"><p>想找什么记录？可以输入名称，也可以说一句。</p></NurseMessage>}
        {!question && !scope && <div className="record-finder-examples">{['红疹', '上周用药', '红疹那次有什么变化'].map(example => <HohoButton key={example} variant="text" disabled={!ready || voice.busy} onClick={() => { changeText(example); search(example) }}>{example}<Search size={16} aria-hidden="true" /></HohoButton>)}</div>}
        {voice.busy && <p role="status">{voice.state === 'requesting' ? '正在开启麦克风…' : voice.state === 'transcribing' ? '正在识别，完成后直接查找…' : '正在收音，松手查找'}</p>}
        {(voice.error || pendingVoice) && <StatusNotice tone={voice.error ? 'error' : 'info'} title={pendingVoice ? '录音已保留' : '语音未完成'}>{voice.error}{pendingVoice && <HohoButton variant="text" disabled={voice.busy} onClick={voice.retry}>重试识别</HohoButton>}<HohoButton variant="text" disabled={voice.busy} onClick={() => input.current?.focus()}>改用文字</HohoButton></StatusNotice>}
        {draftError && <p role="alert">{draftError}</p>}
        {loading && <p role="status">正在读取当前孩子的记录，查找文字已保留…</p>}
        {error && <StatusNotice tone="error" title="记录同步未完成">{error}。当前结果可能不完整。<HohoButton variant="text" onClick={retry}>重试加载</HohoButton></StatusNotice>}
        {(question || scope) && <section aria-label="查找结果" aria-live="polite">
          <div className="record-finder-toolbar"><strong>找到 {matches.length} 条匹配记录{error ? '（可能不完整）' : ''}</strong><HohoButton variant="text" disabled={!matches.length || loading || !!error || voice.busy} onClick={refine}>在结果中继续查找</HohoButton></div>
          {scope && <p className="hoho-text-caption">当前范围：{scope.question}</p>}
          <div className="record-finder-sort"><HohoButton variant={order === 'recent' ? 'secondary' : 'ghost'} aria-pressed={order === 'recent'} onClick={() => setOrder('recent')}>最近在前</HohoButton><HohoButton variant={order === 'earliest' ? 'secondary' : 'ghost'} aria-pressed={order === 'earliest'} onClick={() => setOrder('earliest')}>最早在前</HohoButton><HohoButton variant="text" disabled={!matches.length} onClick={() => void copy()}>{copied ? '已复制' : '复制结果'}</HohoButton></div>
          {copyError && <p role="alert">{copyError}</p>}
          {!!direct.length && <JournalSearchResults entries={direct} query={question} today={today} onOpen={openEntry} summaryFor={entry => evidence.get(entry.id) ?? entry.content} />}
          {!!related.length && <><h3 className="record-finder-related-heading">可能相关 / 时间未明确 · 请核对原文</h3><JournalSearchResults entries={related} query={question} today={today} onOpen={openEntry} summaryFor={entry => evidence.get(entry.id) ?? entry.content} /></>}
          {!matches.length && !loading && <div className="journal-search-empty"><strong>{scope ? '当前结果中没有找到' : '没有找到相关随记'}</strong><span>{scope ? '修改文字，或重新查全部' : '换个名称或去掉时间限制试试'}</span></div>}
          <p className="record-finder-caption">仅回看已有记录 · 最早记录不等于首次发生</p>
        </section>}
      </div>
    </BottomSheetSurface>
    {selected && (selected.id.startsWith('event:') ? <BottomSheetSurface open title="记录详情" label="记录详情" onClose={() => setSelected(null)}><p>{selected.content}</p><p className="hoho-text-caption">来源：已有事项标题，尚无单独的随记或原话。</p></BottomSheetSurface> : <JournalRecordDetail eventId={selected.eventId} recordId={selected.id} onChanged={retry} onClose={() => setSelected(null)} />)}
  </>
}
