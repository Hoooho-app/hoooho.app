import { ArrowLeft } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { HohoButton } from '../../components/design-system'
import { useFoodAllergyIndex } from '../../hooks/useFoodAllergyIndex'
import { FOOD_ALLERGY_INDEX_DIMENSIONS, FOOD_ALLERGY_INDEX_FORMULA, FOOD_ALLERGY_INDEX_SOURCES } from './foodAllergyStatusIndexContent'
import './foodAllergyStatusIndex.css'

export function FoodAllergyStatusIndexPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo ?? '/nurse-station'
  const { data, error, loading, label, retry } = useFoodAllergyIndex()
  return (
    <main className="app-shell food-allergy-index-page">
      <header className="food-allergy-index-header">
        <button aria-label="返回前台" onClick={() => navigate(returnTo, { replace: true })} type="button"><ArrowLeft aria-hidden="true" /></button>
        <h1>食物过敏记录指数</h1><span aria-hidden="true" />
      </header>
      <div className="food-allergy-index-scroll">
        <section className="food-allergy-index-current" aria-busy={loading}>
          <div><h2>当前记录完整度</h2><strong>{label}</strong></div>
          <p>根据已记录的食物相关反应与资料计算。</p>
          <p>数值越高，表示资料越完整，不代表过敏越轻。</p>
          {error && <div role="status"><p>{data ? '更新失败，保留上次结果。' : '暂时无法加载统计，请重试。'}</p><HohoButton onClick={retry} variant="text">重试</HohoButton></div>}
          {data?.foodCount === 0 && <><p>还没有可整理的食物相关记录</p><Link to="/health-profile/allergy">记录过敏与反应</Link></>}
          <small>0% 不表示没有过敏；此指标不衡量严重程度、耐受程度或康复程度。</small>
        </section>
        {data && <section>
          <h2>本次统计</h2>
          <p>相关食物：{data.foodCount} 项</p><p>已记录信息：{data.recordedCount} / {data.expectedCount} 项</p>
          <p>未明确食物：{data.unknownFoodCount} 项</p><p>待整理资料：{data.pendingMaterialCount} 项</p>
          <p>更新时间：{new Date(data.updatedAt).toLocaleString('zh-CN')}</p>
        </section>}
        <section>
          <h2>指数如何计算</h2>
          <div className="food-allergy-index-formulas"><p>{FOOD_ALLERGY_INDEX_FORMULA}</p><p>N = 0 时，记录完整度 = 0%</p></div>
          <p>每种食物整理 4 类信息：反应严重程度、处理情况、相关摄入量、既往反应与证据。已记录的信息数除以应记录的信息数，得到当前完整度。</p>
          <p>N 是已记录的相关食物条目数，K 是已记录维度数。每个维度有明确记录记 1，缺失、未知或无法归属记 0；重复引用不重复加分。</p>
          <small className="food-allergy-index-note">公式版本：{data?.formulaVersion ?? 'food-record-completeness-v1'}</small>
        </section>
        <section><h2>四个整理维度</h2><div className="food-allergy-index-dimensions">
          {FOOD_ALLERGY_INDEX_DIMENSIONS.map(item => <article key={item.key}><b>{item.key}</b><div><h3>{item.title}</h3><p>{item.description}</p></div></article>)}
        </div></section>
        {data && <section><h2>各食物的记录情况</h2>
          {data.foods.map(food => <details className="food-allergy-index-food" key={food.id}><summary>{food.name}</summary>
            {Object.entries(food.dimensions).map(([key, dimension]) => <div key={key}><p>{key} · {dimension.label}：{dimension.recorded ? '已记录' : '待补充'}</p>
              {dimension.sources.map(source => <Link key={source.id} to={source.href}>{source.label} · 查看来源</Link>)}
              {!dimension.recorded && <Link to={food.id.startsWith('allergy:') ? '/health-profile/allergy/' + encodeURIComponent(food.id.slice(8)) : '/desensitization-tests'}>查看并补充记录</Link>}
            </div>)}</details>)}
          {!data.foods.length && <p>暂无具体食物条目。未明确食物不纳入分母。</p>}
        </section>}
        <section><h2>这些资料从哪里来</h2><dl className="food-allergy-index-sources">
          {FOOD_ALLERGY_INDEX_SOURCES.map(([source, description]) => <div key={source}><dt>{source}</dt><dd>{description}</dd></div>)}
        </dl></section>
        <section><h2>何时更新</h2><p>新增、修改、删除相关记录或修改食物关联后重新统计。切换孩子时加载对应资料。计算不依赖 Agent 或 AI 服务，未经确认的信息不参与统计。</p></section>
      </div>
    </main>
  )
}
