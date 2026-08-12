import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type HohoButtonVariant = 'primary' | 'secondary' | 'text'

export interface HohoButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  fullWidth?: boolean
  variant?: HohoButtonVariant
}

export function HohoButton({
  children,
  className = '',
  fullWidth = false,
  type = 'button',
  variant = 'primary',
  ...props
}: HohoButtonProps) {
  return (
    <button
      className={`hoho-button ${fullWidth ? 'w-full' : ''} ${className}`}
      data-variant={variant}
      type={type}
      {...props}
    >
      {children}
    </button>
  )
}
