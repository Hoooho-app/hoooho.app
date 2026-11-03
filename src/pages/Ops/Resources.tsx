import { useEffect, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { HohoProgress } from '../../components/design-system/HohoProgress'
import { usageBytes, usageNumber, usageTime, type AIUsage } from '../../services/usage'
import { OpsProjectPicker, useOpsProject, useOpsViewedReceipt } from './workspace'
import { useResource } from './Modules'
import './resources.css'

interface Resources {
  checkedAt: string; state: 'normal' | 'notice' | 'warning' | 'critical' | 'unknown'
  disk: { totalBytes: number; usedBytes: number; availableBytes: number } | null
  files: { groups: { name: string; bytes: number; files: number }[]; unreadable: number }
  historyAvailable: boolean; growthBytesPerDay: number | null; remainingDays: number | null
  ai: AIUsage; alertIds: string[]
}
const states = { normal: '容量充足', notice: '需关注', warning: '容量预警', critical: '容量紧急', unknown: '暂未读取' }
const plans = [
  { name: '免费', price: '¥0', storage: '100 MB', input: '3 万', output: '1 万', voice: '5 分钟' },
  { name: '标准', price: '¥19/月', storage: '1 GB', input: '100 万', output: '25 万', voice: '60 分钟' },
  { name: '家庭', price: '¥39/月', storage: '5 GB', input: '300 万', output: '75 万', voice: '180 分钟' },
]
export function OpsResourcesPage() {
  const { data, error, loading, reload } = useResource<Resources>('/api/ops/resources')
  const { project } = useOpsProject(), [params] = useSearchParams(), location = useLocation()
  const scoped = project === 'all' || project === 'hoooho', eventId = params.get('event')
  const [located, setLocated] = useState<string | null>(null)
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === 'visible') reload() }
    const timer = window.setInterval(onFocus, 30000)
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [reload])
  useEffect(() => {
    setLocated(null)
    if (!scoped || !data || error || !eventId || !data.alertIds.includes(eventId) || location.hash !== '#resource-disk') return
    const node = document.getElementById('resource-disk')
    if (node) { node.scrollIntoView({ block: 'start' }); setLocated(eventId) }
  }, [scoped, data, error, eventId, location.hash])
  const receipt = useOpsViewedReceipt(eventId, Boolean(scoped && !error && located === eventId && eventId))
  const disk = data?.disk, ai = data?.ai
  return <main className="ops-module-page" aria-label="资源监控">
    <header className="ops-overview-heading"><div><h1>资源监控</h1><p>全站磁盘与 AI 用量 · 只读监控</p></div><button className="hoho-button" data-variant="secondary" type="button" disabled={loading} onClick={reload}>{loading ? '正在读取…' : '重新读取'}</button></header>
    <div className="ops-module-projects"><OpsProjectPicker /></div>
    {error && <div className="ops-error" role="alert">{error}；已显示的数字是之前的采样。<button type="button" onClick={reload}>重试</button></div>}
    {!scoped ? <div className="ops-inbox-empty"><h2>该项目尚未接入资源监控</h2><p>不会以其他项目的用量代替。</p></div> : !data ? <p role="status">{loading ? '正在读取资源…' : '暂时无法读取资源'}</p> : <>
      <section className="ops-module-section" id="resource-disk"><h2>持久化数据盘 <span className="ops-module-status" data-state={data.state === 'normal' ? 'online' : 'degraded'}>{states[data.state]}</span></h2><p className="ops-module-muted">实测 {usageTime(data.checkedAt)} · 每分钟采样，页面每 30 秒更新</p>
        <div className="ops-resource-grid"><article className="ops-module-card"><h3>可用空间</h3><strong className="ops-resource-number">{usageBytes(disk?.availableBytes)}</strong><p className="ops-module-muted">总容量 {usageBytes(disk?.totalBytes)} · 已用 {usageBytes(disk?.usedBytes)}</p>{disk && <HohoProgress value={disk.usedBytes} max={disk.totalBytes} label="磁盘已用容量" />}</article><article className="ops-module-card"><h3>近 24 小时平均增长</h3><strong className="ops-resource-number">{data.growthBytesPerDay === null ? '样本不足' : `${data.growthBytesPerDay < 0 ? '减少 ' : '+'}${usageBytes(Math.abs(data.growthBytesPerDay))}/天`}</strong><p className="ops-module-muted">{data.remainingDays === null ? '至少积累 1 小时采样后分析；用量不增长时不推算耗尽时间。' : `按当前平均增速，约 ${usageNumber(data.remainingDays)} 天耗尽；突发上传与事务副本会提前消耗空间。`}</p></article></div>
        {!data.historyAvailable && <p className="ops-form-error" role="alert">采样历史保存失败；磁盘数字仍为本次实测，增长预测暂不可用。</p>}
        {!disk && <p className="ops-form-error" role="alert">无法读取文件系统容量，不能据此判断正常。请检查服务器卷挂载与可用状态。</p>}
        <p className="ops-module-muted">关注 70% · 预警 85% · 紧急 95%；可用空间低于 100 MB 时提前关注。全站盘还要容纳事务临时副本，容量充足不等于所有业务链路均健康。此处告警进入 Overview，不会向用户自动扣费或扩容。</p>
        {receipt.error && <div className="ops-error" role="alert">查看回执保存失败：{receipt.error}<button type="button" onClick={receipt.retry}>重试保存回执</button></div>}
      </section>
      <section className="ops-module-section"><h2>文件占用分类</h2><div className="ops-resource-grid">{data.files.groups.map(group => <article className="ops-module-card" key={group.name}><h3>{group.name}</h3><strong>{usageBytes(group.bytes)}</strong><p className="ops-module-muted">{usageNumber(group.files)} 个文件</p></article>)}</div><p className="ops-module-muted">文件逻辑大小每 5 分钟更新，与磁盘分配块、保留空间的统计口径不同。原件仍保留；本页不提供删除按钮。{data.files.unreadable ? `有 ${data.files.unreadable} 项暂时无法统计。` : '没有读取错误。'}</p></section>
      <section className="ops-module-section"><h2>本月 AI 消耗</h2>{ai?.state !== 'available' ? <p className="ops-form-error" role="alert">AI 用量台账暂时无法读取，不显示为零。</p> : <><div className="ops-resource-grid"><article className="ops-module-card"><h3>输入 / 输出 Tokens</h3><strong>{usageNumber(ai.inputTokens)} / {usageNumber(ai.outputTokens)}</strong></article><article className="ops-module-card"><h3>模型请求 / HTTP 与网络失败</h3><strong>{usageNumber(ai.calls)} / {usageNumber(ai.failed)}</strong></article><article className="ops-module-card"><h3>有回执的语音时长</h3><strong>{ai.audioReceipts ? `${usageNumber((ai.audioSeconds ?? 0) / 60)} 分钟` : '尚无回执'}</strong></article></div><div className="ops-resource-table"><table><thead><tr><th>供应商 / 模型</th><th>调用</th><th>输入 Tokens</th><th>输出 Tokens</th><th>缺完整 Token 回执</th></tr></thead><tbody>{ai.rows.map(row => <tr key={`${row.provider}:${row.model}`}><td>{row.provider}<br/>{row.model}</td><td>{usageNumber(row.calls)}</td><td>{usageNumber(row.inputTokens)}</td><td>{usageNumber(row.outputTokens)}</td><td>{usageNumber(row.unknown)}</td></tr>)}</tbody></table></div>{ai.incomplete && <p role="alert" className="ops-form-error">台账曾出现保存失败，累计用量可能缺漏，不可作为扣费凭证。</p>}{!ai.rows.length && <p>监控启用后，本月尚无已计量请求。</p>}<p className="ops-module-muted">统计起点 {usageTime(ai.since)}，北京时间自然月；包含用户与系统请求。缺完整 Token 回执 {usageNumber(ai.unknown)} 次，已知用量仍保留。覆盖标准文字、图片及短语音 HTTP 接口；实时语音 WebSocket 和启用前历史暂未覆盖。回执在内容校验前读取，生成失败也可能消耗用量；这些监控数字尚不是用户扣费凭证。</p></>}</section>
      <section className="ops-module-section"><h2>套餐方案 · 未启用</h2><p className="ops-module-muted">本次定价建议，尚未对用户收费或限制存量资料。AI 额度按月，容量为累计占用；输入与输出分别计算，避免输出成本超支。</p><div className="ops-resource-grid">{plans.map(plan => <article className="ops-module-card" key={plan.name}><h3>{plan.name} <span>{plan.price}</span></h3><dl><div><dt>资料容量</dt><dd>{plan.storage}</dd></div><div><dt>每月输入 / 输出 Tokens</dt><dd>{plan.input} / {plan.output}</dd></div><div><dt>每月语音</dt><dd>{plan.voice}</dd></div></dl></article>)}</div><p className="ops-module-muted">扩容包建议 ¥10/GB/月。上线销售前需完成支付、续费/退款、超额处理、失败请求豁免及实际账单成本核验；不销售无限 AI。原件保留策略独立决定，套餐不触发自动删除。</p></section>
    </>}
  </main>
}
