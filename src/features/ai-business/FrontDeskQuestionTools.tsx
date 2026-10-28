import {ChildBodyLocationPicker} from '../../components/health/body-location/ChildBodyLocationPicker'
import type {BodyLocationSelection} from '../body-location'
import type {NursingInterview} from './smartRecordTypes'

export function FrontDeskQuestionTools({interview,memberId,locations,disabled,onAnswer,onLocations}:{interview?:NursingInterview;memberId:string;locations:BodyLocationSelection[];disabled:boolean;onAnswer:(answer:string)=>void;onLocations:(locations:BodyLocationSelection[])=>void}){
  if(!interview)return null
  return <div className="front-desk-question-tools">
    {!!interview.checks?.length&&<ul className="front-desk-checks" aria-label="本轮询问进度">{interview.checks.map(check=><li key={check.key}><span>{check.label}</span><span>{check.state==='uncertain'?'暂无法确认':'已排查'}</span></li>)}</ul>}
    {!!interview.checks?.some(check=>check.state==='answered')&&<small className="front-desk-checks-note">已排查表示已询问并记录，不代表排除疾病。</small>}
    {!!interview.question?.options.length&&<div className="front-desk-question-choices" role="group" aria-label="选择回答">{interview.question.options.map(option=><button type="button" key={option.value} disabled={disabled} onClick={()=>onAnswer(option.value)}>{option.label}</button>)}</div>}
    {interview.bodyLocationSuggested&&<fieldset className="front-desk-location-choice" disabled={disabled}><legend>说不清位置时，可以点选部位</legend><ChildBodyLocationPicker memberId={memberId} value={locations} onChange={onLocations} buttonLabel="选择症状部位" confirmLabel="确认部位并补充到对话"/></fieldset>}
  </div>
}
