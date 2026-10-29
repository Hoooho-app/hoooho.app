import {ChildBodyLocationPicker} from '../../components/health/body-location/ChildBodyLocationPicker'
import type {BodyLocationSelection} from '../body-location'
import type {NursingInterview} from './smartRecordTypes'
import {useState} from 'react'
import {HohoButton,HohoInput} from '../../components/design-system'
import type {ContinuousCard} from './ContinuousRecordCard'

export function FrontDeskQuestionTools({interview,progress,memberId,locations,disabled,onAnswer,onLocations}:{interview?:NursingInterview;progress?:ContinuousCard['informationProgress'];memberId:string;locations:BodyLocationSelection[];disabled:boolean;onAnswer:(answer:string)=>void;onLocations:(locations:BodyLocationSelection[])=>void}){
  if(!interview&&!progress?.length)return null
  const question=interview?.question
  const checks=progress??interview?.checks??[]
  return <div className="front-desk-question-tools">
    {!!checks.length&&<ul className="front-desk-checks" aria-label="本轮询问进度">{checks.map(check=><li key={check.key} data-state={check.state}><span>{check.label}</span><span>{check.state==='answered'?'已获得':check.state==='missing'?'待补充':'待补充 · 尚未明确'}</span></li>)}</ul>}
    {question?.inputKind==='temperature'&&<TemperatureAnswer key={question.id} disabled={disabled} onAnswer={onAnswer}/>}
    {!!question?.options.length&&question.inputKind!=='temperature'&&<div className="front-desk-question-choices" role="group" aria-label="选择回答">{question.options.map(option=><button type="button" key={option.value} disabled={disabled} onClick={()=>onAnswer(option.value)}>{option.label}</button>)}</div>}
    {interview?.bodyLocationSuggested&&<fieldset className="front-desk-location-choice" disabled={disabled}><legend>说不清位置时，可以点选部位</legend><ChildBodyLocationPicker memberId={memberId} value={locations} onChange={onLocations} buttonLabel="选择症状部位" confirmLabel="确认部位并补充到对话"/></fieldset>}
  </div>
}

function TemperatureAnswer({disabled,onAnswer}:{disabled:boolean;onAnswer:(text:string)=>void}){
  const [value,setValue]=useState('')
  const number=Number(value),valid=value!==''&&Number.isFinite(number)&&number>0&&number<100
  return <fieldset className="front-desk-temperature" disabled={disabled}>
    <legend>体温数值</legend>
    <div className="front-desk-temperature__value"><HohoInput label="体温（℃）" type="number" inputMode="decimal" step="0.1" value={value} placeholder="填写实测数值" onChange={event=>setValue(event.target.value)}/><HohoButton disabled={!valid||disabled} onClick={()=>{if(valid)onAnswer(`测得体温 ${value}℃。`)}}>确认数值</HohoButton></div>
    <input aria-label="拖动选择体温" aria-valuetext={value?`${value}摄氏度，尚未提交`:'尚未选择体温'} type="range" min="30" max="45" step="0.1" value={valid?Math.max(30,Math.min(45,number)):37} onChange={event=>setValue(event.target.value)}/>
    <div className="front-desk-temperature__scale"><span>30℃</span><span>45℃</span></div>
    <small>没有数值可以继续说其他情况。确认后才记入。</small>
  </fieldset>
}
