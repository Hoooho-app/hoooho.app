import { createContext, useContext } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { HohoButton } from '../../components/design-system'
import './RecordSaveAction.css'

/** Nested editors keep their own validation and save handler in the page header. */
export const RecordSaveTarget = createContext<HTMLElement | null>(null)

export function RecordSaveAction({ disabled, saving, onClick, label = '保存', description }: {
  disabled?: boolean; saving: boolean; onClick: () => void; label?: ReactNode; description?: string
}) {
  return <HohoButton aria-label={description ?? '保存记录'} className="record-header-save" disabled={disabled} loading={saving} variant="text" onClick={onClick}>{saving ? '保存中' : label}</HohoButton>
}

export function RecordEditorSave({ disabled, saving, onClick, children }: {
  disabled?: boolean; saving: boolean; onClick: () => void; children: ReactNode
}) {
  const target = useContext(RecordSaveTarget)
  return target ? createPortal(<RecordSaveAction disabled={disabled} saving={saving} onClick={onClick}/>, target)
    : <div className="diet-record-save"><HohoButton disabled={disabled} fullWidth loading={saving} onClick={onClick} size="large">{children}</HohoButton></div>
}
