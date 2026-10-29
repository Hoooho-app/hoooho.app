import { ArrowLeft } from '../../components/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import { organizeBackTarget } from './navigation'
import './organize.css'

export function OrganizeHeader({ title, className = '' }: { title: string; className?: string }) {
  const location = useLocation(), navigate = useNavigate()
  function back() {
    const target = organizeBackTarget(location.state, window.history.state?.idx)
    if ('delta' in target) navigate(target.delta)
    else navigate(target.path, { replace: true, state: target.state })
  }
  return <header className={`organize-page-header ${className}`}><button type="button" aria-label="返回" onClick={back}><ArrowLeft size={20} aria-hidden="true" /></button><h1>{title}</h1><span aria-hidden="true" /></header>
}
