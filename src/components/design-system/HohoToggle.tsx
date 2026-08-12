export interface HohoToggleProps {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
}

export function HohoToggle({ checked, label, onChange }: HohoToggleProps) {
  return (
    <button aria-label={label} aria-pressed={checked} className="hoho-toggle" data-checked={checked} type="button" onClick={() => onChange(!checked)}>
      <span className="hoho-toggle__thumb" />
    </button>
  )
}
