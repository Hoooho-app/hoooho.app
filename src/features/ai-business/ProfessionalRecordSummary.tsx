import { recordCategoryLabels, smartRecordTimeLabel, type SmartRecordItem } from './smartRecordTypes'

export function ProfessionalRecordSummary({item,document=false}:{item:SmartRecordItem;document?:boolean}) {
  if(document){
    const label=`${recordCategoryLabels[item.category]??'健康'}记录单`
    const description=item.professionalSummary?.text||item.fields.map(field=>field.value).filter(Boolean).join('；')||item.title
    return <section className="smart-professional-summary front-desk-record-sheet" aria-label={label}>
      <header><span>{label}</span></header>
      <h3>{item.title}</h3>
      <dl><div><dt>发生时间</dt><dd>{smartRecordTimeLabel(item)}</dd></div></dl>
      <p>{description}</p>
    </section>
  }
  if(!item.professionalSummary?.text)return null
  return <section className="smart-professional-summary" aria-label="整理后的描述">
    <span className="hoho-text-caption">整理后的描述</span>
    <p>{item.professionalSummary.text}</p>
  </section>
}
