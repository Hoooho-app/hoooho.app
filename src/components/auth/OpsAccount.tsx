import { LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/useAppStore'
import './ops-auth.css'

export function OpsAccount() {
  const email = useAppStore((state) => state.opsAuthUser?.email)
  const clearSession = useAppStore((state) => state.clearOpsAuthSession)
  const navigate = useNavigate()
  const logout = () => {
    clearSession()
    navigate('/ops/login', { replace: true })
  }
  return <div className="ops-account"><span>{email}</span><button type="button" onClick={logout}><LogOut aria-hidden="true" size={15}/>退出登录</button></div>
}
