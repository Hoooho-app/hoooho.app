import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { HohoButton } from '../../components/design-system/HohoButton'
import { OpsProjectPicker, useOpsProject, projectName } from './workspace'
import { opsApiRequest } from '../../services/opsAuth'
import { useAppStore } from '../../store/useAppStore'
import type { AnalyticsReport } from '../../features/product-analytics/types'
import './marketing.css'

const tabs = [{ id: 'overview', name: '使用总览' }, { id: 'pages', name: '全页面统计' }, { id: 'features', name: '功能使用' }, { id: 'paths', name: '访问路径' }, { id: 'funnels', name: '关键流程' }]
const shanghaiDay = (offset = 0) => new Date(Date.now() + 8 * 3600000 + offset * 86400000).toISOString().slice(0, 10)
const dateTime = (value: string) => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
const number = (value: number) => value.toLocaleString('zh-CN')
const percent = (value: number | null) => value === null ? '—' : value + '%'

export function OpsMarketingPage() {
  const [params, setParams] = useSearchParams(), { project } = useOpsProject('hoooho')
  const tab = tabs.some(item => item.id === params.get('tab')) ? params.get('tab')! : 'overview'
  const token = useAppStore(state => state.opsAuthToken) || ''
  const [report, setReport] = useState<AnalyticsReport | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [refresh, setRefresh] = useState(0)
  const [query, setQuery] = useState(''), [zeroOnly, setZeroOnly] = useState(false), [featurePage, setFeaturePage] = useState('all')
  const ready = project === 'hoooho' || project === 'all'
  const start = params.get('start') || shanghaiDay(-6), end = params.get('end') || shanghaiDay()
  const environment = params.get('environment') || 'production', platform = params.get('platform') || 'all', version = params.get('version') || 'all', cohort = params.get('cohort') || 'all'
  const update = (key: string, value: string) => setParams(previous => { const next = new URLSearchParams(previous); next.set(key, value); return next }, { replace: true })
  useEffect(() => {
    const controller = new AbortController(); let current = true
    setReport(null); setError(''); setLoading(ready)
    if (ready) {
      const search = new URLSearchParams({ project, start, end, environment, platform, version, cohort })
      void opsApiRequest<AnalyticsReport>('/api/ops/analytics?' + search, { token, signal: controller.signal }).then(data => {
        if (!data.overview || !Array.isArray(data.pages)) throw new Error('统计数据格式异常')
        if (current) setReport(data)
      }).catch(cause => { if (current) setError(cause instanceof Error ? cause.message : '统计读取失败') }).finally(() => { if (current) setLoading(false) })
    }
    return () => { current = false; controller.abort() }
  }, [token, project, start, end, environment, platform, version, cohort, refresh, ready])
  const pageName = (id: string) => report?.pages.find(page => page.id === id)?.name || '全流程'
  const pages = report?.pages.filter(page => page.name.includes(query) && (!zeroOnly || (page.available && !page.views))) || []
  const features = report?.features.filter(item => (item.name + ' ' + pageName(item.page)).includes(query) && (featurePage === 'all' || item.page === featurePage) && (!zeroOnly || (!item.clicks && !item.completed))) || []
  const changeTab = (id: string) => { setQuery(''); setZeroOnly(false); update('tab', id) }
  const reset = () => setParams({ project: 'hoooho', tab, start: shanghaiDay(-6), end: shanghaiDay() }, { replace: true })
  return <main className="ops-analytics" aria-label="产品运营">
    <header className="ops-overview-heading"><div><h1>产品运营</h1><p>看清用户访问了哪里、用了什么，以及在哪一步离开。</p></div><HohoButton variant="secondary" onClick={() => setRefresh(value => value + 1)} disabled={loading || !ready}>{loading ? '读取中…' : '刷新数据'}</HohoButton></header>
    <OpsProjectPicker fallback="hoooho"/>
    {!ready ? <section className="ops-inbox-empty"><h2>{projectName(project)}尚未接入行为统计</h2><p>本轮仅接入护护记录。</p><HohoButton variant="secondary" onClick={reset}>查看护护记录</HohoButton></section> : <>
      <div className="analytics-filters" aria-label="统计筛选">
        <label>开始日期<input type="date" aria-label="开始日期" max={end} value={start} onChange={event => update('start', event.target.value)}/></label>
        <label>结束日期<input type="date" aria-label="结束日期" min={start} max={shanghaiDay()} value={end} onChange={event => update('end', event.target.value)}/></label>
        <label>平台<select aria-label="平台" value={platform} onChange={event => update('platform', event.target.value)}><option value="all">全部平台</option><option value="ios">iOS</option><option value="android">Android</option><option value="web">网页</option></select></label>
        <label>版本<select aria-label="版本" value={version} onChange={event => update('version', event.target.value)}><option value="all">全部版本</option>{[...new Set([...(report?.versions || []), ...(version !== 'all' ? [version] : [])])].map(item => <option key={item} value={item}>{item === 'local' ? '本地验证' : item.slice(0, 8)}</option>)}</select></label>
        <label>数据范围<select aria-label="数据范围" value={environment} onChange={event => update('environment', event.target.value)}><option value="production">正式用户</option><option value="internal">内部验证</option><option value="all">全部数据</option></select></label>
        <label>用户<select aria-label="用户" value={cohort} onChange={event => update('cohort', event.target.value)}><option value="all">全部用户</option><option value="new">首次观测用户</option><option value="returning">回访用户</option></select></label>
        <button type="button" className="analytics-text-button" onClick={reset}>重置筛选</button>
      </div>
      <nav className="analytics-tabs" aria-label="行为统计栏目">{tabs.map(item => <button key={item.id} type="button" aria-pressed={tab === item.id} onClick={() => changeTab(item.id)}>{item.name}</button>)}</nav>
      {project === 'all' && <p className="analytics-note">当前汇总仅包含已接入的护护记录。</p>}
      {loading && <p role="status" className="analytics-notice">正在读取行为统计…</p>}
      {error && <div role="alert" className="analytics-notice analytics-error"><p>统计读取失败：{error}</p><HohoButton variant="secondary" onClick={() => setRefresh(value => value + 1)}>重新读取</HohoButton></div>}
      {report && <>
        <div className="analytics-collection" role="status"><strong>{report.collection.status === 'receiving' ? '近期已收到采集回执' : report.collection.status === 'quiet' ? '近期没有新回执，请结合实际流量检查' : '采集已接入，等待首批访问回执'}</strong><span>{report.collection.lastAt ? '最近接收：' + dateTime(report.collection.lastAt) : '暂无历史行为数据'} · {report.pages.filter(page => page.available).length} 个开放页面 · {number(report.collection.controls)} 个采集点</span></div>
        {tab === 'overview' && <>
          <div className="analytics-metrics">{[['访问人数', report.overview.visitors], ['首次观测用户', report.overview.newVisitors], ['访问会话', report.overview.sessions], ['页面访问次数', report.overview.views], ['功能完成次数', report.overview.completed], ['零访问页面', report.overview.zeroPages]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{number(value as number)}</strong></div>)}</div>
          <section className="analytics-section"><h2>每日使用情况</h2><div className="analytics-table-wrap"><table><thead><tr><th>日期</th><th>访问人数</th><th>页面访问次数</th><th>访问分布</th></tr></thead><tbody>{report.trend.map(item => <tr key={item.day}><th>{item.day}</th><td>{number(item.visitors)}</td><td>{number(item.views)}</td><td><div className="analytics-bar-track"><span style={{ width: (item.views / Math.max(1, ...report.trend.map(row => row.views)) * 100) + '%' }}/></div></td></tr>)}</tbody></table></div></section>
          <section className="analytics-section"><h2>用户是否回来</h2><div className="analytics-retention">{report.retention.map(item => <div key={item.days}><span>{item.days === 1 ? '次日留存' : '第7日留存'}</span><strong>{percent(item.rate)}</strong><p>{item.eligible ? item.returned + ' / ' + item.eligible + ' 位已满观察期的用户回来使用' : '暂无已满观察期的用户'}</p></div>)}</div></section>
        </>}
        {(tab === 'pages' || tab === 'features') && <div className="analytics-table-tools"><label className="analytics-search">搜索<input type="search" aria-label="搜索统计条目" placeholder="输入页面或功能名称" value={query} onChange={event => setQuery(event.target.value)}/></label><label className="analytics-checkbox"><input type="checkbox" checked={zeroOnly} onChange={event => setZeroOnly(event.target.checked)}/>{tab === 'pages' ? '只看零访问页面' : '只看零点击 / 零完成'}</label>{tab === 'features' && <label>所属页面<select aria-label="功能所属页面" value={featurePage} onChange={event => setFeaturePage(event.target.value)}><option value="all">全部页面</option>{report.pages.map(page => <option value={page.id} key={page.id}>{page.name}</option>)}</select></label>}</div>}
        {tab === 'pages' && <section className="analytics-section"><h2>全部页面 <small>{pages.length} 项</small></h2><p className="analytics-note">按访问次数排序，零访问页面也保留。停留仅计算前台可见时间；退出数是会话最后停留在该页的次数。</p><div className="analytics-table-wrap"><table><thead><tr><th>页面</th><th>访问人数</th><th>访问次数</th><th>平均停留</th><th>操作点击</th><th>退出次数</th><th>状态</th></tr></thead><tbody>{pages.map(page => <tr key={page.id}><th>{page.name}</th><td>{number(page.visitors)}</td><td>{number(page.views)}</td><td>{page.views ? page.averageSeconds + ' 秒' : '—'}</td><td>{number(page.clicks)}</td><td>{number(page.exits)}</td><td><span className="analytics-state">{!page.available ? '暂未开放' : page.views ? '已收到访问' : '已接入 · 暂无访问'}</span></td></tr>)}</tbody></table></div>{!pages.length && <p className="analytics-notice">没有符合筛选条件的页面。</p>}</section>}
        {tab === 'features' && <section className="analytics-section"><h2>功能使用与高频操作</h2><p className="analytics-note">入口实际展示后列入统计，零点击也保留。保存等操作单独记录开始与结果；点击次数不代表完成次数。重复列表入口按同类操作归并。</p><div className="analytics-table-wrap"><table><thead><tr><th>功能 / 入口</th><th>所在页面</th><th>展示人数 / 次数</th><th>点击人数 / 次数</th><th>人均点击</th><th>开始</th><th>成功人数 / 次数</th><th>失败 / 取消</th></tr></thead><tbody>{features.map(item => <tr key={item.page + '|' + item.id + '|' + (item.surface || '')}><th>{item.name}<small className="analytics-subtext">{item.type === 'receipt' ? '保存回执' : item.type !== 'control' ? '操作结果' : '页面入口'}</small></th><td>{pageName(item.page)}</td><td>{item.type !== 'control' ? '—' : item.exposedUsers + ' / ' + item.exposures}</td><td>{item.type !== 'control' ? '—' : item.clickUsers + ' / ' + item.clicks}</td><td>{item.type !== 'control' || !item.clickUsers ? '—' : item.average}</td><td>{item.type === 'operation' ? item.started : '—'}</td><td>{item.type !== 'control' ? item.users + ' / ' + item.completed : '—'}</td><td>{item.type !== 'control' ? item.failed + ' / ' + item.cancelled : '—'}</td></tr>)}</tbody></table></div>{!features.length && <p className="analytics-notice">该范围尚无符合条件的入口或操作回执。</p>}</section>}
        {tab === 'paths' && <>
          <section className="analytics-section"><h2>页面之间怎么走</h2><p className="analytics-note">同一次会话中相邻的真实页面访问，按次数排序，最多显示前100条。</p><div className="analytics-table-wrap"><table><thead><tr><th>来源页面</th><th>下一页面</th><th>人数</th><th>次数</th></tr></thead><tbody>{report.paths.map(item => <tr key={item.from + '|' + item.to}><th>{pageName(item.from)}</th><td>{pageName(item.to)}</td><td>{item.actors}</td><td>{item.count}</td></tr>)}</tbody></table></div>{!report.paths.length && <p className="analytics-notice">尚无连续的跨页面访问。</p>}</section>
          <section className="analytics-section"><h2>最近访问路径</h2><p className="analytics-note">最近30次会话，只显示页面名称与时间。</p><div className="analytics-paths">{report.sessions.map(item => <details key={item.id}><summary>{dateTime(item.at)} · {item.pages.length} 次页面访问</summary><ol>{item.pages.map((entry, index) => <li key={index}><time>{dateTime(entry.at)}</time><span>{pageName(entry.page)}</span></li>)}</ol></details>)}</div>{!report.sessions.length && <p className="analytics-notice">尚无访问路径。</p>}</section>
        </>}
        {tab === 'funnels' && <><p className="analytics-note">按同一次会话内的先后顺序统计人数；成功必须属于同一次操作尝试。返回用户无需重复登录，登录转化单独计算。</p><div className="analytics-funnels">{report.funnels.map(item => <section className="analytics-section" key={item.name}><h2>{item.name}</h2><ol>{item.steps.map((step, index) => <li key={step.name}><div><span>{index + 1}. {step.name}</span><strong>{step.users} 人</strong></div><div className="analytics-bar-track"><span style={{ width: (item.steps[0].users ? step.users / item.steps[0].users * 100 : 0) + '%' }}/></div><small>{index ? '较上一步：' + percent(step.rate) : '流程起点'}</small></li>)}</ol></section>)}</div></>}
        <footer className="analytics-footnote"><p>统计自 {dateTime(report.startedAt)} 接入，之前的数据不补造。按北京时间自然日统计，保留最近 {report.retentionDays} 天明细；“首次观测”以已有统计中的首次访问为准。</p><p>默认仅看正式用户；运营账号及内部验证单独归类。断网行为恢复连接后补报，重复批次不重复计数。只采集页面与操作元数据，不采集输入、健康内容、录音或照片。</p><p>数据更新时间：{dateTime(report.generatedAt)}。暂无回执不等于统计故障；长时间无新回执时需结合实际访问核对。</p></footer>
      </>}
    </>}
  </main>
}
