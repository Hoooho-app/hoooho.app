import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { BottomSheetSurface, HohoButton, StatusNotice } from '../../components/design-system'
import { createHealthProfilePromptSections } from '../../features/ask-ai'
import { getStoredHealthProfileSectionSnapshots } from '../../features/health-profile/utils/getHealthProfileSectionGroups'
import { useHealthEventDetail } from '../../hooks/useHealthEventDetail'
import { ActionSheet, ComingSoonPrompt } from '../HealthEventDetail/components'

interface NurseNextActionProps {
  currentMemberId: string
  eventId: string | null
  onClose: () => void
  open: boolean
}

export function NurseNextAction({ currentMemberId, eventId, onClose, open }: NurseNextActionProps) {
  const { state, retry } = useHealthEventDetail(open ? eventId ?? undefined : undefined)
  const [comingSoonOpen, setComingSoonOpen] = useState(false)
  const promptHealthProfile = useMemo(() => state.status === 'success'
    ? createHealthProfilePromptSections(getStoredHealthProfileSectionSnapshots(state.data.member.id))
    : [], [state])

  useEffect(() => {
    if (!open) setComingSoonOpen(false)
  }, [open])

  if (!open) return null

  if (!eventId || state.status === 'loading') {
    return (
      <NextActionStatusSheet onClose={onClose}>
        <StatusNotice title="正在准备下一步">正在读取当前健康事件…</StatusNotice>
      </NextActionStatusSheet>
    )
  }

  if (state.status === 'error') {
    return (
      <NextActionStatusSheet onClose={onClose}>
        <StatusNotice action={<HohoButton onClick={retry} size="small" variant="secondary">重新加载</HohoButton>} title="下一步加载失败" tone="error">{state.message}</StatusNotice>
      </NextActionStatusSheet>
    )
  }

  if (state.status === 'not-found' || state.data.eventDto.memberId !== currentMemberId) {
    return (
      <NextActionStatusSheet onClose={onClose}>
        <StatusNotice title="当前健康事件不可用" tone="error">请关闭后重试，或先在列表中确认当前人物的健康事件。</StatusNotice>
      </NextActionStatusSheet>
    )
  }

  const event = state.data.viewModel.event

  return (
    <>
      <ActionSheet
        context={{
          attachments: state.data.attachments,
          currentMemberId,
          event: { ...event, summary: state.data.eventDto.eventSummary?.displayedResult.summary ?? event.summary },
          healthProfile: promptHealthProfile,
          member: state.data.member,
          organizations: state.data.organizations,
          records: state.data.records,
          relatedEvents: state.data.relatedEvents,
        }}
        onClose={onClose}
        onComingSoon={() => setComingSoonOpen(true)}
        open={open}
      />
      <ComingSoonPrompt onClose={() => setComingSoonOpen(false)} open={comingSoonOpen} />
    </>
  )
}

function NextActionStatusSheet({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <BottomSheetSurface label="下一步" onClose={onClose} open title="下一步">
      {children}
    </BottomSheetSurface>
  )
}
