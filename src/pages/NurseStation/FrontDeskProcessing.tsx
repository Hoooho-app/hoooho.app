import { useEffect, useState } from 'react'
import { NurseStationIdleVideo } from '../HealthEvents/NurseStationIdleVideo'
import { useSettingsStore } from '../../store/useSettingsStore'

export function FrontDeskProcessing() {
  const care = useSettingsStore(s => s.care)
  const [visible, setVisible] = useState(!document.hidden)
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(query.matches)
    const visibility = () => setVisible(!document.hidden)
    update()
    query.addEventListener('change', update)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      query.removeEventListener('change', update)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [])
  return <div className="front-desk-processing" role="status" aria-label="护士正在整理记录">
    <NurseStationIdleVideo active={visible} reducedMotion={reduced || (care.enabled && care.reduceMotion)}/>
    <div><p>嗯，我了解了，我整理一下。</p><span>整理中</span></div>
  </div>
}
