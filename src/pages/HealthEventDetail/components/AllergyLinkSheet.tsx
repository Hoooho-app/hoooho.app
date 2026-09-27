import { Check, CircleHelp, Dog, Leaf, Link2, Pill, Utensils } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { BottomSheetSurface, HohoButton, HohoInput, StatusNotice } from '../../../components/design-system'
import {
  allergyCategoryLabels,
  linkJournalObservation,
  readAllergyArchive,
  serializeAllergyArchive,
  type AllergyCategory
} from '../../../features/health-profile/utils/allergyProfile'
import { readProfileSection, saveProfileSection } from '../../../services/profileSectionStorage'
import { useAppStore } from '../../../store/useAppStore'

const categories: Array<{ id: AllergyCategory; icon: typeof Utensils }> = [
  { id: 'food', icon: Utensils },
  { id: 'drug', icon: Pill },
  { id: 'animal', icon: Dog },
  { id: 'environment', icon: Leaf },
  { id: 'contact', icon: Link2 },
  { id: 'unknown', icon: CircleHelp }
]

interface AllergyLinkSheetProps {
  eventId: string
  memberId: string
  occurredAt: string
  onClose: () => void
  onLinked?: () => void
  open: boolean
  reaction: string
  recordId: string
}

export function AllergyLinkSheet({ eventId, memberId, occurredAt, onClose, onLinked, open, reaction, recordId }: AllergyLinkSheetProps) {
  const accountId = useAppStore((state) => state.authUser?.id ?? '')
  const [name, setName] = useState('')
  const [category, setCategory] = useState<AllergyCategory>('unknown')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const initialRecordId = useRef(recordId)

  useEffect(() => {
    if (!open || initialRecordId.current === recordId) return
    initialRecordId.current = recordId
    setName('')
    setCategory('unknown')
    setError('')
  }, [open, recordId])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const key = `hoho-health-profile:${memberId}:allergy`
      const archive = readAllergyArchive(readProfileSection(key), memberId, accountId)
      const items = linkJournalObservation(archive.items, {
        accountId,
        memberId,
        eventId,
        recordId,
        name,
        category,
        reaction,
        occurredAt
      })
      await saveProfileSection(key, serializeAllergyArchive({ ...archive, items }))
      onLinked?.()
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '关联失败，已填写内容仍保留，请重试')
    } finally {
      setSaving(false)
    }
  }

  return (
    <BottomSheetSurface
      className="allergy-journal-link-sheet"
      footer={<HohoButton form="allergy-journal-link-form" fullWidth loading={saving} size="large" type="submit">关联到过敏史</HohoButton>}
      label="标记为过敏相关"
      onClose={onClose}
      open={open}
      title="关联到过敏史"
    >
      <form className="allergy-journal-link-form" id="allergy-journal-link-form" onSubmit={submit}>
        <p>这条随记会作为可追溯的待排查线索，不会自动写成已明确过敏。</p>
        <HohoInput label="过敏对象（选填）" maxLength={60} onChange={(event) => setName(event.target.value)} placeholder="不清楚时可留空" value={name} />
        <fieldset>
          <legend>类别</legend>
          <div className="allergy-category-options">
            {categories.map(({ id, icon: Icon }) => (
              <button aria-pressed={category === id} key={id} onClick={() => setCategory(id)} type="button">
                <Icon />{allergyCategoryLabels[id]}{category === id && <Check />}
              </button>
            ))}
          </div>
        </fieldset>
        {!name.trim() && <small>未填写对象时，将保存为“尚未明确”。</small>}
        {error && <StatusNotice tone="error" title={error} />}
      </form>
    </BottomSheetSurface>
  )
}
