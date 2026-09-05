import { ChevronRight, LogOut, ShieldCheck, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Avatar } from '../common'
import { BottomSheetSurface, HohoButton, HohoSurfaceRow } from '../design-system'
import { maskEmail, maskPhone } from '../../services/account'
import { useAppStore } from '../../store/useAppStore'
import { authService } from '../../services/auth'

export function MembershipBadge() {
  return <span className="account-free-badge">免费版</span>
}

export function AccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAppStore((state) => state.authUser)
  const profile = useAppStore((state) => state.accountProfile)
  const clearAuthSession = useAppStore((state) => state.clearAuthSession)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const guest = !user || Boolean(user.guest)
  const login = () => {
    onClose()
    navigate('/login', { state: { from: `${location.pathname}${location.search}${location.hash}` } })
  }
  const openPage = (path: string) => { onClose(); navigate(path) }
  const logout = async () => {
    setLoggingOut(true)
    try {
      await authService.logout()
      clearAuthSession()
      setConfirmLogout(false)
      onClose()
      navigate('/login', { replace: true })
    } catch {
      setLogoutError('退出失败，请检查网络后重试')
    } finally { setLoggingOut(false) }
  }

  return (
    <BottomSheetSurface label={guest ? '登录或注册' : '账户'} onClose={onClose} open={open} title={guest ? '登录或注册' : '账户'}>
      {guest ? (
        <div className="grid gap-4">
          <p className="hoho-text-body">登录后可在不同设备查看记录；当前体验记录会自动、安全地合并到账户。</p>
          <HohoButton fullWidth size="large" onClick={login}>登录或注册</HohoButton>
          <HohoButton fullWidth size="large" variant="secondary" onClick={onClose}>继续体验</HohoButton>
        </div>
      ) : confirmLogout ? (
        <div className="grid gap-4">
          <p className="hoho-text-body">退出只会清理当前设备的登录状态，不会删除账户与健康记录。</p>
          {logoutError && <p role="alert">{logoutError}</p>}
          <HohoButton fullWidth loading={loggingOut} size="large" variant="danger" onClick={() => void logout()}>确认退出登录</HohoButton>
          <HohoButton fullWidth size="large" variant="secondary" onClick={() => setConfirmLogout(false)}>取消</HohoButton>
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="account-sheet-identity">
            <Avatar name={profile?.nickname ?? '用户'} src={profile?.avatar ?? undefined} size="lg" />
            <span className="min-w-0">
              <strong className="block truncate text-base font-semibold">{profile?.nickname ?? 'Hoooho 用户'} <span className="account-sync-badge">已同步</span></strong>
              <span className="mt-1 block truncate text-sm text-text-secondary">{profile?.email ? maskEmail(profile.email) : maskPhone(profile?.phone ?? null)}</span>
            </span>
          </div>
          <div className="settings-list">
            <HohoSurfaceRow leading={<ShieldCheck size={19} />} onActivate={() => openPage('/account/security')} title="账户与安全" />
            <HohoSurfaceRow leading={<Sparkles size={19} />} onActivate={() => openPage('/account/membership')} title="会员状态" value={<MembershipBadge />} />
          </div>
          <button className="account-sheet-logout" type="button" onClick={() => setConfirmLogout(true)}>
            <LogOut size={19} /><span className="flex-1">退出登录</span><ChevronRight size={18} />
          </button>
        </div>
      )}
    </BottomSheetSurface>
  )
}
