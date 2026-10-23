import { PRODUCT_FEATURES, isProductPathVisible } from '../../../shared/product-visibility.mjs'
import { ChevronRight, Sprout } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ReactNode, SVGProps } from 'react'

/** Two hands form the heart-shaped opening; no separate object is held. */
export function CareHandsIcon({size,...props}: SVGProps<SVGSVGElement> & {size?:number}) {
  return <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M16 25.8C11.7 23.4 5 19.5 4.1 14.8c-.7-3.5 1.3-6.5 4.4-6.9 2.7-.4 5.2 1.1 7.5 3.7 2.3-2.6 4.8-4.1 7.5-3.7 3.1.4 5.1 3.4 4.4 6.9-.9 4.7-7.6 8.6-11.9 11Z"/>
    <path d="m6.8 12.8 5.6 3.8c1.2.8 2.3-.6 1.3-1.6l-3.1-2.8m14.6.6-5.6 3.8c-1.2.8-2.3-.6-1.3-1.6l3.1-2.8M7.5 19.3l4.1-.3 4.4 3 4.4-3 4.1.3"/>
  </svg>
}

/** Shared in existing feature pages; the pale green identifies tree-sprout actions. */
export function SproutEntry({to,title,description,children}:{to:string;title:string;description?:string;children?:ReactNode}) {
  if (!PRODUCT_FEATURES.careJourney || !isProductPathVisible(to)) return null
  return <Link className="hoho-sprout-entry" to={to}><Sprout size={19} aria-hidden="true"/><span><strong>{title}</strong>{description&&<small>{description}</small>}{children}</span><ChevronRight size={17} aria-hidden="true"/></Link>
}
