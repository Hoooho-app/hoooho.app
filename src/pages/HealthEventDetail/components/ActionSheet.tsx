import { ArrowLeft, Bell, Check, ChevronRight, ClipboardList, Copy, FileImage, FileText, HelpCircle, Keyboard, Link, ListChecks, Mic, PencilLine, Send, Share2, UserRound, UsersRound, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BottomSheetSurface, HealthCard, HohoButton, HohoToggle, Typography } from '../../../components/design-system'
import { buildHealthEventPrompt, downloadPromptLongImage, getPromptInformationOptions, type HealthEventPromptContext, type HealthEventPromptSection } from '../../../features/ask-ai'
import { actionCategoryLabels, actionCategoryOrder, type ActionCategory } from './actionSheetPresentation'

type Recorder = 'self' | 'family'

interface ActionFeature {
  actionLabel: string
  description: string
  id: string
  preview: string[]
  title: string
  icon: LucideIcon
  splitActions?: string[]
}

const categoryContent: Record<Exclude<ActionCategory, 'observation' | 'consultation' | 'online-consultation'>, { description: string; label: string; features: ActionFeature[] }> = {
  hospital: {
    label: '去医院',
    description: '为线下就医整理当前健康事件信息，方便挂号、候诊和现场沟通。',
    features: [
      { id: 'registration', title: '挂号前整理', description: '整理症状、既往情况、用药等基础信息。', actionLabel: '生成挂号信息', icon: ClipboardList, preview: ['主要症状与持续时间', '既往情况与当前用药', '需要补充的信息'] },
      { id: 'medical-summary', title: '生成就医摘要', description: '生成就医时间线和关键健康信息摘要。', actionLabel: '生成就医摘要', icon: FileText, preview: ['主要症状', '时间线', '体温与用药', '检查与状态变化'] },
      { id: 'doctor-questions', title: '整理想问医生的问题', description: '根据当前记录整理重点疑问和问题清单。', actionLabel: '生成问题清单', icon: HelpCircle, preview: ['症状持续多久', '哪些变化需要重点说明', '是否还需补充信息'] },
      { id: 'medical-list', title: '检查 / 用药清单', description: '整理当前事件中已经记录的检查和用药情况。', actionLabel: '生成清单', icon: ListChecks, preview: ['检查记录', '用药名称与时间', '待确认内容'] }
    ]
  },
  help: {
    label: '求助',
    description: '快速整理关键信息，方便向家人、朋友或其他人求助。',
    features: [
      { id: 'help-summary', title: '生成求助摘要', description: '整理当前健康事件的关键情况。', actionLabel: '生成求助摘要', icon: FileText, preview: ['发生了什么', '当前状态', '需要什么帮助'] },
      { id: 'help-poster', title: '生成求助海报', description: '将关键信息整理成便于转发的图文形式。', actionLabel: '生成求助海报', icon: Send, preview: ['关键信息卡片', '适合分享的图文布局'] },
      { id: 'key-information', title: '整理关键信息', description: '提炼当前事件中最重要的信息。', actionLabel: '整理关键信息', icon: ListChecks, preview: ['重要时间', '主要症状', '当前处理'] },
      { id: 'share-contact', title: '分享给家人 / 朋友', description: '将整理后的内容发送给指定联系人。', actionLabel: '分享', icon: Share2, preview: ['选择联系人', '分享内容预览'] }
    ]
  }
}

interface ActionSheetProps {
  context: HealthEventPromptContext
  onClose: () => void
  onComingSoon: () => void
  onOnlineConsultation: () => void
  open: boolean
}

type AskAIState = 'select' | 'preview' | 'edit' | 'revised'

