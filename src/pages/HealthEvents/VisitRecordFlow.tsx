import { VisitMaterialsWorkspace } from '../../features/visit-materials/VisitMaterialsWorkspace'
import type { JournalMetadata } from '../../types/journal'
import type { QuickRecordPhotoPayload } from '../HealthEventDetail/components/QuickRecordPhotos'

export function VisitRecordFlow({ memberId, token, onBack, onClose, onSaved, onViewRecord }: {
  memberId: string; token: string; selectedDay: string; today: string
  onViewRecord?: (eventId: string, recordId: string) => void
  onBack: () => void; onClose: () => void; onSaved: (message: string) => void
  onConfirm: (content: string, occurredAt: string, channel: 'text', photos: QuickRecordPhotoPayload, journal: JournalMetadata) => Promise<string>
}) {
  return <VisitMaterialsWorkspace memberId={memberId} token={token} onBack={onBack} onClose={onClose} onSaved={onSaved} onViewRecord={onViewRecord}/>
}
