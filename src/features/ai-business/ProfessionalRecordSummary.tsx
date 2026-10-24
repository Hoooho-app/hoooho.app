import type { SmartRecordItem } from './smartRecordTypes'

export function ProfessionalRecordSummary({item}:{item:SmartRecordItem}) {
  if(!item.professionalSummary?.text)return null
  return <section className="smart-professional-summary" aria-label="整理后的描述">
    <span className="hoho-text-caption">整理后的描述</span>
    <p>{item.professionalSummary.text}</p>
  </section>
}
