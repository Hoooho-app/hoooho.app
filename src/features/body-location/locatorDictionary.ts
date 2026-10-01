import { CHILD_CATALOG_VERSION, CHILD_LOCATIONS, CHILD_REGIONS, childSelectionKey, type ChildLocation, type ChildRegion } from './childBodyCatalog'
import type { BodyLocationSelection } from './types'
export { bodyLocationLabel } from '../../../shared/body-location-label.mjs'
export type LocatorModel = 'boy' | 'girl' | 'neutral'
export type LocatorSide = 'left' | 'right' | ''
export const LOCATOR_DICTIONARY_VERSION = '2.0.0'
export const categoryId = (id: string) => id.replace(/_(left|right)$/, '')
const labels: Record<string,string> = { face:'面部五官',ear:'耳部',shoulder:'肩部',axilla:'腋下',upper_arm:'上臂',elbow:'肘部',forearm:'前臂',wrist:'手腕',hand:'手',hip:'髋部',groin:'腹股沟',buttock:'臀部',thigh:'大腿',knee:'膝部',lower_leg:'小腿',ankle:'脚踝',foot:'足' }
export interface LocatorCategory { id:string; label:string; bilateral:boolean; regions:ChildRegion[] }
export const LOCATOR_CATEGORIES: LocatorCategory[] = [...new Set(CHILD_REGIONS.map(r=>categoryId(r.id)))].map(id=>{
  const regions=CHILD_REGIONS.filter(r=>categoryId(r.id)===id)
  return {id,label:labels[id]??regions[0].label,bilateral:regions.length===2,regions}
})
export const applicableLocation = (item: ChildLocation, model: LocatorModel) => model==='neutral' ? item.sex.includes('boy')&&item.sex.includes('girl') : item.sex.includes(model)
export const locatorRegion = (category:LocatorCategory|undefined,side:LocatorSide) => category?.bilateral ? category.regions.find(r=>r.side===side) : category?.regions[0]
export function locatorSelection(id:string,model:LocatorModel):BodyLocationSelection {
  const item=CHILD_LOCATIONS.get(id)
  if(!item||!applicableLocation(item,model))throw new Error('该部位不适用于当前孩子档案')
  const coarse=item.coverage!=='specific'
  const region=CHILD_REGIONS.find(r=>r.id===item.regionId)!
  const label=coarse ? `${region.label}（具体位置待补充）` : item.label
  const side=coarse?region.side:item.side
  return {id,label,parentId:item.regionId,regionId:item.regionId,categoryId:categoryId(item.regionId),locationType:'surface',laterality:side==='midline'?'center':side==='unspecified'?'none':side,view:item.views[0],surface:coarse?'unspecified':item.surface,coverage:item.coverage,precision:coarse?'category':'region',displayLabel:label,medicalLabel:label,dictionaryVersion:LOCATOR_DICTIONARY_VERSION,schemaVersion:CHILD_CATALOG_VERSION,modelAtSelection:model}
}
export function coarseSelection(category:LocatorCategory,side:LocatorSide,model:LocatorModel):BodyLocationSelection {
  const region=locatorRegion(category,side)
  if(region)return locatorSelection(`${region.id}_whole`,model)
  const label=`${category.label}（左右与具体位置待补充）`
  return {id:`category:${category.id}`,label,parentId:category.id,regionId:category.id,categoryId:category.id,locationType:'surface',laterality:'none',surface:'unspecified',coverage:'uncertain',precision:'category',displayLabel:label,medicalLabel:label,dictionaryVersion:LOCATOR_DICTIONARY_VERSION,schemaVersion:CHILD_CATALOG_VERSION,modelAtSelection:model}
}
/** Coarse and precise observations coexist; toggling never silently removes siblings. */
export function toggleLocatorSelection(values:readonly BodyLocationSelection[],next:BodyLocationSelection) {
  const key=childSelectionKey(next)
  return values.some(v=>childSelectionKey(v)===key) ? values.filter(v=>childSelectionKey(v)!==key) : [...values,next]
}
export const drawableSelectionIds=(values:readonly BodyLocationSelection[])=>values.filter(item=>item.schemaVersion===CHILD_CATALOG_VERSION&&CHILD_LOCATIONS.has(item.id)).map(item=>item.id)
