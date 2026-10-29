import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { HohoButton, HohoSpotlightGuide } from '../../components/design-system'
import { useAppStore } from '../../store/useAppStore'
import { HELP_PAGE_TOURS } from './pageTours'
import './guidedRecord.css'

interface Progress { id: string; step: number; paused: boolean; start?: string }
export function HelpPageCoach() {
  const account = useAppStore(s => s.authUser?.id ?? ''), member = useAppStore(s => s.currentMemberId)
  return <ScopedCoach key={account + ':' + member} account={account} member={member}/>
}
function ScopedCoach({ account, member }: { account: string; member: string }) {
  const location = useLocation(), navigate = useNavigate()
  const storageKey = 'hoooho-help-page:' + encodeURIComponent(account) + ':' + encodeURIComponent(member)
  const [progress, setProgress] = useState<Progress | null>(() => {
    try { const p = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null'); return p && HELP_PAGE_TOURS[p.id] && Number.isInteger(p.step) && p.step >= 0 && p.step < HELP_PAGE_TOURS[p.id].steps.length ? { ...p, paused: Boolean(p.paused) } : null } catch { return null }
  })
  const [, refresh] = useState(0), started = useRef('')
  const update = (next: Progress | null) => { setProgress(next); try { if (next) sessionStorage.setItem(storageKey, JSON.stringify(next)); else sessionStorage.removeItem(storageKey) } catch { /* Guidance is optional; the original page stays usable. */ } }
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('helpTour')
    const entry = location.key + ':' + id
    if (!id || !HELP_PAGE_TOURS[id] || started.current === entry) return
    started.current = entry
    const start = (location.state as { helpTourStart?: string } | null)?.helpTourStart
    if (progress?.id === id && (!start || progress.start === start)) return
    update({ id, step: 0, paused: false, start })
  }, [location.key, location.search])
  if (!progress || !HELP_PAGE_TOURS[progress.id].paths.includes(location.pathname)) return null
  const tour = HELP_PAGE_TOURS[progress.id], current = tour.steps[progress.step]
  const end = () => {
    update(null)
    if (new URLSearchParams(location.search).has('helpTour')) { const search = new URLSearchParams(location.search); search.delete('helpTour'); navigate({ pathname:location.pathname, search:search.toString(), hash:location.hash }, { replace:true, state:location.state }) }
  }
  const next = () => progress.step < tour.steps.length - 1 ? update({ ...progress, step:progress.step + 1 }) : end()
  const interaction = (event: Event) => {
    refresh(v => v + 1)
    if (current.click && event.type === 'click' && (!current.interactionTarget || event.target instanceof Element && event.target.closest(current.interactionTarget))) next()
  }
  const inputReady = !current.input || current.targets.some(selector => Array.from(document.querySelectorAll<HTMLInputElement>(selector + ' input')).some(node => node.value.trim()))
  return progress.paused ? <div className="help-page-resume"><HohoButton size="small" onClick={() => update({ ...progress, paused:false })}>继续操作引导</HohoButton><HohoButton size="small" variant="text" onClick={end}>结束</HohoButton></div> : <HohoSpotlightGuide targets={current.targets} title={current.title} description={current.description} step={progress.step} total={tour.steps.length} nextLabel={progress.step === tour.steps.length - 1 ? '我已了解，继续操作' : '继续'} nextDisabled={!inputReady} onNext={current.click ? undefined : next} onPrevious={progress.step > 0 ? () => update({ ...progress, step:progress.step - 1 }) : undefined} onExit={() => update({ ...progress, paused:true })} onInteraction={interaction}/>
}
