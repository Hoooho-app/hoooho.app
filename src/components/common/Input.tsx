import { forwardRef, type InputHTMLAttributes } from 'react'
import { HohoInput } from '../design-system'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, id, className = '', ...props },
  ref
) {
  return <HohoInput className={className} hint={hint} id={id} label={label} ref={ref} {...props} />
})
