import type { ReactNode } from 'react'
import { HohoSurfaceRow } from '../design-system'

interface SettingsRowProps {
  title: string
  description?: string
  value?: string
  action?: ReactNode
  onClick?: () => void
}

export function SettingsRow({ title, description, value, action, onClick }: SettingsRowProps) {
  return <HohoSurfaceRow action={action} description={description} onActivate={onClick} title={title} value={value} />
}
