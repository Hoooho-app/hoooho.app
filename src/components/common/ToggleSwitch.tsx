interface ToggleSwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}

export function ToggleSwitch({ checked, onChange, label }: ToggleSwitchProps) {
  return (
    <button
      aria-label={label}
      aria-pressed={checked}
      className={`relative h-6 w-11 shrink-0 rounded-pill transition-colors ${checked ? 'bg-primary' : 'bg-border'}`}
      type="button"
      onClick={() => onChange(!checked)}
    >
      <span className={`absolute left-0 top-[3px] h-[18px] w-[18px] rounded-full bg-surface shadow-sm transition-transform ${checked ? 'translate-x-[23px]' : 'translate-x-[3px]'}`} />
    </button>
  )
}
