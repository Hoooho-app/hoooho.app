import { ArrowLeft } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  FOOD_ALLERGY_INDEX_DIMENSIONS,
  FOOD_ALLERGY_INDEX_SOURCES,
  FOOD_ALLERGY_INDEX_STATUS,
  FOOD_ALLERGY_INDEX_VARIABLES,
} from './foodAllergyStatusIndexContent'
import './foodAllergyStatusIndex.css'

function FormulaBlock() {
  return (
    <div aria-label="食物过敏状态指数算法结构" className="food-allergy-index-formulas" role="group">
      <p aria-label="I 下标 t 等于一减 L 下标 t，再乘以百分之百"><var>I<sub>t</sub></var> = (1 − <var>L<sub>t</sub></var>) × 100%</p>
      <p aria-label="L 下标 t 等于 G theta 对所有食物状态的汇总"><var>L<sub>t</sub></var> = G<sub>θ</sub>(S<sub>1,t</sub>, …, S<sub>n,t</sub>)</p>
      <p aria-label="第 j 种食物的状态等于 F phi 对 A、B、C、H 的评估"><var>S<sub>j,t</sub></var> = F<sub>φ</sub>(A<sub>j,t</sub>, B<sub>j,t</sub>, C<sub>j,t</sub>, H<sub>j</sub>)</p>
    </div>
  )
}

export function FoodAllergyStatusIndexPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo ?? '/nurse-station'

  return (
    <main className="app-shell food-allergy-index-page">
      <header className="food-allergy-index-header">
        <button aria-label="返回前台" onClick={() => navigate(returnTo, { replace: true })} type="button"><ArrowLeft aria-hidden="true" /></button>
        <h1>食物过敏状态指数</h1>
        <span aria-hidden="true" />
      </header>
      <div className="food-allergy-index-scroll">
        <section className="food-allergy-index-current">
          <div><h2>当前指数</h2><strong>{FOOD_ALLERGY_INDEX_STATUS.label}</strong></div>
          <p>{FOOD_ALLERGY_INDEX_STATUS.description}</p>
          <small>当前没有经过验证、可用于真实用户的计算结果。</small>
        </section>

        <section>
          <h2>指数如何计算</h2>
          <FormulaBlock />
          <p className="food-allergy-index-note">算法结构草案，参数尚待验证。</p>
        </section>

        <section>
          <h2>三个参考维度</h2>
          <div className="food-allergy-index-dimensions">
            {FOOD_ALLERGY_INDEX_DIMENSIONS.map((item) => <article key={item.key}><b>{item.key}</b><div><h3>{item.title}</h3><p>{item.description}</p></div></article>)}
          </div>
        </section>

        <section>
          <h2>公式里的变量</h2>
          <dl className="food-allergy-index-definitions">
            {FOOD_ALLERGY_INDEX_VARIABLES.map(([term, description]) => <div key={term}><dt>{term}</dt><dd>{description}</dd></div>)}
          </dl>
        </section>

        <section>
          <h2>这些资料从哪里来</h2>
          <dl className="food-allergy-index-sources">
            {FOOD_ALLERGY_INDEX_SOURCES.map(([source, description]) => <div key={source}><dt>{source}</dt><dd>{description}</dd></div>)}
          </dl>
          <p className="food-allergy-index-note">这些是信息来源说明，不意味着每条记录都已符合计算条件。缺失记录也不等同于没有反应。</p>
        </section>

        <section>
          <h2>何时更新</h2>
          <p>当相关反应或证据信息变化，并满足既定计算条件后，指数才可能更新。当前尚未启用自动计算。</p>
        </section>

        <section>
          <h2>如何理解百分比</h2>
          <p>这是拟议的状态表达方式。在该公式结构中，数值越高表示估算负担越低。</p>
          <p>它不代表治愈率、脱敏成功率或安全进食概率，也不能直接决定是否尝试、恢复或增加某种食物。</p>
          <p className="food-allergy-index-note">记录次数、使用天数、活跃度及会员身份不参与评分。</p>
        </section>
      </div>
    </main>
  )
}
