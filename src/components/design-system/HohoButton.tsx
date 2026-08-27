import { LoaderCircle } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type HohoButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'danger' | 'text'
export type HohoButtonSize = 'small' | 'medium' | 'large' | 'icon'

export interface HohoButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  fullWidth?: boolean
  loading?: boolean
  size?: HohoButtonSize
  variant?: HohoButtonVariant
}

export function HohoButton({
  children,
  className = '',
  disabled = false,
  fullWidth = false,
  loading = false,
  size = 'medium',
  type = 'button',
  variant = 'primary',
  ...props
}: HohoButtonProps) {
  return (
    <button
      className={`hoho-button ${fullWidth ? 'w-full' : ''} ${className}`}
      aria-busy={loading || undefined}
      disabled={loading || disabled}
      data-size={size}
      data-variant={variant}
      type={type}
      {...props}
    >
      {loading && <LoaderCircle aria-hidden="true" className="hoho-button__spinner" size={17} />}
      <span className="hoho-button__content">{children}</span>
    </button>
  )
}
