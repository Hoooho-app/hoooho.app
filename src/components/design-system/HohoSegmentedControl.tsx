import type { KeyboardEvent, ReactNode } from 'react'
import './HohoSegmentedControl.css'

export function HohoSegmentedControl<T extends string>({ label, options, value, onChange, disabled = false }: {
  label: string; options: readonly { value: T; label: string; icon?: ReactNode }[]; value: T
  onChange: (value: T) => void; disabled?: boolean
}) {
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const offset = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (!offset && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + offset + options.length) % options.length
    onChange(options[next].value)
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus()
  }
  return <div aria-label={label} className="hoho-record-segmented-control" role="radiogroup">{options.map((option, index) => <button
    aria-checked={value === option.value} disabled={disabled} key={option.value} onClick={() => onChange(option.value)}
    onKeyDown={(event) => move(event, index)} role="radio" tabIndex={value === option.value ? 0 : -1} type="button"
  >{option.icon}{option.label}</button>)}</div>
}
