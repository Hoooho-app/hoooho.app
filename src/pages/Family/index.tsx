import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { WebPageHeader } from '../../components/common'
import { ConfirmDialog } from '../../components/design-system'
import { FamilyMemberSwipeRow } from '../../components/family/FamilyMemberSwipeRow'
import { RecordSubjectCard } from '../../components/health'
import { isSafeReturnPath, type FamilyLocationState } from '../../components/navigation/navigationState'
import { ApiRequestError } from '../../services/apiClient'
import { familyMemberService } from '../../services/familyMembers'
import { adaptFamilyMember } from '../../services/healthEventDetailAdapter'
import { useAppStore } from '../../store/useAppStore'
import type { FamilyMemberApiDto, Member } from '../../types'
import { formatAgeFromBirthday } from '../../utils/formatAgeFromBirthday'

import { EditFamilyMemberPage } from './EditFamilyMemberPage'
export { EditFamilyMemberPage }

const genderLabel = { male: '男', female: '女', undisclosed: '不方便透露', '': '未填写' } as const

export function FamilyPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const token = useAppStore((state) => state.authToken)
  const members = useAppStore((state) => state.members)
  const currentMemberId = useAppStore((state) => state.currentMemberId)
  const setCurrentMemberId = useAppStore((state) => state.setCurrentMemberId)
  const setMembers = useAppStore((state) => state.setMembers)
  const clearAuthSession = useAppStore((state) => state.clearAuthSession)
  const clearProfile = useAppStore((state) => state.clearProfile)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [openMemberId, setOpenMemberId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Member | null>(null)
  const [deleting, setDeleting] = useState(false)

  const switchMember = (member: Member) => {
    setCurrentMemberId(member.id)
    const entry = (location.state as FamilyLocationState | null)?.familyEntry
    const returnTo = isSafeReturnPath(entry?.returnTo) ? entry.returnTo : '/health-events'
    navigate(returnTo, {
      replace: true,
      state: {
        memberSwitchResult: {
          memberName: member.name,
          reopenDrawer: entry?.reopenDrawer === true
        }
      }
    })
  }

  useEffect(() => {
    if (!token) return
    const controller = new AbortController()
    familyMemberService.list(token, controller.signal)
      .then((items) => setMembers(items.map(adaptFamilyMember)))
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return
        if (requestError instanceof ApiRequestError && requestError.status === 401) {
          clearAuthSession()
          navigate('/login', { replace: true })
          return
        }
        setError(requestError instanceof Error ? requestError.message : '家庭成员加载失败')
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [clearAuthSession, navigate, setMembers, token])

  const removeMember = async () => {
    if (!token || !pendingDelete || deleting) return
    setDeleting(true)
    setDeleteError('')
    try {
      await familyMemberService.delete(pendingDelete.id, token)
      const remaining = members.filter((member) => member.id !== pendingDelete.id)
      setMembers(remaining)
      if (remaining.length === 0) clearProfile()
      else if (currentMemberId === pendingDelete.id) setCurrentMemberId(remaining[0].id)
      setPendingDelete(null)
      setOpenMemberId(null)
    } catch (requestError) {
      if (requestError instanceof ApiRequestError && requestError.status === 401) {
        clearAuthSession()
        navigate('/login', { replace: true })
        return
      }
      setPendingDelete(null)
      setDeleteError(requestError instanceof Error ? requestError.message : '删除失败，请重试')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
    <main className="app-shell family-page pb-0">
      <WebPageHeader title="我的家人" fallback="/health-events" action={
        <button className="inline-flex min-h-11 items-center gap-1 whitespace-nowrap text-[13px] font-medium text-primary" type="button" onClick={() => navigate('/family/new')}><Plus aria-hidden="true" size={16} />添加家人</button>
      } />
      <div className="family-page__content space-y-3 px-4 py-4">
        {loading && <p className="py-12 text-center text-sm text-text-secondary">正在加载家人…</p>}
        {error && <p className="py-8 text-center text-sm text-danger">{error}</p>}
        {deleteError && <p className="py-3 text-center text-sm text-danger" role="alert">{deleteError}</p>}
        {!loading && !error && members.map((member) => {
          const current = member.id === currentMemberId
          return (
            <FamilyMemberSwipeRow
              key={member.id}
              name={member.name}
              onDelete={() => { setOpenMemberId(null); setPendingDelete(member) }}
              onOpenChange={(open) => setOpenMemberId(open ? member.id : null)}
              open={openMemberId === member.id}
            >
              <RecordSubjectCard
                action={current
                  ? <span className="rounded-pill bg-primary-soft px-2.5 py-1.5 text-xs font-medium text-primary">当前</span>
                  : <button className="rounded-pill border border-text-primary px-2.5 py-1.5 text-xs font-medium text-text-primary" type="button" onClick={() => switchMember(member)}>切换</button>}
                age={member.birthday ? formatAgeFromBirthday(member.birthday) : member.age}
                avatar={member.avatar}
                gender={genderLabel[member.gender ?? '']}
                label=""
                name={member.name}
              />
            </FamilyMemberSwipeRow>
          )
        })}
      </div>
    </main>
    <ConfirmDialog
      confirmLabel="确认删除"
      danger
      description={pendingDelete ? `删除后，${pendingDelete.name}的资料及相关健康记录将无法恢复。` : ''}
      loading={deleting}
      onCancel={() => setPendingDelete(null)}
      onConfirm={() => void removeMember()}
      open={Boolean(pendingDelete)}
      title={pendingDelete ? `删除${pendingDelete.name}？` : '删除家人？'}
    />
    </>
  )
}

export function AddFamilyMemberPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const addMember = useAppStore((state) => state.addMember)
  const setCurrentMemberId = useAppStore((state) => state.setCurrentMemberId)

  const onCreated = (created: FamilyMemberApiDto) => {
    addMember(adaptFamilyMember(created))
    const firstUseEntry = (location.state as { firstUseEntry?: { continueToRecord?: boolean; returnTo?: string } } | null)?.firstUseEntry
    if (firstUseEntry?.continueToRecord) {
      setCurrentMemberId(created.id)
      navigate('/health-events', { replace: true, state: { openQuickRecord: true } })
    } else if (firstUseEntry?.returnTo === '/health-events') {
      setCurrentMemberId(created.id)
      navigate('/health-events', { replace: true })
    } else {
      navigate('/family', { replace: true })
    }
  }

  return <EditFamilyMemberPage key="create" create onCreated={onCreated} />
}
