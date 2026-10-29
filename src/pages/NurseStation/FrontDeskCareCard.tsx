import { Link } from 'react-router-dom'
import { HohoButton } from '../../components/design-system'
import { careApi } from '../../features/care-journey/api'
import { useCareJourney } from '../../features/care-journey/useCareJourney'

export function FrontDeskCareCard() {
  const state = useCareJourney()
  const checkedIn = state.data?.today.checkedIn ?? false
  const claim = () => {
    if (!state.data) void state.refresh()
    else void state.mutate('check-in', careApi.checkIn)
  }
  return <article className="front-desk-welcome__entry front-desk-welcome__care" aria-label="今日呵护">
    <Link className="front-desk-welcome__care-link" to="/care-journey" aria-label="今日呵护：查看任务"/>
    <span className="front-desk-welcome__eyebrow">今日呵护</span>
    <strong>已守护 {state.data?.careDays ?? '—'} 天</strong>
    <span className="front-desk-welcome__excerpt" role="status">{state.error ? '暂未确认，请重试' : checkedIn ? '今天的呵护已记下' : '每日领取 1 个树芽'}</span>
    <div className="front-desk-welcome__care-claim">
      <HohoButton size="small" loading={Boolean(state.busy)} disabled={state.loading || checkedIn} onClick={claim}>
        {checkedIn ? '今日已领取' : state.loading ? '正在读取' : state.error ? state.data ? '重试领取' : '重新读取' : '领取小树苗'}
      </HohoButton>
    </div>
  </article>
}
