import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { HohoButton } from '../../components/design-system/HohoButton'
import { X } from '../../components/icons'
import { opsApiRequest } from '../../services/opsAuth'
import { formatBillingMetric, getCaptureImage, type BillingSource, type CaptureControl, type CaptureFrame, type CaptureRuntime, type CaptureSession } from '../../services/ops'
import { BILLING_FIELDS } from '../../../shared/ops-billing-catalog.mjs'
export function CaptureDialog({ source, token, onClose, onConnected }: { source: BillingSource; token: string; onClose: () => void; onConnected: (source: BillingSource) => void }) {
  const [runtime, setRuntime] = useState<CaptureRuntime | null>(null), [session, setSession] = useState<CaptureSession | null>(null)
  const [consent, setConsent] = useState(false), [confirmed, setConfirmed] = useState(false), [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [text, setText] = useState(''), [url, setUrl] = useState(''), [currency, setCurrency] = useState('USD'), [image, setImage] = useState(''), [preview, setPreview] = useState(''), [selecting, setSelecting] = useState(false)
  const [zoomed, setZoomed] = useState(() => typeof window !== 'undefined' && window.innerWidth < 600)
  const [inputStatus, setInputStatus] = useState(''), [pendingKeys, setPendingKeys] = useState<string[]>([])
  const [frameSession, setFrameSession] = useState<CaptureSession | null>(null)
  const visibleFrame = useRef<CaptureSession | null>(null), loadedImage = useRef('')
  const sessionRef = useRef<CaptureSession | null>(null), previewRef = useRef(''), alive = useRef(true), root = useRef<HTMLElement>(null)
  const busyRef = useRef(false), keyOrigins = useRef(new Map<string, number>()), operationVersion = useRef(0), pendingCount = useRef(0), queue = useRef<Promise<unknown>>(Promise.resolve())
  const edit = useRef<{ sessionId: string; epoch: number; controlId: string; text: string } | null>(null), editTimer = useRef<ReturnType<typeof setTimeout>>()
  const api = <T,>(path: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET', body?: unknown, signal?: AbortSignal) => opsApiRequest<T>(`/api/ops/capture${path}`, { token, method, signal, ...(body ? { body } : {}) })
  const clearEdit = () => { clearTimeout(editTimer.current); edit.current = null }
  const reportError = (cause: unknown) => { if (alive.current) setError(cause instanceof Error ? cause.message : '这一步未完成，请重试') }
  const publish = (value: CaptureSession) => {
    if (!alive.current) return false
    const current = sessionRef.current
    if (current && (current.id !== value.id || value.epoch < current.epoch || value.epoch === current.epoch && (value.revision ?? 0) < (current.revision ?? 0))) return false
    if (current && (value.epoch !== current.epoch || value.control?.id !== current.control?.id)) { clearEdit(); setInputStatus('') }
    sessionRef.current = value; setSession(value); return true
  }
  const refreshFrame = async (id: string, version: number, signal?: AbortSignal) => {
    const frame = await api<CaptureFrame>(`/sessions/${id}/frame`, 'GET', undefined, signal)
    if (signal?.aborted || operationVersion.current !== version || sessionRef.current?.id !== id) return
    if (publish(frame.session)) { if (loadedImage.current === frame.imageDataUrl) visibleFrame.current = frame.session; setFrameSession(frame.session); setImage(frame.imageDataUrl) }
  }
  const dispatch = (body: Record<string, unknown>, binding?: { sessionId: string; epoch: number }) => {
    const id = binding?.sessionId ?? sessionRef.current?.id, version = ++operationVersion.current
    pendingCount.current++
    const operation = queue.current.then(async () => {
      const current = sessionRef.current
      if (!alive.current || !current || current.id !== id || binding && binding.epoch !== current.epoch) throw new Error('页面已改变，请重新点击要操作的控件')
      const value = await api<CaptureSession>(`/sessions/${current.id}/actions`, 'POST', { ...body, epoch: binding?.epoch ?? current.epoch })
      if (!alive.current) return
      publish(value)
      await refreshFrame(current.id, version)
      if (body.action === 'fill' && !edit.current) setInputStatus('已同步到平台输入框')
      return value
    }).finally(() => { pendingCount.current-- })
    queue.current = operation.catch(() => {})
    return operation
  }
  const flushEdit = () => {
    clearTimeout(editTimer.current)
    const value = edit.current; edit.current = null
    if (!value) return queue.current
    setInputStatus('正在同步输入…')
    return dispatch({ action: 'fill', controlId: value.controlId, text: value.text }, value).catch(cause => {
      const current = sessionRef.current, code = (cause as { code?: string }).code
      if (alive.current && !edit.current && current?.id === value.sessionId && current.epoch === value.epoch && current.control?.id === value.controlId && !['CAPTURE_FOCUS_CHANGED','CAPTURE_PAGE_CHANGED','CAPTURE_SESSION_ENDED'].includes(code ?? '')) edit.current = value
      setInputStatus('输入尚未同步，请重试'); throw cause
    })
  }
  const editControl = (control: CaptureControl, value: string) => {
    if (keyOrigins.current.has(control.id)) return
    const current = sessionRef.current; if (!current) return
    setError(''); setInputStatus('正在输入…')
    edit.current = { sessionId: current.id, epoch: current.epoch, controlId: control.id, text: value }
    clearTimeout(editTimer.current); editTimer.current = setTimeout(() => void flushEdit().catch(reportError), 180)
  }
  useEffect(() => { alive.current = true; void api<CaptureRuntime>('/runtime').then(setRuntime).catch(reportError); root.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => { alive.current = false; clearEdit(); if (previewRef.current) URL.revokeObjectURL(previewRef.current); const id = sessionRef.current?.id; sessionRef.current = null; if (id) void api(`/sessions/${id}`, 'DELETE').catch(() => {}) }
  }, [source.id, token])
  useEffect(() => { if (session?.url) setUrl(session.url) }, [session?.url])
  useEffect(() => { const candidates = session?.analysis?.candidates; setSelected(candidates?.map(c => c.key) ?? []); setConfirmed(false) }, [session?.analysis?.version])
  useEffect(() => {
    if (!session?.id) return
    const controller = new AbortController(); let waiting = false
    const poll = async () => { if (waiting || pendingCount.current || edit.current || busyRef.current || document.visibilityState === 'hidden') return; waiting = true
      try { await refreshFrame(session.id, operationVersion.current, controller.signal) }
      catch (e) { if (!controller.signal.aborted) { reportError(e); if ((e as { status?: number }).status === 410) { clearEdit(); sessionRef.current = null; setSession(null); setImage('') } } } finally { waiting = false }
    }
    void poll(); const timer = window.setInterval(() => void poll(), 1800)
    return () => { controller.abort(); clearInterval(timer) }
  }, [session?.id, token])
  const run = async (operation: () => Promise<void>) => { if (busyRef.current) return; busyRef.current = true; setBusy(true); setError(''); try { await flushEdit(); await operation() } catch (e) { reportError(e) } finally { busyRef.current = false; if (alive.current) setBusy(false) } }
  const start = () => run(async () => { const value = await api<CaptureSession>('/sessions', 'POST', { sourceId: source.id, consent }); if (!alive.current) { void api(`/sessions/${value.id}`, 'DELETE').catch(() => {}); return }; setImage(''); visibleFrame.current = null; loadedImage.current = ''; setFrameSession(null); setPreview(''); publish(value); setCurrency(value.currency); await refreshFrame(value.id, operationVersion.current) })
  const action = (body: Record<string, unknown>, displayed?: CaptureSession) => { const current = displayed ?? sessionRef.current; if (!current) return Promise.resolve(); const binding = { sessionId: current.id, epoch: current.epoch }; return run(async () => { await dispatch(body, binding); if (body.action === 'text') setText('') }) }
  const remoteKey = (key: string) => {
    const current = sessionRef.current; if (!current) return
    const binding = { sessionId: current.id, epoch: current.epoch }, origin = current.control?.id ?? ''
    keyOrigins.current.set(origin, (keyOrigins.current.get(origin) ?? 0) + 1); setPendingKeys([...keyOrigins.current.keys()]); setError('')
    void (async () => { await flushEdit(); await dispatch({ action: 'key', key }, binding) })().catch(reportError).finally(() => {
      const remaining = (keyOrigins.current.get(origin) ?? 1) - 1
      if (remaining) keyOrigins.current.set(origin, remaining); else keyOrigins.current.delete(origin)
      if (alive.current) setPendingKeys([...keyOrigins.current.keys()])
    })
  }
  const analyze = () => run(async () => { const current = sessionRef.current; if (!current) return; const value = await api<CaptureSession>(`/sessions/${current.id}/analyze`, 'POST', { currency }); publish(value); const blob = await getCaptureImage(token, current.id, true); const next = URL.createObjectURL(blob); if (previewRef.current) URL.revokeObjectURL(previewRef.current); previewRef.current = next; setPreview(next) })
  const save = () => run(async () => { const current = sessionRef.current; if (!current?.analysis) return; const value = await api<{ source: BillingSource }>(`/sessions/${current.id}/commit`, 'POST', { version: current.analysis.version, fields: selected, privacyConfirmed: confirmed }); sessionRef.current = null; onConnected(value.source) })
  const close = () => { if (!busyRef.current) onClose() }
  return <div className="ops-capture-layer"><section ref={root} className="ops-capture-dialog" role="dialog" aria-modal="true" aria-label={`${source.name} 连接采集`} onKeyDown={event => { if (event.key !== 'Tab') return; const nodes = root.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href]'); if (!nodes?.length) return; const first = nodes[0], last = nodes[nodes.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() } }}>
    <header><div><h2>{source.name} · 连接采集</h2><p>本人完成一次登录，核对账单后由后台持续更新</p></div><button type="button" onClick={close} disabled={busy} aria-label="关闭授权窗口"><X/></button></header>
    {error && <p className="ops-form-error ops-capture-error" role="alert">{error}</p>}
    {!session ? <div className="ops-capture-intro"><h3>授权登录与账单读取</h3><p>登录窗口运行在独立的私有采集服务中，只用于你选择的平台。登录状态会保留，日常无需手动上传。密码、验证码请在窗口内本人输入。</p><p>系统不会自动付款、续费、改套餐或绕过平台验证。</p><div className="ops-capture-runtime"><strong>{runtime?.verified ? '采集环境检查通过' : runtime?.available ? '私有采集服务可用' : runtime ? '采集服务暂时无法连接' : '正在检查采集服务…'}</strong><HohoButton variant="secondary" loading={busy} onClick={() => void run(async () => setRuntime(await api<CaptureRuntime>('/runtime/check', 'POST')))}>检查采集环境</HohoButton></div>
      <label className="ops-capture-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/><span>我同意将该平台的登录状态保留在私有采集服务中，用于读取账单和用量。</span></label><HohoButton disabled={!consent || !runtime?.available} loading={busy} onClick={start}>打开平台授权窗口</HohoButton>
    </div> : <div className="ops-capture-workbench"><div className="ops-capture-browser"><div className="ops-capture-address"><button type="button" disabled={busy} onClick={() => void action({ action: 'back' })}>返回</button><input aria-label="平台页面地址" value={url} onChange={e => setUrl(e.target.value)}/><button type="button" disabled={busy} onClick={() => void action({ action: 'navigate', url })}>打开</button></div>
      <p className="ops-capture-hint">{selecting ? '点击包含费用名称和值的面板，选好后再读取账单。' : '点击画面中的输入框，可在原位直接输入或粘贴；Tab 切换输入框，Enter 确认。验证码由你本人填写。'}</p>
      <div className="ops-capture-screen" data-zoom={zoomed} aria-busy={busy}><div className="ops-capture-canvas">{image ? <><img src={image} alt="私有平台授权与账单窗口" draggable={false} data-selecting={selecting} onLoad={event => { loadedImage.current = event.currentTarget.src; visibleFrame.current = frameSession }} onClick={event => { const displayed = visibleFrame.current; if (busyRef.current || !displayed) return; const box = event.currentTarget.getBoundingClientRect(); void action({ action: selecting ? 'region' : 'click', x: (event.clientX - box.left) / box.width * displayed.width, y: (event.clientY - box.top) / box.height * displayed.height }, displayed); if (selecting) setSelecting(false) }}/>{session.control && !selecting && <RemoteInput key={session.control.id} control={session.control} pending={pendingKeys.includes(session.control.id)} width={session.width} height={session.height} onEdit={value => editControl(session.control!, value)} onFlush={() => void flushEdit().catch(reportError)} onKey={remoteKey}/>}</> : <p role="status">正在读取授权画面…</p>}</div></div>
      <p className="ops-capture-focus" role="status">{busy ? '正在执行操作…' : session.control ? `已选中：${session.control.label}。${inputStatus || '可直接输入、粘贴或按 Tab 切换。'}` : '点击画面中的输入框或按钮进行操作。'}</p>
      {!session.control && <form className="ops-capture-input" onSubmit={event => { event.preventDefault(); void action({ action: 'text', text }) }}><input type="password" autoComplete="off" aria-label="输入到平台选中框" placeholder="输入内容后发送到选中的输入框" value={text} disabled={busy} onChange={e => setText(e.target.value)}/><HohoButton type="submit" variant="secondary" disabled={busy || !text}>发送输入</HohoButton></form>}
      <div className="ops-capture-keys"><button type="button" onClick={()=>setZoomed(!zoomed)}>{zoomed?'适应画面':'放大画面'}</button>{[{ key: 'Tab', title: '切换输入框' }, { key: 'Enter', title: 'Enter' }, { key: 'Backspace', title: '退格' }, { key: 'Control+A', title: '全选' }, { key: 'Escape', title: 'Esc' }].filter(item => !session.control || ['Tab','Enter','Escape'].includes(item.key)).map(item => <button type="button" key={item.key} disabled={busy} onClick={() => ['Tab','Enter'].includes(item.key) ? remoteKey(item.key) : void action({ action: 'key', key: item.key })}>{item.title}</button>)}<button type="button" disabled={busy} onClick={() => void action({ action: 'scroll', delta: -650 })}>向上滚动</button><button type="button" disabled={busy} onClick={() => void action({ action: 'scroll', delta: 650 })}>向下滚动</button></div>
    </div><aside className="ops-capture-review"><h3>登录后进入账单页</h3><p>系统按明确字段读取，不会把没有的数据补成 0。页面未找到字段时，可以选择账单区域后重读。</p><label>账单币种<select aria-label="账单币种" value={currency} disabled={busy} onChange={e => { setCurrency(e.target.value); setConfirmed(false) }}>{['USD','CNY','EUR','GBP','JPY','AUD','CAD','HKD','SGD'].map(code => <option key={code}>{code}</option>)}</select></label><div className="ops-capture-review-actions"><HohoButton variant="secondary" disabled={busy} onClick={() => setSelecting(!selecting)}>{selecting ? '取消选择' : '选择账单区域'}</HohoButton><HohoButton loading={busy} onClick={analyze}>读取当前账单</HohoButton></div>
      {session.analysis && <><h3>读取结果</h3><ul className="ops-capture-candidates">{session.analysis.candidates.map(candidate => <li key={candidate.key}><label><input type="checkbox" checked={selected.includes(candidate.key)} onChange={e => setSelected(all => e.target.checked ? [...all,candidate.key] : all.filter(key => key !== candidate.key))}/><span>{candidate.label}<strong>{formatBillingMetric(candidate.parsed, BILLING_FIELDS[candidate.key]?.kind ?? 'text')}</strong></span></label></li>)}</ul>{preview && <img className="ops-capture-preview" src={preview} alt="已遮罩的账单采集区域预览"/>}<label className="ops-capture-consent"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/><span>读取结果与账单一致，截图已隐藏账号、卡片等无关信息。</span></label><HohoButton loading={busy} disabled={!confirmed || !selected.length} onClick={save}>保存连接并立即采集</HohoButton></>}
    </aside></div>}
  </section></div>
}

function RemoteInput({ control, pending, width, height, onEdit, onFlush, onKey }: { control: CaptureControl; pending: boolean; width: number; height: number; onEdit: (value: string) => void; onFlush: () => void; onKey: (key: string) => void }) {
  const [draft, setDraft] = useState(''), field = useRef<HTMLInputElement & HTMLTextAreaElement>(null), composing = useRef(false)
  useEffect(() => { field.current?.focus({ preventScroll: true }) }, [control.id])
  const keyDown = (event: KeyboardEvent) => {
    if (composing.current || event.nativeEvent.isComposing) return
    if (event.key === 'Tab' || event.key === 'Enter' && !control.multiline) { event.preventDefault(); event.stopPropagation(); onKey(event.key === 'Tab' && event.shiftKey ? 'Shift+Tab' : event.key) }
  }
  const shared = { ref: field, readOnly: pending, className: 'ops-capture-direct-input', style: { left: `${control.rect.x / width * 100}%`, top: `${control.rect.y / height * 100}%`, width: `${control.rect.width / width * 100}%`, height: `${control.rect.height / height * 100}%` }, 'aria-label': `平台输入：${control.label}`, autoComplete: 'off', spellCheck: false, maxLength: 2048, value: draft, placeholder: control.hasValue ? '已有内容，输入后替换' : control.label, onBlur: onFlush, onKeyDown: keyDown, onCompositionStart: () => { composing.current = true }, onCompositionEnd: (event: React.CompositionEvent<HTMLInputElement | HTMLTextAreaElement>) => { composing.current = false; onEdit(event.currentTarget.value) }, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { const value = event.currentTarget.value; setDraft(value); if (!composing.current) onEdit(value) } }
  return control.multiline ? <textarea {...shared}/> : <input {...shared} type={control.type === 'password' ? 'password' : 'text'} inputMode={control.type === 'email' ? 'email' : control.type === 'number' || control.type === 'tel' ? 'numeric' : 'text'}/>
}
