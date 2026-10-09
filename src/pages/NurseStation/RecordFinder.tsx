import { useMemo, useRef, useState } from 'react'
import { Keyboard, Mic } from 'lucide-react'
import { BottomSheetSurface, HohoButton, HohoInput, StatusNotice } from '../../components/design-system'
import { useJournal } from '../HealthEvents/useJournal'
import { JournalRecordDetail } from '../HealthEvents/JournalRecordDetail'
import { useSmartRecordVoice } from '../../features/ai-business/useSmartRecordVoice'
import { finderAnswer, finderPlan, findRecords, type FinderPlan } from './recordFinderModel'

export function RecordFinder({ memberId, token, onClose }: { memberId: string; token: string; onClose: () => void }) {
  const { sourceEntries, loading, error, retry } = useJournal(memberId, token, 0)
  const [text, setText] = useState(''), [plan, setPlan] = useState<FinderPlan>(), [copied, setCopied] = useState(false), [copyError, setCopyError] = useState('')
  const [selected, setSelected] = useState<{ eventId: string; recordId: string } | null>(null)
  const [pendingVoice, setPendingVoice] = useState<File>()
  const input = useRef<HTMLInputElement>(null)
  const search = (value: string) => { if (!value.trim()) return; setPlan(previous => finderPlan(value, previous)); setCopied(false); setCopyError(''); setText('') }
  const voice = useSmartRecordVoice({ memberId, token, pendingVoice, onRecorded: async file => { setPendingVoice(file) }, onTranscript: async value => { setText(value); setPendingVoice(undefined); search(value) } })
  const matches = useMemo(() => plan ? findRecords(sourceEntries, plan) : [], [sourceEntries, plan])
  const answer = plan ? finderAnswer(matches, plan) : ''
  async function copy() { try { await navigator.clipboard.writeText(`${plan?.question}\n${answer}\n${matches.map(m => `${m.related ? '可能相关：' : ''}${m.entry.timePrecision === 'unknown' ? '时间未明确' : new Date(m.entry.occurredAt).toLocaleString('zh-CN')} ${m.evidence}`).join('\n')}`); setCopied(true) } catch { setCopyError('复制未完成，请重试或选择结果文字复制。') } }
  return <>
    <BottomSheetSurface open={!selected} viewportAware size="workspace" title="想查什么，问一问" label="查找记录" onClose={() => { voice.stop(); onClose() }} footer={<form className="record-finder-compose" onSubmit={e => { e.preventDefault(); search(text) }}><HohoInput ref={input} label="想查什么" placeholder={plan ? '继续补充，例如：只看屁股上的' : '直接问你想找的记录'} value={text} maxLength={500} onChange={e => setText(e.target.value)} disabled={voice.busy}/><div className="record-finder-tools"><HohoButton aria-label="键盘输入" size="icon" variant="text" onClick={() => input.current?.focus()}><Keyboard size={21}/></HohoButton><button className="case-hold-voice" type="button" disabled={!!pendingVoice || voice.state === 'transcribing'} onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); void voice.start() }} onPointerUp={voice.stop} onPointerCancel={voice.stop} onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); void voice.start() } }} onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); voice.stop() } }}><Mic size={18}/>{voice.state === 'listening' ? '正在听…' : voice.state === 'transcribing' ? '识别中…' : '按住说话'}</button><HohoButton type="submit" disabled={!text.trim() || voice.busy}>查找</HohoButton></div></form>}>
      <div className="record-finder-content">
        {!plan && <p>可以查饮食、睡眠、症状、用药或某次事项的变化。直接问一句就开始查找。</p>}
        {voice.busy && <p role="status">{voice.state === 'requesting' ? '正在开启麦克风…' : voice.state === 'transcribing' ? '正在识别，完成后直接查找…' : '正在收音，松手停止'}</p>}
        {(voice.error||pendingVoice)&& <StatusNotice tone="error" title="语音暂未完成">{voice.error}{pendingVoice && <><HohoButton variant="text" onClick={voice.retry}>重试识别</HohoButton><HohoButton variant="text" onClick={() => setPendingVoice(undefined)}>改用键盘</HohoButton></>}</StatusNotice>}
        {loading && <p role="status">正在读取当前孩子的记录，问题已保留…</p>}
        {error && <StatusNotice tone="error" title="记录同步未完成">{error}。当前结果可能不完整。<HohoButton variant="text" onClick={retry}>重试加载</HohoButton></StatusNotice>}
        {plan && !loading && <><strong>{plan.question}</strong><section className="record-finder-answer" aria-label="查找结果"><p>{answer}</p><div className="home-flow-actions"><HohoButton variant="secondary" onClick={() => void copy()}>{copied ? '已复制' : '复制结果'}</HohoButton>{matches[0] && !matches[0].entry.id.startsWith('event:') && <HohoButton variant="text" onClick={() => setSelected({ eventId: matches[0].entry.eventId, recordId: matches[0].entry.id })}>查看详情</HohoButton>}</div>{copyError && <p role="alert">{copyError}</p>}</section>
          {matches.map(m => <article className="record-finder-answer" key={m.entry.id}><strong>{m.related ? '可能相关 · 需核对原文' : '明确相关记录'}</strong><time>{m.entry.timePrecision === 'unknown' ? m.entry.timeLabel || '发生时间未明确' : new Date(m.entry.occurredAt).toLocaleString('zh-CN')}{m.entry.timePrecision !== 'exact' && m.entry.timePrecision !== 'unknown' ? '（约）' : ''}</time><p>{m.evidence}</p>{m.reason && <p>{m.reason}</p>}<small>来源：已有健康记录{m.entry.attachmentCount ? ` · ${m.entry.attachmentCount} 份原件` : ''}</small>{!m.entry.id.startsWith('event:') && <HohoButton variant="text" onClick={() => setSelected({ eventId: m.entry.eventId, recordId: m.entry.id })}>查看详情 / 原话与附件</HohoButton>}</article>)}
        </>}
      </div>
    </BottomSheetSurface>
    {selected && <JournalRecordDetail eventId={selected.eventId} recordId={selected.recordId} onChanged={retry} onClose={() => setSelected(null)} />}
  </>
}
