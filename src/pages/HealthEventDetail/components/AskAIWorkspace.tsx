import { Check, ChevronDown, ChevronUp, Copy, FileImage, RefreshCw, Settings2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { HealthCard, HohoButton, Typography } from '../../../components/design-system'
import {
  buildHealthEventPrompt,
  copyPromptText,
  downloadPromptLongImage,
  getAllPromptItemIds,
  getPromptInformationGroups,
  getPromptInformationSummary,
  type HealthEventPromptContext,
} from '../../../features/ask-ai'

const quickQuestions = ['是否需要就医', '应该挂什么科', '还缺哪些信息', '就诊前准备']

export function AskAIWorkspace({ context }: { context: HealthEventPromptContext }) {
  const groups = useMemo(() => getPromptInformationGroups(context), [context])
  const allItemIds = useMemo(() => getAllPromptItemIds(context), [context])
  const summary = useMemo(() => getPromptInformationSummary(context), [context])
  const contextKey = `${context.currentMemberId}:${context.event.id}`
  const [question, setQuestion] = useState('')
  const [selected, setSelected] = useState<string[]>(allItemIds)
  const [adjusting, setAdjusting] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [generated, setGenerated] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [copied, setCopied] = useState(false)
  const [copiedOnce, setCopiedOnce] = useState(false)
  const selectionTouchedRef = useRef(false)
  const copyTimerRef = useRef<number | null>(null)

  useEffect(() => {
    selectionTouchedRef.current = false
    setQuestion('')
    setSelected(allItemIds)
    setAdjusting(false)
    setPrompt('')
    setGenerated(false)
    setFeedback('')
    setCopied(false)
    setCopiedOnce(false)
  }, [contextKey])

  useEffect(() => {
    if (!selectionTouchedRef.current) setSelected(allItemIds)
  }, [allItemIds.join('|')])

  useEffect(() => () => {
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
  }, [])

  const selectedSet = useMemo(() => new Set(selected), [selected])
  const appendQuestion = (value: string) => setQuestion((current) => current.trim() ? `${current.trim()}；${value}` : value)
  const updateSelection = (next: string[]) => {
    selectionTouchedRef.current = true
    setSelected(next)
    setFeedback('')
  }
  const toggleItem = (id: string) => updateSelection(selectedSet.has(id) ? selected.filter((item) => item !== id) : [...selected, id])
  const toggleGroup = (ids: string[]) => {
    const allSelected = ids.every((id) => selectedSet.has(id))
    updateSelection(allSelected ? selected.filter((id) => !ids.includes(id)) : [...new Set([...selected, ...ids])])
  }
  const generate = () => {
    try {
      const nextPrompt = buildHealthEventPrompt(context, selected, question)
      setPrompt(nextPrompt)
      setGenerated(true)
      setAdjusting(false)
      setFeedback('')
      setCopied(false)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : '生成失败，请重试')
    }
  }
  const copy = async () => {
    const result = await copyPromptText(prompt)
    if (!result.ok) {
      setCopied(false)
      setFeedback(result.message)
      return
    }
    setCopied(true)
    setCopiedOnce(true)
    setFeedback('已复制，可以粘贴到任意 AI')
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
    copyTimerRef.current = window.setTimeout(() => {
      setCopied(false)
      setFeedback('')
    }, 2000)
  }
  const exportImage = () => {
    try {
      downloadPromptLongImage(prompt)
      setFeedback('长图已生成')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : '长图生成失败')
    }
  }

  return (
    <div className="ask-ai-workspace" data-generated={generated}>
      <header className="ask-ai-intro">
        <Typography variant="sectionTitle">问 AI</Typography>
        <Typography variant="body">整理完整健康信息，生成一份可复制给任意 AI 的提问</Typography>
      </header>

      {!generated && (
        <section className="ask-ai-question" aria-labelledby="ask-ai-question-title">
          <label className="hoho-text-label" htmlFor="ask-ai-question" id="ask-ai-question-title">这次你主要想问什么？</label>
          <textarea
            className="hoho-textarea ask-ai-question__input"
            id="ask-ai-question"
            onChange={(event) => { setQuestion(event.target.value); setFeedback('') }}
            placeholder="例如：反复发热两天，是否需要尽快就医？"
            rows={4}
            value={question}
          />
          <div className="ask-ai-quick-questions" aria-label="快捷问题">
            {quickQuestions.map((item) => <button key={item} onClick={() => appendQuestion(item)} type="button">{item}</button>)}
          </div>
        </section>
      )}

      <HealthCard className="ask-ai-summary-card shadow-none">
        <div className="ask-ai-summary-card__heading">
          <span className="ask-ai-summary-card__icon"><Check size={17} /></span>
          <span><strong>已准备完整健康信息</strong><small>共 {summary.totalCount} 项 · 仅包含「{context.member.name}」的信息</small></span>
        </div>
        <dl className="ask-ai-summary-counts">
          {groups.filter((group) => group.items.length > 0).map((group) => <div key={group.id}><dt>{group.label}</dt><dd>{group.items.length} {group.id === 'history' || group.id === 'attachments' ? '个' : group.id === 'profile' ? '项' : '条'}</dd></div>)}
        </dl>
        <button className="ask-ai-adjust-trigger" onClick={() => setAdjusting((current) => !current)} type="button">
          <Settings2 size={17} />查看和调整{adjusting ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
        </button>
      </HealthCard>

      {adjusting && (
        <section className="ask-ai-adjust-panel" aria-label="查看和调整信息">
          {groups.filter((group) => group.items.length > 0).map((group) => {
            const ids = group.items.map(({ id }) => id)
            const checked = ids.every((id) => selectedSet.has(id))
            return <div className="ask-ai-adjust-group" key={group.id}>
              <button aria-pressed={checked} className="ask-ai-adjust-group__toggle" data-selected={checked} onClick={() => toggleGroup(ids)} type="button">
                <span><strong>{group.label}</strong><small>{group.description}</small></span><span className="ask-ai-option__check"><Check size={15} /></span>
              </button>
              <div className="ask-ai-adjust-items">
                {group.items.map((item) => <button aria-pressed={selectedSet.has(item.id)} data-selected={selectedSet.has(item.id)} key={item.id} onClick={() => toggleItem(item.id)} type="button"><span><strong>{item.label}</strong><small>{item.detail}</small></span><span className="ask-ai-option__check"><Check size={14} /></span></button>)}
              </div>
            </div>
          })}
        </section>
      )}

      {summary.attachmentCount > 0 && <p className="ask-ai-attachment-reminder">还有 {summary.attachmentCount} 个附件需要在外部 AI 中手动上传</p>}

      {generated && (
        <section className="ask-ai-preview" aria-labelledby="ask-ai-preview-title">
          <div className="ask-ai-preview__heading"><span><strong id="ask-ai-preview-title">完整提示词</strong><small>共 {summary.totalCount} 项 · 当前对象：{context.member.name} · 同时保留整理结果和用户原话</small></span></div>
          <pre aria-label="提示词完整预览" tabIndex={0}>{prompt}</pre>
          <div className="ask-ai-secondary-actions">
            <button onClick={() => setGenerated(false)} type="button">修改问题</button>
            <button onClick={() => setAdjusting(true)} type="button">查看和调整信息</button>
            <button onClick={generate} type="button"><RefreshCw size={15} />重新生成</button>
          </div>
        </section>
      )}

      {feedback && <p aria-live="polite" className="ask-ai-feedback" data-success={copied || feedback === '长图已生成'} role="status">{feedback}</p>}

      <div className="ask-ai-actions">
        {generated ? <>
          <HohoButton fullWidth onClick={() => void copy()}><Copy size={17} />{copied ? '✓ 已复制' : copiedOnce ? '再次复制' : '复制提示词'}</HohoButton>
          <HohoButton fullWidth onClick={exportImage} variant="secondary"><FileImage size={17} />生成长图</HohoButton>
        </> : <HohoButton disabled={!question.trim() || !selected.length} fullWidth onClick={generate}>生成完整提问</HohoButton>}
      </div>
    </div>
  )
}
