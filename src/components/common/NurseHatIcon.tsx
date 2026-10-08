import type { SVGProps } from 'react'

// Shared by the smart-record entry and its conversation sheet.
export function NurseHatIcon({ size = 21, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M4 18 2.5 8.5 7 5h10l4.5 3.5L20 18Z" />
    <path d="M4 18h16M10 10h4M12 8v4" />
  </svg>
}
