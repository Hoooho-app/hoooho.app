import {recordReading} from '../../../shared/front-desk-record-format.mjs'
import './recordNarrative.css'

/** The same saved text is rendered in conversation and calendar details. */
export function RecordNarrative({text,title='主要症状',compact=false,keywords=[]}:{text:string;title?:string;compact?:boolean;keywords?:string[]}){
  if(compact){
    const reading=recordReading(text,keywords)
    return <div className="record-reading">
      <section><h3>情况概述</h3><p className="symptom-record-original">{reading.overview}</p></section>
      <section><h3>关键词</h3>{reading.keywords.length?<div className="record-reading__keywords">{reading.keywords.map(keyword=><span key={keyword}>{keyword}</span>)}</div>:<p className="record-reading__empty">暂无可提取的关键词</p>}</section>
      {reading.details.map(section=><details className="record-reading__detail" key={section.title}><summary>{section.title}</summary><p className="symptom-record-original">{section.text}</p></details>)}
    </div>
  }
  const parts=text.split(/(?:^|\n)【([^】\n]{1,40})】\s*\n/u)
  if(parts.length<3)return <section><h3>{title}</h3><p className="symptom-record-original">{text||'附件记录'}</p></section>
  return <>{parts[0].trim()&&<section><h3>{title}</h3><p className="symptom-record-original">{parts[0].trim()}</p></section>}{Array.from({length:Math.floor(parts.length/2)},(_,i)=><section key={`${i}:${parts[i*2+1]}`}><h3>{parts[i*2+1]}</h3><p className="symptom-record-original">{parts[i*2+2].trim()}</p></section>)}</>
}
