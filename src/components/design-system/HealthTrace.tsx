import type { SVGProps } from 'react'

export type HealthTraceVariant = 'mark' | 'path' | 'rail' | 'spine' | 'bond'

interface HealthTraceProps extends SVGProps<SVGSVGElement> {
  variant?: HealthTraceVariant
}

export function HealthTrace({ className = '', variant = 'mark', ...props }: HealthTraceProps) {
  if (variant === 'path') {
    return <svg aria-hidden="true" className={`hoho-health-trace ${className}`} data-variant={variant} viewBox="0 0 360 128" {...props}>
      <path d="M 18 102 C 90 114 111 31 182 65 S 282 98 342 20" />
      <circle className="hoho-health-trace__start" cx="18" cy="102" r="7" />
      <circle className="hoho-health-trace__focus" cx="182" cy="65" r="12" />
      <circle className="hoho-health-trace__end" cx="342" cy="20" r="9" />
    </svg>
  }

  if (variant === 'rail') {
    return <svg aria-hidden="true" className={`hoho-health-trace ${className}`} data-variant={variant} viewBox="0 0 44 320" preserveAspectRatio="none" {...props}>
      <path d="M 12 14 C 35 76 5 126 23 176 S 37 259 18 306" />
      <circle className="hoho-health-trace__start" cx="12" cy="14" r="5" />
      <circle className="hoho-health-trace__focus" cx="23" cy="176" r="8" />
      <circle className="hoho-health-trace__end" cx="18" cy="306" r="6" />
    </svg>
  }

  if (variant === 'spine') {
    return <svg aria-hidden="true" className={`hoho-health-trace ${className}`} data-variant={variant} viewBox="0 0 42 210" preserveAspectRatio="none" {...props}>
      <path d="M 12 12 C 30 54 9 97 24 126 S 30 173 16 198" />
      <circle className="hoho-health-trace__start" cx="12" cy="12" r="4.5" />
      <circle className="hoho-health-trace__focus" cx="24" cy="126" r="7.5" />
      <circle className="hoho-health-trace__end" cx="16" cy="198" r="5.5" />
    </svg>
  }

  if (variant === 'bond') {
    return <svg aria-hidden="true" className={`hoho-health-trace ${className}`} data-variant={variant} viewBox="0 0 176 58" {...props}>
      <path d="M 12 42 C 51 53 72 9 102 28 S 142 41 164 12" />
      <circle className="hoho-health-trace__start" cx="12" cy="42" r="5" />
      <circle className="hoho-health-trace__focus" cx="102" cy="28" r="8" />
      <circle className="hoho-health-trace__end" cx="164" cy="12" r="6" />
    </svg>
  }

  return <svg aria-hidden="true" className={`hoho-health-trace ${className}`} data-variant={variant} viewBox="0 0 80 80" {...props}>
    <path d="M 13 65 Q 40 28 67 13" />
    <circle className="hoho-health-trace__start" cx="13" cy="65" r="6" />
    <circle className="hoho-health-trace__focus" cx="40" cy="38" r="11" />
    <circle className="hoho-health-trace__end" cx="67" cy="13" r="8" />
  </svg>
}
