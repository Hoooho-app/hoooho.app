import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { HohoButton, HohoSpotlightGuide } from '../../components/design-system'
import { useAppStore } from '../../store/useAppStore'
import { HELP_LESSON_LABELS, helpLessonFromSearch, readHelpGuideState, writeHelpGuideState, type HelpLesson } from './guidedRecord'
import './guidedRecord.css'

interface RecordStep { title: string; description: string; targets: string[]; check?: () => boolean; label?: string }
const target = (name: string) => `[data-help-target="${name}"]`
const hasText = (selector: string) => Boolean(document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)?.value.trim())
const time: RecordStep = { title: '核对这件事发生的时间', description: '可以补记过去发生的事。按实际情况调整日期与时间，不必用现在的时间。', targets: [target('occurrence-time')], label: '时间已核对' }
const save: RecordStep = { title: '点击右上角，保存这条记录', description: '这里点的是表单原来的保存按钮。保存成功后回到教程；如果提示有内容需要调整，可以点“上一步”回去修改。', targets: [target('record-save')] }
const steps: Record<HelpLesson, RecordStep[]> = {
  symptom: [
    { title: '先写下发生了什么', description: '在这里写孩子的实际情况：哪里不舒服、什么时候开始、有什么变化。只写已经知道的，不用照抄示例。', targets: [target('symptom-narrative')], check: () => hasText(target('symptom-narrative')), label: '写好了，核对时间' }, time, save
  ],
  sleep: [
    { title: '点这里，核对入睡日期和时间', description: '先展开入睡时间，再按实际情况填写。默认时间只是编辑起点，跨夜时要留意日期。', targets: [target('sleep-start'), '[data-help-editing="sleepAt"]'], check: () => document.querySelector(target('sleep-start'))?.getAttribute('aria-expanded') === 'true', label: '入睡时间已核对' },
    { title: '再点这里，核对醒来日期和时间', description: '醒来的日期可以与入睡日期不同。展开后检查日期、时间；先从一段已经结束的睡眠开始。', targets: [target('sleep-end'), '[data-help-editing="wakeAt"]'], check: () => document.querySelector(target('sleep-end'))?.getAttribute('aria-expanded') === 'true', label: '醒来时间已核对' },
    { title: '看一眼睡眠时长', description: '圆环显示这段睡眠的时长。确认与实际情况相符；需要修改可以回到上一步。', targets: [target('sleep-duration')], label: '时长已核对' }, save
  ],
  medication: [
    { title: '填写实际使用的药品名称', description: '先写清药品名称。图片是可选的；识别出的内容也需要自己核对。', targets: [target('medication-name')], check: () => hasText('input[aria-label="药品名称"]') },
    { title: '核对本次实际用量和单位', description: '这里记已经使用的量。按实际情况填写数值和单位，不把教程当作用药建议。', targets: [target('medication-dose')], check: () => Number(document.querySelector<HTMLInputElement>('input[aria-label="本次用量"]')?.value) > 0 }, time, save
  ],
  diet: [
    { title: '先选这次记的是什么', description: '奶类、饮食或补剂，按这次实际发生的事选择。下方会出现对应字段。', targets: [target('diet-kind')] },
    { title: '填写这次的实际内容', description: '母乳可记时长，奶类可记奶量；饮食输入食物后记得点添加。只填知道的内容，填写完成后继续核对时间。', targets: ['.diet-timer-grid', '[data-help-target="diet-milk"]', '.diet-food-input', '.diet-food-chips', '.diet-common-foods', '[data-help-target="diet-supplement"]'] }, time, save
  ],
  elimination: [
    { title: '按观察选择形状', description: '点选实际看到的形状，可以多选。没有观察到也可以继续，不必猜一个答案。', targets: [target('bowel-shape')], label: '继续看颜色' },
    { title: '记录实际看到的颜色', description: '知道就选择，不清楚可以留空。教程不会替你选成“正常”。', targets: [target('bowel-color')] }, time, save
  ]
}
export function GuidedRecordHint({ lesson }: { lesson: HelpLesson }) {
  const location = useLocation()
  const account = useAppStore(s => s.authUser?.id ?? '')
  const member = useAppStore(s => s.currentMemberId)
  if (helpLessonFromSearch(location.search) !== lesson) return null
  return <RecordCoach key={account + ':' + member + ':' + lesson} account={account} member={member} lesson={lesson}/>
}
function RecordCoach({ account, member, lesson }: { account: string; member: string; lesson: HelpLesson }) {
  const [state, setState] = useState(() => readHelpGuideState(account, member, lesson))
  const [, refresh] = useState(0)
  const list = steps[lesson], index = Math.min(state.step, list.length - 1), current = list[index]
  const update = (patch: Partial<typeof state>) => { const next = { ...state, ...patch }; writeHelpGuideState(account, member, lesson, next); setState(next) }
  return <>
    <aside className="help-record-hint" aria-label="记录教程提示"><strong>{HELP_LESSON_LABELS[lesson]} · 跟着做</strong><p>{state.paused ? '引导已暂停，已填写的内容还在。' : '高亮处就是实际操作的位置；保存后可回来看结果。'}</p><HohoButton size="small" variant="text" onClick={() => update({ paused: !state.paused })}>{state.paused ? '继续引导' : '暂停引导'}</HohoButton></aside>
    {!state.paused && <HohoSpotlightGuide targets={current.targets} title={current.title} description={current.description} step={index} total={list.length} nextLabel={current.label} nextDisabled={Boolean(current.check && !current.check())} onInteraction={() => refresh(value => value + 1)} onNext={index < list.length - 1 ? () => update({ step: index + 1 }) : undefined} onPrevious={index > 0 ? () => update({ step: index - 1 }) : undefined} onExit={() => update({ paused: true })}/>}
  </>
}
