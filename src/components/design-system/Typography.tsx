import type { HTMLAttributes, ReactNode } from 'react'

export type TypographyVariant = 'display' | 'pageTitle' | 'sectionTitle' | 'cardTitle' | 'body' | 'caption' | 'label' | 'data'

export interface TypographyProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode
  variant?: TypographyVariant
}

const classes: Record<TypographyVariant, string> = {
  display: 'hoho-text-display',
  pageTitle: 'hoho-text-page-title',
  sectionTitle: 'hoho-text-section-title',
  cardTitle: 'hoho-text-card-title',
  body: 'hoho-text-body',
  caption: 'hoho-text-caption',
  label: 'hoho-text-label',
  data: 'hoho-text-data'
}

const elements: Record<TypographyVariant, 'h1' | 'h2' | 'h3' | 'p' | 'span'> = {
  display: 'h1',
  pageTitle: 'h1',
  sectionTitle: 'h2',
  cardTitle: 'h3',
  body: 'p',
  caption: 'span',
  label: 'span',
  data: 'span'
}

export function Typography({ children, className = '', variant = 'body', ...props }: TypographyProps) {
  const Element = elements[variant]
  return <Element className={`${classes[variant]} ${className}`} {...props}>{children}</Element>
}
