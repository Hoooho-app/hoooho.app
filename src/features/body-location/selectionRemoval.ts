import type {BodyLocationSelection} from './types'
import {childSelectionKey} from './childBodyCatalog'
import {bodyLocationLabel} from './locatorDictionary'

export function removeLocationSelection(values:readonly BodyLocationSelection[],removed:BodyLocationSelection) {
 const key=childSelectionKey(removed)
 return values.filter(value=>childSelectionKey(value)!==key)
}
export function removeLocationAndMatchingText(values:readonly BodyLocationSelection[],locationText:string,removed:BodyLocationSelection) {
 const aliases=[removed.label,removed.displayLabel,removed.medicalLabel,bodyLocationLabel(removed)].filter(Boolean).map(value=>value!.trim())
 return {locations:removeLocationSelection(values,removed),locationText:aliases.includes(locationText.trim())?'':locationText}
}