export function ActionSheet({ context, onClose, onComingSoon, onOnlineConsultation, open }: ActionSheetProps) {
  const options = useMemo(() => getPromptInformationOptions(context), [context])
  const [category, setCategory] = useState<ActionCategory>('consultation')
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null)
  const [recorder, setRecorder] = useState<Recorder>('self')
  const [askState, setAskState] = useState<AskAIState>('select')
  const [selectedSections, setSelectedSections] = useState<HealthEventPromptSection[]>(options.map(({ id }) => id))
  const [prompt, setPrompt] = useState('')
  const [instruction, setInstruction] = useState('')
  const [revisionInstructions, setRevisionInstructions] = useState<string[]>([])
  const [feedback, setFeedback] = useState('')
  const current = category === 'hospital' || category === 'help' ? categoryContent[category] : null
  const selectedFeature = current?.features.find((feature) => feature.id === selectedFeatureId) ?? null

  const selectCategory = (next: ActionCategory) => {
    if (next === 'online-consultation') { onOnlineConsultation(); return }
    setCategory(next)
    setSelectedFeatureId(null)
    if (next === 'consultation') setAskState(prompt ? 'preview' : 'select')
  }

  useEffect(() => {
    if (!open) return
    setCategory('consultation')
    setAskState('select')
    setSelectedSections(options.map(({ id }) => id))
    setPrompt('')
    setInstruction('')
    setRevisionInstructions([])
    setFeedback('')
  }, [open, options])

  const navigation = (
    <div className="health-action-tabs" role="tablist" aria-label="行动分类">
      {actionCategoryOrder.map((key) => (
        <button aria-selected={category === key} className="health-action-tab" data-selected={category === key} key={key} onClick={() => selectCategory(key)} role="tab" type="button">
          {actionCategoryLabels[key]}
        </button>
      ))}
    </div>
  )

  const generate = () => {
    if (!selectedSections.length) { setFeedback('至少选择一项信息'); return }
    try { setPrompt(buildHealthEventPrompt(context, selectedSections)); setRevisionInstructions([]); setAskState('preview'); setFeedback('') }
    catch { setFeedback('生成失败，请重试') }
  }
  const revise = () => {
    if (!instruction.trim()) { setFeedback('请先说出或输入修改要求'); return }
    try {
      const nextInstructions = [...revisionInstructions, instruction.trim()]
      setPrompt(buildHealthEventPrompt(context, selectedSections, nextInstructions.join('；')))
      setRevisionInstructions(nextInstructions)
      setAskState('revised')
      setFeedback('')
    }
    catch { setFeedback('重新整理失败，请重试') }
  }
  const copyPrompt = async () => {
    try { await navigator.clipboard.writeText(prompt); setFeedback('已复制') }
    catch { setFeedback('复制失败，请长按选择文字复制') }
  }
  const exportImage = () => {
    try { downloadPromptLongImage(prompt); setFeedback('长图已生成') }
    catch (reason) { setFeedback(reason instanceof Error ? reason.message : '长图生成失败') }
  }

  const footer = category === 'observation'
    ? <ObservationFooter onComingSoon={onComingSoon} recorder={recorder} />
    : category === 'consultation'
      ? askState === 'select'
        ? <HohoButton disabled={!selectedSections.length} fullWidth onClick={generate}>生成提示词</HohoButton>
        : askState === 'preview'
          ? <div className="grid gap-2"><HohoButton fullWidth onClick={() => void copyPrompt()}><Copy size={17} />复制提示词</HohoButton><div className="grid grid-cols-2 gap-2"><HohoButton onClick={exportImage} variant="secondary"><FileImage size={17} />生成长图</HohoButton><HohoButton onClick={() => { setAskState('edit'); setInstruction(''); setFeedback('') }} variant="secondary"><PencilLine size={17} />编辑</HohoButton></div></div>
          : askState === 'edit'
            ? <HohoButton disabled={!instruction.trim()} fullWidth onClick={revise}>确认编辑</HohoButton>
            : <div className="grid gap-2"><HohoButton fullWidth onClick={() => setAskState('preview')}><Check size={17} />确定</HohoButton><HohoButton fullWidth onClick={() => { setAskState('edit'); setInstruction('') }} variant="secondary">继续编辑</HohoButton></div>
      : selectedFeature && (
        <div className="grid gap-2">
          {(selectedFeature.splitActions ?? [selectedFeature.actionLabel]).map((label) => (
            <HohoButton fullWidth key={label} onClick={onComingSoon} variant={label === selectedFeature.actionLabel ? 'primary' : 'secondary'}>{label}</HohoButton>
          ))}
        </div>
      )

  return (
    <BottomSheetSurface className="health-action-sheet" footer={footer} label="下一步" navigation={navigation} onClose={onClose} open={open} size={category === 'consultation' && askState !== 'select' ? 'workspace' : 'default'} title="下一步">
      <div>
        {category === 'observation' ? (
          <ObservationContent onComingSoon={onComingSoon} recorder={recorder} setRecorder={setRecorder} />
        ) : category === 'consultation' ? (
          <AskAIContent feedback={feedback} instruction={instruction} onInstructionChange={setInstruction} options={options} prompt={prompt} selected={selectedSections} setSelected={setSelectedSections} state={askState} />
        ) : selectedFeature ? (
          <div>
            <button className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-primary" onClick={() => setSelectedFeatureId(null)} type="button">
              <ArrowLeft size={17} />返回
            </button>
            <Typography className="mt-2" variant="sectionTitle">{selectedFeature.title}</Typography>
            <Typography className="mt-2" variant="body">{selectedFeature.description}</Typography>
            <HealthCard className="mt-5 shadow-none">
              <Typography variant="label">内容预览</Typography>
              <ul className="mt-3 grid gap-3">
                {selectedFeature.preview.map((item) => <li className="flex items-center gap-2 text-sm text-text-secondary" key={item}><span className="h-1.5 w-1.5 rounded-full bg-primary" />{item}</li>)}
              </ul>
            </HealthCard>
          </div>
        ) : (
          <div>
            <Typography variant="body">{current?.description}</Typography>
            <div className="health-action-list mt-4 overflow-hidden rounded-card border bg-surface">
              {current?.features.map((feature) => {
                const Icon = feature.icon
                return (
                  <button className="hoho-surface-row" key={feature.id} onClick={() => setSelectedFeatureId(feature.id)} type="button">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"><Icon size={19} strokeWidth={1.8} /></span>
                    <span className="min-w-0 flex-1">
                      <strong className="block text-sm">{feature.title}</strong>
                      <span className="mt-1 block text-xs leading-5 text-text-secondary">{feature.description}</span>
                    </span>
                    <ChevronRight className="shrink-0 text-text-secondary" size={19} />
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </BottomSheetSurface>
  )
}

interface RecognitionEvent { results: ArrayLike<{ 0: { transcript: string } }> }
interface Recognition { continuous: boolean; interimResults: boolean; lang: string; onend: null | (() => void); onerror: null | (() => void); onresult: null | ((event: RecognitionEvent) => void); start: () => void; stop: () => void }
type RecognitionConstructor = new () => Recognition
const recognitionConstructor = () => {
  const speechWindow = window as typeof window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor }
  return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition
}

function AskAIContent({ feedback, instruction, onInstructionChange, options, prompt, selected, setSelected, state }: { feedback: string; instruction: string; onInstructionChange: (value: string) => void; options: ReturnType<typeof getPromptInformationOptions>; prompt: string; selected: HealthEventPromptSection[]; setSelected: (value: HealthEventPromptSection[]) => void; state: AskAIState }) {
  const [listening, setListening] = useState(false)
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const [voiceError, setVoiceError] = useState('')
  const recognitionRef = useRef<Recognition | null>(null)
  const toggle = (id: HealthEventPromptSection) => setSelected(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id])
  const toggleListening = () => {
    if (listening) { recognitionRef.current?.stop(); setListening(false); return }
    const Constructor = recognitionConstructor()
    if (!Constructor) { setVoiceError('当前浏览器不支持语音识别，请输入修改要求'); setKeyboardOpen(true); return }
    const recognition = new Constructor()
    recognition.lang = 'zh-CN'; recognition.continuous = true; recognition.interimResults = true
    recognition.onresult = (event) => { let next = ''; for (let index = 0; index < event.results.length; index += 1) next += event.results[index][0].transcript; onInstructionChange(next) }
    recognition.onerror = () => { setListening(false); setVoiceError('没有听清，请再试一次或输入文字'); setKeyboardOpen(true) }
    recognition.onend = () => setListening(false)
    recognitionRef.current = recognition; setVoiceError(''); recognition.start(); setListening(true)
  }

  useEffect(() => () => recognitionRef.current?.stop(), [])

  if (state === 'select') return <div className="grid gap-3"><Typography variant="sectionTitle">问 AI</Typography><Typography variant="body">选择要带给 AI 的信息</Typography><div className="ask-ai-options">{options.map((option) => <button aria-pressed={selected.includes(option.id)} className="ask-ai-option" data-selected={selected.includes(option.id)} key={option.id} onClick={() => toggle(option.id)} type="button"><span><strong>{option.label}</strong><small>{option.description}</small></span><span className="ask-ai-option__check"><Check size={15} /></span></button>)}</div>{feedback && <p aria-live="polite" className="text-sm text-danger">{feedback}</p>}</div>

  return <div className="grid gap-3">{state === 'preview' && <p className="ask-ai-status"><Check size={15} />提示词已生成</p>}{state === 'revised' && <p className="ask-ai-status"><Check size={15} />已根据你的修改重新整理</p>}<article className="ask-ai-prompt" aria-label="提示词预览">{prompt}</article>{state === 'edit' && <section className="ask-ai-editor"><Typography variant="label">说说怎么改</Typography><div className="mt-2 grid grid-cols-[1fr_auto] gap-2"><button aria-pressed={listening} className="ask-ai-mic" data-listening={listening} onClick={toggleListening} type="button"><Mic size={20} />{listening ? '正在听，再点完成' : '点击开始说'}</button><button aria-label="切换键盘输入" className="ask-ai-keyboard" onClick={() => setKeyboardOpen((current) => !current)} type="button"><Keyboard size={20} /></button></div>{voiceError && <p className="mt-2 text-xs text-danger">{voiceError}</p>}{(keyboardOpen || instruction) && <textarea autoFocus={keyboardOpen} className="hoho-textarea mt-2" onChange={(event) => onInstructionChange(event.target.value)} placeholder="例如：把最高体温改成 38.5℃" rows={3} value={instruction} />}</section>}{feedback && <p aria-live="polite" className={feedback === '已复制' || feedback === '长图已生成' ? 'text-sm text-success' : 'text-sm text-danger'}>{feedback}</p>}</div>
}

const focusOptions = ['血压', '头晕', '用药', '饮食作息', '睡眠', '照片']

function ObservationContent({ onComingSoon, recorder, setRecorder }: { onComingSoon: () => void; recorder: Recorder; setRecorder: (recorder: Recorder) => void }) {
  const [focuses, setFocuses] = useState(['头晕', '用药'])
  const [following, setFollowing] = useState(true)

  const toggleFocus = (focus: string) => setFocuses((current) => current.includes(focus)
    ? current.filter((item) => item !== focus)
    : [...current, focus])

  return (
    <div className="health-observation-content">
      <Typography variant="body">持续收集当前健康事件中值得关注的变化。</Typography>
      <section>
        <Typography variant="label">1. 谁来记录</Typography>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <RecorderChoice active={recorder === 'self'} description="由我继续补充这个健康事件的变化" icon={UserRound} label="自己记录" onClick={() => setRecorder('self')} />
          <RecorderChoice active={recorder === 'family'} description="邀请家人通过链接一起补充" icon={UsersRound} label="家人协作" onClick={() => setRecorder('family')} />
        </div>
      </section>

      {recorder === 'family' && (
        <section>
          <Typography variant="label">2. 协作链接</Typography>
          <HealthCard className="mt-2 shadow-none">
            <div className="flex items-center gap-2 text-sm font-medium"><Link className="text-primary" size={18} />hoho.app/care/8K2F...</div>
            <Typography className="mt-2" variant="caption">家人可通过链接补充本事件的相关情况，例如测量数据、症状变化、作息和图片。</Typography>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <HohoButton onClick={onComingSoon} variant="secondary"><Copy size={16} />复制链接</HohoButton>
              <HohoButton onClick={onComingSoon} variant="secondary"><Send size={16} />发送给家人</HohoButton>
            </div>
          </HealthCard>
        </section>
      )}

      <section>
        <Typography variant="label">{recorder === 'family' ? '3' : '2'}. 观察重点</Typography>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {focusOptions.map((focus) => (
            <button aria-pressed={focuses.includes(focus)} className="health-observation-chip" data-selected={focuses.includes(focus)} key={focus} onClick={() => toggleFocus(focus)} type="button">{focus}</button>
          ))}
          <button className="health-observation-chip" onClick={onComingSoon} type="button">+ 添加其他</button>
        </div>
      </section>

      <section className="flex items-center gap-2.5 rounded-card border bg-surface px-3 py-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"><Bell size={17} /></span>
        <span className="min-w-0 flex-1">
          <strong className="block text-sm">关注此事件</strong>
          <span className="mt-0.5 block text-xs leading-4 text-text-secondary">有新的协作记录或事件更新时提醒我</span>
        </span>
        <HohoToggle checked={following} label="关注此事件" onChange={setFollowing} />
      </section>
    </div>
  )
}

function ObservationFooter({ onComingSoon, recorder = 'self' }: { onComingSoon: () => void; recorder?: Recorder }) {
  return <HohoButton fullWidth onClick={onComingSoon}>{recorder === 'family' ? '开始协作观察' : '开始重点观察'}</HohoButton>
}

function RecorderChoice({ active, description, icon: Icon, label, onClick }: { active: boolean; description: string; icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button aria-pressed={active} className="health-recorder-choice" data-selected={active} onClick={onClick} type="button">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-primary-soft text-primary"><Icon size={18} /></span>
      <strong className="mt-1.5 block text-sm">{label}</strong>
      <span className="health-recorder-choice__description mt-0.5 block text-xs leading-4 text-text-secondary">{description}</span>
    </button>
  )
}
