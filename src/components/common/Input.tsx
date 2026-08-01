import { forwardRef, type InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, id, className = '', ...props },
  ref
) {
  const inputId = id ?? `input-${label}`
  return (
    <label className="block space-y-2" htmlFor={inputId}>
      <span className="text-sm font-medium text-text-primary">{label}</span>
      <input
        ref={ref}
        id={inputId}
        className={`min-h-11 w-full rounded-control border bg-surface px-3 text-sm outline-none transition placeholder:text-text-secondary/70 focus:border-primary focus:ring-2 focus:ring-primary/15 ${className}`}
        {...props}
      />
      {hint && <span className="text-xs text-text-secondary">{hint}</span>}
    </label>
  )
})
