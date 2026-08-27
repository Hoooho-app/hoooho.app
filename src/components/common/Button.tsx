import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { HohoButton } from '../design-system'

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: ButtonVariant
  fullWidth?: boolean
}

export function Button({ children, variant = 'primary', fullWidth, className = '', ...props }: ButtonProps) {
  const mappedVariant = variant === 'ghost' ? 'ghost' : variant
  return <HohoButton className={className} fullWidth={fullWidth} variant={mappedVariant} {...props}>{children}</HohoButton>
}
