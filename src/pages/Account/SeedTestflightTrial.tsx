import { useEffect, useRef, useState } from 'react'
import { HohoButton, StatusNotice } from '../../components/design-system'
import { apiRequest, ApiRequestError } from '../../services/apiClient'

const path = '/api/account/seed-testflight'
type Availability = { available: false } | { available: true; model: string; sample: string[] }
type TrialResult = {
  model: string
  sample: string[]
  replies: string[]
  card: { generated: boolean; text: string | null; occurredAt: string | null }
  elapsedMs: number
}
const displayTime = (value: string) => new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
}).format(new Date(value))

export function SeedTestflightTrial({ token }: { token: string }) {
  const [status, setStatus] = useState<Availability>({ available: false })
  const [result, setResult] = useState<TrialResult | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const running = useRef<AbortController | null>(null)
  useEffect(() => {
    const loading = new AbortController()
    void apiRequest<Availability>(path, { token, signal: loading.signal }).then(data => {
      if (!loading.signal.aborted) setStatus(data)
    }).catch(() => {})
    return () => { loading.abort(); running.current?.abort(); running.current = null }
  }, [token])

  async function run() {
    if (!status.available || running.current) return
    const request = new AbortController()
    running.current = request
    setBusy(true); setError('')
    try {
      const result = await apiRequest<TrialResult>(path, { token, method: 'POST', body: {}, signal: request.signal })
      if (!request.signal.aborted) setResult(result)
    } catch (cause) {
      if (!request.signal.aborted) setError(cause instanceof ApiRequestError ? cause.message : '连接中断，内测未完成。请稍后手动重试。')
    } finally {
      if (running.current === request) { running.current = null; setBusy(false) }
    }
  }

  if (!status.available) return null
  return <section className="settings-list space-y-3 p-4" aria-label="Seed 模型内测">
    <h2 className="settings-section-label">Seed 模型内测</h2>
    <p className="text-sm text-text-secondary">只运行一组虚构对话，验证追问和时间更正。不读取或保存你家孩子的记录。</p>
    <ol className="list-decimal space-y-1 pl-5 text-sm">{status.sample.map(text => <li key={text}>{text}</li>)}</ol>
    <HohoButton type="button" disabled={busy} onClick={() => void run()}>{busy ? '正在运行虚构案例…' : '运行虚构案例'}</HohoButton>
    {busy && <p role="status" className="text-sm text-text-secondary">正在通过护护的对话和记录单流程验证，不用重复点。</p>}
    {error && <StatusNotice title={error} tone="error" />}
    {result && <div className="space-y-2 text-sm" aria-live="polite">
      <p className="text-text-secondary">{result.model} · {(result.elapsedMs / 1000).toFixed(1)} 秒 · {error || busy ? '上次完成的结果' : '本次测试结果'}</p>
      {result.replies.map((reply, index) => <div key={index}><strong>第 {index + 1} 轮护护回复</strong><p className="whitespace-pre-wrap">{reply}</p></div>)}
      <strong>虚构记录单</strong>
      {result.card.generated ? <><p className="whitespace-pre-wrap">{result.card.text}</p>{result.card.occurredAt && <p>识别到的发生时间：{displayTime(result.card.occurredAt)}</p>}</> : <p>本轮尚未生成记录单。</p>}
      <p className="text-text-secondary">未保存到正式记录。</p>
    </div>}
  </section>
}
