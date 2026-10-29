import { PRODUCT_FEATURES, isProductPathVisible } from '../../../shared/product-visibility.mjs'
import { ChevronRight, Sprout } from '../icons'
import { Link } from 'react-router-dom'
import type { ReactNode, SVGProps } from 'react'
import { MaterialIcon } from '../icons'

/** The same Material set supplies this functional care entrance. */
export function CareHandsIcon({size,...props}: SVGProps<SVGSVGElement> & {size?:number}) {
  return <MaterialIcon size={size} {...props} name="volunteer_activism"/>
}

/** Shared in existing feature pages; the pale green identifies tree-sprout actions. */
export function SproutEntry({to,title,description,children}:{to:string;title:string;description?:string;children?:ReactNode}) {
  if (!PRODUCT_FEATURES.careJourney || !isProductPathVisible(to)) return null
  return <Link className="hoho-sprout-entry" to={to}><Sprout size={19} aria-hidden="true"/><span><strong>{title}</strong>{description&&<small>{description}</small>}{children}</span><ChevronRight size={17} aria-hidden="true"/></Link>
}
