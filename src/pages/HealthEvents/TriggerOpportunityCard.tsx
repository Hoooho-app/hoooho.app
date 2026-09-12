import { ChevronRight, X } from 'lucide-react'
import { JournalCategoryIcon } from './JournalCategoryIcon'
import type { SelectedTriggerCard } from './triggerOpportunitySelector'
import { triggerCopy, type TriggerLocale } from './triggerOpportunityI18n'
import { TriggerOpportunityIllustration } from './TriggerOpportunityIllustration'

export function TriggerOpportunityCard({ selected, locale, onAction, onDismiss }: { selected: SelectedTriggerCard; locale: TriggerLocale; onAction: (optionIndex?: 0 | 1) => void; onDismiss: () => void }) {
  const { config } = selected
  const text = triggerCopy(config.copyKey, locale)
  return <article className="trigger-opportunity-card" data-card-id={config.id}>
    <header><span className="trigger-opportunity-label"><i aria-hidden="true" />{text.label}</span><button aria-label={locale === 'en' ? 'Dismiss for now' : '暂时关闭此提醒'} className="trigger-opportunity-dismiss" onClick={onDismiss} type="button"><X size={17}/></button></header>
    <div className="trigger-opportunity-heading"><strong>{text.question}</strong><p>{text.description}</p></div>
    <TriggerOpportunityIllustration kind={config.illustrationKey}/>
    <div className="trigger-opportunity-options">{text.options.map((option, index) => <button key={option} onClick={() => onAction(index as 0 | 1)} type="button">{option}</button>)}</div>
    <button className="trigger-opportunity-action" onClick={() => onAction()} type="button"><JournalCategoryIcon category={config.category}/><span>{text.action}</span><ChevronRight aria-hidden="true" size={17}/></button>
  </article>
}
