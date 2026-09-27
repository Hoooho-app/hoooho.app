import { Droplets, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { HohoButton } from '../../components/design-system'
import { ProfileChoiceGroup } from '../HealthProfile/profile-sections/ProfileSectionPatterns'
import { familyMemberService } from '../../services/familyMembers'
import { adaptFamilyMember } from '../../services/healthEventDetailAdapter'
import { useAppStore } from '../../store/useAppStore'
import type { Member } from '../../types'

interface BloodTypeEditorSheetProps {
  member: Member
  onClose: () => void
  onSaved: () => void
  token: string
}

const bloodTypeLabels = { A: 'A型', B: 'B型', AB: 'AB型', O: 'O型' } as const

export function BloodTypeEditorSheet({ member, onClose, onSaved, token }: BloodTypeEditorSheetProps) {
  const [bloodType, setBloodType] = useState(member.bloodType ? bloodTypeLabels[member.bloodType] : '')
  const [rhBloodType, setRhBloodType] = useState(member.rhBloodType === 'positive' ? '阳性' : member.rhBloodType === 'negative' ? '阴性' : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', keyDown)
    return () => window.removeEventListener('keydown', keyDown)
  }, [onClose, saving])

  const save = async () => {
    if (saving || !token || useAppStore.getState().currentMemberId !== member.id) {
      if (useAppStore.getState().currentMemberId !== member.id) setError('当前人物已切换，请关闭后重新编辑')
      return
    }
    setSaving(true)
    setError('')
    try {
      const normalizedBloodType = bloodType.replace('型', '') as Member['bloodType'] | ''
      const normalizedRh = rhBloodType === '阳性' ? 'positive' : rhBloodType === '阴性' ? 'negative' : null
      const updated = await familyMemberService.update(member.id, {
        bloodType: normalizedBloodType || null,
        rhBloodType: normalizedRh,
      }, token)
      const store = useAppStore.getState()
      store.setMembers(store.members.map((item) => item.id === updated.id ? adaptFamilyMember(updated) : item))
      if (store.currentMemberId === member.id) onSaved()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败，请检查网络后重试')
    } finally {
      setSaving(false)
    }
  }

  return <div className="nurse-station-modal-layer" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}>
    <section aria-labelledby="blood-type-editor-title" aria-modal="true" className="nurse-station-sheet blood-type-sheet" role="dialog">
      <Droplets aria-hidden="true" className="sheet-icon" />
      <h2 id="blood-type-editor-title">编辑血型</h2>
      <button aria-label="关闭血型编辑" className="sheet-close" disabled={saving} onClick={onClose} ref={closeRef} type="button"><X /></button>
      <p className="blood-type-sheet__description">当前：{member.name}。未确认的项目可以保持未填写。</p>
      <div className="blood-type-sheet__fields">
        <ProfileChoiceGroup label="ABO 血型" onChange={(value) => setBloodType(String(value))} options={['A型', 'B型', 'AB型', 'O型']} value={bloodType} />
        <ProfileChoiceGroup label="RhD" onChange={(value) => setRhBloodType(String(value))} options={['阳性', '阴性']} value={rhBloodType} />
      </div>
      {error && <p className="blood-type-sheet__error" role="alert">{error}</p>}
      <div className="blood-type-sheet__actions">
        <HohoButton disabled={saving} onClick={onClose} variant="secondary">取消</HohoButton>
        <HohoButton loading={saving} onClick={() => void save()}>保存</HohoButton>
      </div>
    </section>
  </div>
}
