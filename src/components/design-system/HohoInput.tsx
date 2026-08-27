import { forwardRef, type InputHTMLAttributes } from 'react'

export interface HohoInputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string
  hint?: string
  label: string
}

export const HohoInput = forwardRef<HTMLInputElement, HohoInputProps>(function HohoInput(
  { error, hint, id, label, className = '', ...props },
  ref
) {
  const inputId = id ?? `input-${label}`
  const messageId = hint || error ? `${inputId}-message` : undefined

  return (
    <label className="hoho-field" htmlFor={inputId}>
      <span className="hoho-text-label">{label}</span>
      <input
        aria-describedby={messageId}
        aria-invalid={Boolean(error)}
        className={`hoho-input ${className}`}
        id={inputId}
        ref={ref}
        {...props}
      />
      {(error || hint) && <span aria-live={error ? 'polite' : undefined} className="hoho-field__message" data-error={Boolean(error)} id={messageId} role={error ? 'alert' : undefined}>{error || hint}</span>}
    </label>
  )
})
