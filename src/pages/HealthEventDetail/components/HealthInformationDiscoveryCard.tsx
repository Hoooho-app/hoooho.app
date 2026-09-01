import { BookmarkPlus, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { discoveryCardCopy } from '../../../features/health-information/candidatePresentation'
import type { HealthInformationCandidateApiDto } from '../../../types'

export function HealthInformationDiscoveryCard({ eventId, items }: { eventId: string; items: HealthInformationCandidateApiDto[] }) {
  const navigate = useNavigate()
  const copy = discoveryCardCopy(items)
  if (!copy.visible) return null
  return (
    <button className="health-information-discovery" onClick={() => navigate(`/health-events/${encodeURIComponent(eventId)}/health-information`)} type="button">
      <span className="health-information-discovery__icon"><BookmarkPlus aria-hidden="true" size={19} strokeWidth={1.7} /></span>
      <span className="min-w-0 flex-1 text-left"><strong>{copy.title}</strong><span>{copy.description}</span></span>
      <span className="health-information-discovery__action">查看<ChevronRight aria-hidden="true" size={17} /></span>
    </button>
  )
}
