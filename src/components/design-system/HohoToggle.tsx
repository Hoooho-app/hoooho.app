export interface HohoToggleProps {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
}

export function HohoToggle({ checked, label, onChange }: HohoToggleProps) {
  return (
    <button aria-checked={checked} aria-label={label} className="hoho-toggle" data-checked={checked} role="switch" type="button" onClick={() => onChange(!checked)}>
      <span className="hoho-toggle__thumb" />
    </button>
  )
}
