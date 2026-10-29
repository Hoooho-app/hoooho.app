import { useLocation } from 'react-router-dom'
import { helpLessonFromSearch, type HelpLesson } from './guidedRecord'
import './guidedRecord.css'

export function GuidedRecordHint({ lesson }: { lesson: HelpLesson }) {
  if (helpLessonFromSearch(useLocation().search) !== lesson) return null
  return <aside className="help-record-hint" aria-label="记录教程提示"><strong>跟着记录</strong><p>{lesson === 'sleep'
    ? '按实际情况调整入睡和醒来的日期、时间，核对时长后保存。默认时间只是起点。'
    : '写下自己的实际情况，核对发生时间后点右上角保存。附件选填。'}</p><p>保存后回到教程，可打开刚才的记录；未保存退出时可以稍后继续。</p></aside>
}
