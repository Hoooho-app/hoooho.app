interface ToggleSwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}

export function ToggleSwitch({ checked, onChange, label }: ToggleSwitchProps) {
  return <HohoToggle checked={checked} label={label} onChange={onChange} />
}
import { HohoToggle } from '../design-system'
