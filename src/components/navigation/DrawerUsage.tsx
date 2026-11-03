import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { BottomSheetSurface, HohoButton } from '../design-system'
import { ChevronRight } from '../icons'
import { useAppStore } from '../../store/useAppStore'
import { getAccountUsage, usageBytes, usageNumber, usageTime, type AccountUsage } from '../../services/usage'

export function DrawerUsage() {
  const token = useAppStore(state => state.authToken), accountId = useAppStore(state => state.authUser?.id)
  const [snapshot, setSnapshot] = useState<{ owner: string; data: AccountUsage } | null>(null)
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [detail, setDetail] = useState(false), [retry, setRetry] = useState(0)
  useEffect(() => { setDetail(false) }, [accountId])
  const data = snapshot && snapshot.owner === accountId ? snapshot.data : null
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(''); setSnapshot(null)
    if (!token || !accountId) { setLoading(false); setError('连接恢复后可查看用量'); return () => controller.abort() }
    void getAccountUsage(token, controller.signal).then(value => {
      if (!controller.signal.aborted && useAppStore.getState().authUser?.id === accountId) setSnapshot({ owner: accountId, data: value })
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '用量暂时无法读取') }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [token, accountId, retry])
  const ai = data?.ai, tokens = ai?.state === 'available' ? (ai.inputTokens ?? 0) + (ai.outputTokens ?? 0) : undefined
  return <>
    <div className="drawer-usage" aria-label="个人用量">
      <button type="button" className="drawer-usage-open" onClick={() => setDetail(true)} aria-label="查看个人用量详情"><span><strong>用量</strong><span>{loading ? '正在读取…' : error ? '暂未读取，点击重试' : `资料 ${usageBytes(data?.storage.bytes)} · AI ${usageNumber(tokens)} Tokens`}</span></span><ChevronRight size={18} aria-hidden="true" /></button>
    </div>
    {detail && createPortal(<BottomSheetSurface open={detail} onClose={() => setDetail(false)} label="个人用量详情" title="我的用量">
      {loading ? <p role="status">正在读取用量…</p> : error ? <div role="alert"><p>{error}</p><HohoButton variant="secondary" onClick={() => setRetry(value => value + 1)}>重新读取</HohoButton></div> : data && <div className="drawer-usage-detail">
        <section><h3>资料容量 <strong>{usageBytes(data.storage.bytes)}</strong></h3><p>占用估算 · {usageTime(data.storage.checkedAt)} 更新</p><dl><div><dt>记录与草稿</dt><dd>{usageBytes(data.storage.recordBytes)}</dd></div><div><dt>原件与媒体</dt><dd>{usageBytes(data.storage.fileBytes)}</dd></div></dl><p>包含你的记录、草稿和保留的原件；同一附件文件只计算一次。估算不包含系统备份和部分功能的数据，不作为收费依据。</p>{data.storage.state === 'partial' && <p role="status">部分资料暂时无法统计，当前数字不完整。</p>}</section>
        <section><h3>本月 AI <strong>{usageNumber(tokens)} Tokens</strong></h3>{ai?.state === 'unavailable' ? <p role="status">AI 用量台账暂时无法读取，未将未知用量计为 0。</p> : <><dl><div><dt>输入 Tokens</dt><dd>{usageNumber(ai?.inputTokens)}</dd></div><div><dt>输出 Tokens</dt><dd>{usageNumber(ai?.outputTokens)}</dd></div><div><dt>模型调用</dt><dd>{usageNumber(ai?.calls)} 次</dd></div><div><dt>语音时长回执</dt><dd>{ai?.audioReceipts ? `${usageNumber((ai.audioSeconds ?? 0) / 60)} 分钟` : '尚无回执'}</dd></div></dl><p>从 {usageTime(ai?.since)} 开始累计；按北京时间自然月统计，之前的消耗未补算。一次整理可能调用多次模型。</p>{Boolean(ai?.unknown) && <p role="status">{usageNumber(ai?.unknown)} 次调用未返回完整 Token 回执，显示的是已知用量。</p>}{ai?.incomplete && <p role="status">监控曾遇到保存失败，统计可能缺漏，不作为扣费依据。</p>}<p>语音只累计供应商返回的时长，实时语音暂未覆盖。失败请求可能产生供应商成本，这里仅作监控。</p></>}</section>
        <p className="drawer-usage-note">当前未启用付费套餐或自动扣费。用量统计不会影响已有记录的查看。</p>
        <HohoButton variant="secondary" onClick={() => setRetry(value => value + 1)}>重新读取</HohoButton>
      </div>}
    </BottomSheetSurface>, document.body)}
  </>
}
