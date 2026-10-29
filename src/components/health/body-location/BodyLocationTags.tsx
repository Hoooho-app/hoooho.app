import {X} from '../../icons'
import {childSelectionKey} from '../../../features/body-location/childBodyCatalog'
import {bodyLocationLabel} from '../../../features/body-location/locatorDictionary'
import type {BodyLocationSelection} from '../../../features/body-location'
import './body-location-tags.css'

export function BodyLocationTags({values,onRemove,className='child-body-committed',manualValue,onRemoveManual,disabled=false}:{values:readonly BodyLocationSelection[];onRemove:(value:BodyLocationSelection)=>void;className?:string;manualValue?:string;onRemoveManual?:()=>void;disabled?:boolean}) {
 if(!values.length&&!manualValue)return null
 return <div className={`body-location-tags ${className}`} aria-label="已选择的症状部位">
  {values.map(value=><span className="body-location-tag" key={childSelectionKey(value)}><span>{bodyLocationLabel(value)}</span><button type="button" disabled={disabled} aria-label={`移除${bodyLocationLabel(value)}`} onClick={()=>onRemove(value)}><X aria-hidden="true" size={14}/></button></span>)}
  {manualValue&&<span className="body-location-tag"><span>{manualValue}</span><button type="button" disabled={disabled} aria-label={`移除${manualValue}`} onClick={onRemoveManual}><X aria-hidden="true" size={14}/></button></span>}
 </div>
}
