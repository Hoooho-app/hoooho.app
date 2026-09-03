import type { SVGProps } from 'react'

export function HealthTrace({ className = '', ...props }: SVGProps<SVGSVGElement>) {
  return <svg aria-hidden="true" className={`hoho-health-trace ${className}`} viewBox="0 0 80 80" {...props}>
    <path d="M 13 65 Q 40 28 67 13" />
    <circle className="hoho-health-trace__start" cx="13" cy="65" r="6" />
    <circle cx="40" cy="38" r="11" />
    <circle className="hoho-health-trace__end" cx="67" cy="13" r="8" />
  </svg>
}
