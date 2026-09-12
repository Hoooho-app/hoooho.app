interface LegacyNurseNextActionProps {
  currentMemberId: string
  eventId: string | null
  onClose: () => void
  open: boolean
}

/** @deprecated The visit summary is now a routed page. Kept until the journal shell is split into smaller render blocks. */
export function NurseNextAction(_props: LegacyNurseNextActionProps) { return null }
