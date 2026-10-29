import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { HohoButton } from '../../components/design-system'
import sproutArt from '../../assets/care-journey/two-leaf-sprout-20261030.webp'
import { careApi } from '../../features/care-journey/api'
import { useCareJourney } from '../../features/care-journey/useCareJourney'
import { useAppStore } from '../../store/useAppStore'
import { getGuardedDays } from './nurseStationView'

export function FrontDeskCareCard() {
  const state = useCareJourney()
  const createdAt = useAppStore(s => s.members.find(member => member.id === s.currentMemberId)?.createdAt)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const update = () => { if (document.visibilityState === 'visible') setNow(new Date()) }
    const timer = window.setInterval(update, 60000)
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update) }
  }, [])
  const checkedIn = state.data?.today.checkedIn ?? false
  const claim = () => {
    if (!state.data) void state.refresh()
    else void state.mutate('check-in', careApi.checkIn)
  }
  return <article className="front-desk-welcome__entry front-desk-welcome__care" aria-label="今日呵护">
    <Link className="front-desk-welcome__care-link" to="/care-journey" aria-label="今日呵护：查看任务"/>
    <span className="front-desk-welcome__eyebrow">今日呵护</span>
    <strong>已守护 {getGuardedDays(createdAt, now)} 天</strong>
    <span className="front-desk-welcome__excerpt" role="status">{state.error ? '暂未确认，请重试' : checkedIn ? '今天的呵护已记下' : '每日领取 1 个树芽'}</span>
    <div className="front-desk-welcome__care-claim">
      <HohoButton size="small" variant="tertiary" loading={Boolean(state.busy)} disabled={state.loading || checkedIn} onClick={claim}>
        <img className="front-desk-welcome__care-sprout" src={sproutArt} width={28} height={28} alt="" aria-hidden="true"/>
        {checkedIn ? '今日已领取' : state.loading ? '正在读取' : state.error ? state.data ? '重试领取' : '重新读取' : '领取树苗'}
      </HohoButton>
    </div>
  </article>
}
