/** The same saved text is rendered in conversation and calendar details. */
export function RecordNarrative({text,title='主要症状'}:{text:string;title?:string}){
  const parts=text.split(/(?:^|\n)【([^】\n]{1,40})】\s*\n/u)
  if(parts.length<3)return <section><h3>{title}</h3><p className="symptom-record-original">{text||'附件记录'}</p></section>
  return <>{parts[0].trim()&&<section><h3>{title}</h3><p className="symptom-record-original">{parts[0].trim()}</p></section>}{Array.from({length:Math.floor(parts.length/2)},(_,i)=><section key={`${i}:${parts[i*2+1]}`}><h3>{parts[i*2+1]}</h3><p className="symptom-record-original">{parts[i*2+2].trim()}</p></section>)}</>
}
