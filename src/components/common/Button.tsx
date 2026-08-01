import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: ButtonVariant
  fullWidth?: boolean
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-surface shadow-floating hover:bg-primary/90',
  secondary: 'bg-primary-soft text-primary hover:bg-primary-soft/70',
  danger: 'bg-danger text-surface hover:bg-danger/90',
  ghost: 'bg-transparent text-text-secondary hover:bg-primary-soft'
}

export function Button({ children, variant = 'primary', fullWidth, className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-pill px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
