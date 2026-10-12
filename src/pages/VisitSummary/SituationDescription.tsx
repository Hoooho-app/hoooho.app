import type { VisitSheet } from '../../types/visitSheet'
import {descriptionParts} from './currentSituationCopy'
// React escapes both user text and model facts; never render arbitrary HTML.
export function SituationDescription({report}:{report:VisitSheet}) {
  return <>{descriptionParts(report).map((part,i)=>part.emphasize?<strong key={i}>{part.text}</strong>:part.text)}</>
}
