import { Sprout, Sun, UtensilsCrossed } from 'lucide-react'
import { dietaryCopy, presentDietaryCard, translateFood, type DietaryCardGroup, type DietaryCardLanguage, type DietaryCardSnapshot } from './dietaryCardModel'

export function FoodGlyph({ name, group }: { name: string; group: DietaryCardGroup }) {
  return <span aria-hidden="true" className="dietary-food-glyph" data-group={group}>{name.trim().slice(0, 1)}</span>
}

function FoodGroup({ group, items, language }: { group: DietaryCardGroup; items: ReturnType<typeof presentDietaryCard>['avoid']; language: DietaryCardLanguage }) {
  if (!items.length) return null
  const copy = dietaryCopy[language]
  return <section className="dietary-card-group" data-group={group}>
    <header><span aria-hidden="true" /><strong>{group === 'avoid' ? copy.avoid : copy.temporary}</strong>{group === 'temporary' && <small>{copy.pending}</small>}</header>
    <div className={`dietary-food-grid ${items.length === 1 ? 'dietary-food-grid--single' : ''}`}>
      {items.map((item) => <div className="dietary-food-item" key={item.id}><FoodGlyph group={group} name={item.name} /><strong>{translateFood(item, language)}</strong></div>)}
    </div>
  </section>
}

export function DietaryCardPanel({ language, snapshot }: { language: DietaryCardLanguage; snapshot: DietaryCardSnapshot }) {
  const presentation = presentDietaryCard(snapshot, language)
  const copy = dietaryCopy[language]
  return <article aria-label="忌口出示卡正文" className="dietary-display-card">
    <header className="dietary-display-card__brand"><span>Hoooho</span><h2>{copy.title}</h2><p>{copy.intro}</p></header>
    <FoodGroup group="avoid" items={presentation.avoid} language={language} />
    <FoodGroup group="temporary" items={presentation.temporary} language={language} />
    {snapshot.avoidCrossContact && <p className="dietary-cross-contact"><UtensilsCrossed aria-hidden="true" />{copy.crossContact}</p>}
    <footer>{copy.thanks}</footer>
  </article>
}

export function DietaryEmptyState({ selectionEmpty = false }: { selectionEmpty?: boolean }) {
  return <section className="dietary-empty-state" aria-label={selectionEmpty ? '本次出示清单为空' : '暂无食物过敏记录'}>
    <div aria-hidden="true" className="dietary-empty-illustration"><Sun /><span className="dietary-empty-plate"><Sprout /></span></div>
    <h2>{selectionEmpty ? '本次还没有选择忌口食物' : '目前还没有记录食物过敏'}</h2>
    <p>{selectionEmpty ? '可点「修改」选择本次需要出示的食物' : '希望每一餐，都吃得安心'}</p>
    {!selectionEmpty && <small>如有需要，可点「修改」补充忌口食物</small>}
  </section>
}
