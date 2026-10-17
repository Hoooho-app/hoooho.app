import type { SVGProps } from 'react'
import logoUrl from '../../assets/brand/hoooho-logo.png'

export function HealthTrace({ className = '', ...props }: SVGProps<SVGSVGElement>) {
  return <svg aria-hidden="true" className={`hoho-health-trace ${className}`} viewBox="0 0 80 80" {...props}>
    <image href={logoUrl} width="80" height="80" style={{ clipPath: 'inset(0 round 20%)' }} />
  </svg>
}
