import { useLocation, useNavigate } from 'react-router-dom'
import { APP_HOME_PATH } from '../../components/navigation/navigationState'
import { adaptFamilyMember } from '../../services/healthEventDetailAdapter'
import { useAppStore } from '../../store/useAppStore'
import type { FamilyMemberApiDto } from '../../types'
import { EditFamilyMemberPage } from './EditFamilyMemberPage'

export { EditFamilyMemberPage }

export function AddFamilyMemberPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const addMember = useAppStore((state) => state.addMember)
  const setCurrentMemberId = useAppStore((state) => state.setCurrentMemberId)

  const onCreated = (created: FamilyMemberApiDto) => {
    addMember(adaptFamilyMember(created))
    setCurrentMemberId(created.id)
    const entry = (location.state as { firstUseEntry?: { continueToRecord?: boolean; returnTo?: string } } | null)?.firstUseEntry
    if (entry?.continueToRecord) {
      navigate('/health-events', { replace: true, state: { openQuickRecord: true } })
      return
    }
    const returnTo = entry?.returnTo === '/health-events' || entry?.returnTo === APP_HOME_PATH ? entry.returnTo : APP_HOME_PATH
    navigate(returnTo, { replace: true })
  }

  return <EditFamilyMemberPage key="create" create onCreated={onCreated} />
}
