import { Sprout, Sun } from '../../components/icons'
import { DietaryFoodIcon } from './DietaryFoodIcon'
import { dietaryCopy, presentDietaryCard, translateFood, type DietaryCardGroup, type DietaryCardLanguage, type DietaryCardSnapshot } from './dietaryCardModel'

function FoodGroup({ group, items, language }: { group: DietaryCardGroup; items: ReturnType<typeof presentDietaryCard>['avoid']; language: DietaryCardLanguage }) {
  if (!items.length) return null
  const copy = dietaryCopy[language]
  return <section className="dietary-card-group" data-group={group}>
    <header><span aria-hidden="true" /><strong>{group === 'avoid' ? copy.avoid : copy.temporary}</strong>{group === 'temporary' && <small>{copy.pending}</small>}</header>
    <div className={`dietary-food-grid ${items.length === 1 ? 'dietary-food-grid--single' : ''}`}>
      {items.map((item) => <div className="dietary-food-item" key={item.id}><DietaryFoodIcon food={item} group={group} fallbackName={translateFood(item, language === 'en' ? 'en' : language.includes('Hant') ? 'zh-Hant' : 'zh')} /><strong>{translateFood(item, language)}</strong></div>)}
    </div>
  </section>
}

export function DietaryCardPanel({ language, snapshot }: { language: DietaryCardLanguage; snapshot: DietaryCardSnapshot }) {
  const presentation = presentDietaryCard(snapshot, language)
  const copy = dietaryCopy[language]
  return <article aria-label="忌口卡正文" className="dietary-display-card" lang={language === 'en' ? 'en' : language.includes('Hant') ? 'zh-Hant' : 'zh-Hans'}>
    <header className="dietary-display-card__brand"><span>Hoooho</span><h2>{copy.title}</h2><p>{copy.intro}</p></header>
    <FoodGroup group="avoid" items={presentation.avoid} language={language} />
    <footer>{copy.thanks}</footer>
  </article>
}

export function DietaryEmptyState({ selectionEmpty = false }: { selectionEmpty?: boolean }) {
  return <section className="dietary-empty-state" aria-label={selectionEmpty ? '本次出示清单为空' : '暂无食物过敏记录'}>
    <div aria-hidden="true" className="dietary-empty-illustration"><Sun /><span className="dietary-empty-plate"><Sprout /></span></div>
    <h2>{selectionEmpty ? '本次还没有选择忌口食物' : '目前还没有记录食物过敏'}</h2>
    <p>{selectionEmpty ? '可点「修改编辑」选择本次需要出示的食物' : '希望每一餐，都吃得安心'}</p>
    {!selectionEmpty && <small>如有需要，可点「修改编辑」补充忌口食物</small>}
  </section>
}
