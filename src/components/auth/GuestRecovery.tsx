import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HohoButton } from '../design-system/HohoButton'
import { postAuthRequest } from '../../services/auth'
import { restoreBrowserSession } from './SessionBootstrap'
import type { AuthSession } from '../../types'

function generateCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (value) => value.toString(16).padStart(2, '0')).join('')
}

export function GuestRecovery({ mode }: { mode: 'issue' | 'restore' }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [nextCode, setNextCode] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const [message, setMessage] = useState('')
  const run = async (revoke = false) => {
    if (lock.current) return
    lock.current = true; setBusy(true); setMessage('')
    try {
      await postAuthRequest<AuthSession | { success: true }>('/api/auth/guest-recovery', { mode: revoke ? 'revoke' : mode, code, nextCode })
      if (mode === 'restore' && !revoke) {
        const session = await restoreBrowserSession()
        if (!session) throw new Error('浏览器未能保存会话。请保留新恢复码，再次恢复时使用新码。')
        navigate('/health-events', { replace: true })
      } else {
        setNextCode(''); setSaved(false); setOpen(false)
        setMessage(revoke ? '恢复码已停用' : '恢复码已启用，有效期180天，请妥善保管')
      }
    } catch (error) {
      setMessage((error instanceof Error ? error.message : '操作失败，请稍后重试') + ' 若响应丢失，请保留新旧两份恢复码，先尝试新码。')
    } finally { lock.current = false; setBusy(false) }
  }
  return <section className="mt-4 space-y-3" aria-label="游客恢复码">
    {!open && <HohoButton fullWidth variant="text" onClick={() => { setNextCode(generateCode()); setSaved(false); setOpen(true); setMessage('') }}>
      {mode === 'issue' ? '生成或更换体验恢复码' : '用恢复码找回体验记录'}
    </HohoButton>}
    {open && <>
      {mode === 'restore' && <label className="block text-sm">原恢复码
        <textarea aria-label="原恢复码" className="mt-2 w-full rounded-control border p-3 text-base" value={code} onChange={(e) => setCode(e.target.value)} maxLength={160} autoComplete="off" spellCheck={false} disabled={busy} />
      </label>}
      <p className="text-sm">请先将下面的新恢复码保存到密码管理器或其他安全位置。持有码的人可以访问你的体验记录，请勿分享。启用后旧码失效，有效期180天。</p>
      <label className="block text-sm">新恢复码
        <textarea aria-label="新恢复码" className="mt-2 w-full rounded-control border p-3 text-base" readOnly value={nextCode} autoComplete="off" spellCheck={false} />
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={saved} disabled={busy} onChange={(e) => setSaved(e.target.checked)} />我已在浏览器之外保存新恢复码</label>
      <HohoButton fullWidth loading={busy} disabled={!saved || (mode === 'restore' && !/^[a-f0-9]{64}$/i.test(code.replace(/[\s-]/g, '')))} onClick={() => void run()}>{mode === 'issue' ? '启用新恢复码' : '恢复记录并启用新码'}</HohoButton>
      {mode === 'issue' && <HohoButton fullWidth variant="text" disabled={busy} onClick={() => void run(true)}>停用恢复码</HohoButton>}
      <HohoButton fullWidth variant="text" disabled={busy} onClick={() => { setOpen(false); setNextCode(''); setCode('') }}>收起</HohoButton>
    </>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>
}
