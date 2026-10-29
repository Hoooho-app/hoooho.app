import { CHILD_LOCATIONS, CHILD_REGIONS, toChildSelection, type ChildRegion, type ChildView } from './childBodyCatalog'
import { bodyZone, cropLocatorZone, curved, locatorVisual, locatorZones, oval, type LocatorZone } from './locatorGeometry'
import { type ChildVisual, type LocalAngle, type Bounds } from './childBodyGeometry'
import { applicableLocation, categoryId, type LocatorModel } from './locatorDictionary'
import type { BodyLocationSelection } from './types'
import {detailVisual,detailZones,type GraphicalVisual} from './locatorDetails'
import {LOCATOR_DETAIL_ASSETS} from './locatorDetailAssets'

const arms=['shoulder','axilla','upper_arm','elbow','forearm','wrist','hand']
const legs=['hip','thigh','knee','lower_leg','ankle','foot']
export function graphicalRegionLabel(region:ChildRegion) {
  const category=categoryId(region.id),side=region.side==='left'?'左':'右'
  return ['upper_arm','elbow','forearm','wrist'].includes(category)?`${side}手臂`:legs.includes(category)&&!['foot','hip'].includes(category)?`${side}腿`:region.label
}
const custom=new Map<string,{label:string;regionId:string;surface:BodyLocationSelection['surface'];side:BodyLocationSelection['laterality']}>()
function named(region:ChildRegion,suffix:string,label:string,surface:BodyLocationSelection['surface'],shape:LocatorZone) {
  const id=`graphic_${region.id}_${suffix}`
  custom.set(id,{label,regionId:region.id,surface,side:suffix.endsWith('_left')?'left':suffix.endsWith('_right')?'right':region.side==='left'||region.side==='right'?region.side:'center'})
  return {...shape,id,label}
}
export function graphicalSelection(id:string,model:LocatorModel):BodyLocationSelection {
  const item=CHILD_LOCATIONS.get(id)
  if(item&&applicableLocation(item,model))return {...toChildSelection(id,model==='neutral'?'boy':model),modelAtSelection:model,regionId:item.regionId,categoryId:categoryId(item.regionId),precision:id===`${item.regionId}_whole`?'category':'region',displayLabel:item.label,medicalLabel:item.label,dictionaryVersion:'2.1.0'}
  const value=custom.get(id)
  if(!value)throw new Error('部位暂时不可用，请重新打开定位图')
  return {id,label:value.label,displayLabel:value.label,medicalLabel:value.label,parentId:value.regionId,regionId:value.regionId,categoryId:categoryId(value.regionId),locationType:'surface',laterality:value.side,surface:value.surface,coverage:'whole',precision:'region',dictionaryVersion:'2.1.0',modelAtSelection:model}
}
function siblings(region:ChildRegion,view:ChildView) {
  const type=categoryId(region.id),group=arms.includes(type)?arms:legs.includes(type)?legs:null
  return group?CHILD_REGIONS.filter(r=>group.includes(categoryId(r.id))&&r.side===region.side&&r.views.includes(view)):[region]
}
export function graphicalVisual(model:LocatorModel,view:ChildView,region?:ChildRegion,angle?:LocalAngle):GraphicalVisual|null {
  if(region?.id==='head'&&view==='front'&&model!=='neutral')return {asset:`assets/${model}-face.png`,width:1254,height:1254,bounds:[0,0,1,1],kind:'face'}
  if(region){const detail=detailVisual(region,view);if(detail)return detail}
  let visual=locatorVisual(model,view,region,angle)
  if(!visual&&region){const zone=bodyZone(model,view,region),full=locatorVisual(model,view);if(zone&&full)visual={...full,bounds:zone.bounds}}
  if(visual&&model!=='neutral'&&visual.asset===`assets/${model}-${view}.png`){const cutout=LOCATOR_DETAIL_ASSETS[`${model}-${view}`];visual={...visual,asset:cutout.asset,width:cutout.width,height:cutout.height}}
  if(!visual||!region||region.zoom==='hand'||region.zoom==='foot')return visual
  const group=siblings(region,view),zones=group.map(r=>bodyZone(model,view,r)).filter(z=>z!==null)
  if(group.length===1||!zones.length)return visual
  const x=Math.max(0,Math.min(...zones.map(z=>z.bounds[0]))-.025),y=Math.max(0,Math.min(...zones.map(z=>z.bounds[1]))-.025)
  const right=Math.min(1,Math.max(...zones.map(z=>z.bounds[0]+z.bounds[2]))+.025),bottom=Math.min(1,Math.max(...zones.map(z=>z.bounds[1]+z.bounds[3]))+.025)
  return {...visual,bounds:[x,y,right-x,bottom-y] as Bounds}
}
export function graphicalZones(model:LocatorModel,view:ChildView,region:ChildRegion|undefined,visual:GraphicalVisual):LocatorZone[] {
  if(!region)return CHILD_REGIONS.filter(r=>r.views.includes(view)&&!['face','ear'].includes(categoryId(r.id))).flatMap(r=>{
    let z=bodyZone(model,view,r)
    if(r.id==='neck'&&model!=='neutral'&&view==='front')z=curved(r.id,r.label,model==='girl'?[[.455,.300],[.545,.300],[.57,.337],[.5,.350],[.425,.338]]:[[.45,.325],[.56,.325],[.57,.365],[.5,.375],[.43,.362]])
    return z?[{...cropLocatorZone(z,visual),id:r.id,label:r.label}]:[]
  })
  if(visual.detail)return detailZones(region,view,visual)
  if(visual.kind==='hand') {
    const original=locatorZones(model,view,region,visual),palm=visual.angle==='palm'
    const fingers=original.filter(z=>/_(thumb|index|middle|ring|little)_(palmar|dorsal)$/.test(z.id)).map(z=>{
      const id=z.id.replace(/_(palmar|dorsal)$/,'_whole');return {...z,id,label:CHILD_LOCATIONS.get(id)!.label}
    })
    if(!palm)return [...fingers,...original.filter(z=>z.id.endsWith('_dorsum'))]
    return [...fingers,named(region,'palm',`${region.side==='left'?'左':'右'}手掌`,'palmar',curved('','',[[.28,.40],[.68,.40],[.78,.57],[.66,.75],[.34,.75],[.24,.57]]))]
  }
  if(visual.kind==='foot') {
    const original=locatorZones(model,view,region,visual),plantar=visual.angle==='plantar'
    const toes=original.filter(z=>/toe_[1-5]_(dorsal|plantar)$/.test(z.id)).map(z=>{const n=Number(z.id.match(/toe_([1-5])/)![1]);return named(region,`toe_${n}`,`${region.side==='left'?'左':'右'}脚${['大拇趾','第二趾','第三趾','第四趾','小趾'][n-1]}`,'circumferential',z)})
    return [...toes,...(plantar?[named(region,'sole',`${region.side==='left'?'左':'右'}脚底`,'plantar',oval('','',.46,.59,.18,.34))]:original.filter(z=>z.id.endsWith('_dorsum')))]
  }
  if(visual.kind==='face') {
    const girl=model==='girl',cy=girl?.485:.548
    const face=CHILD_REGIONS.find(r=>r.id==='face')!
    const zones:LocatorZone[]=[girl?curved('face_forehead','额头',[[.44,.344],[.52,.29],[.56,.22],[.59,.29],[.64,.34],[.60,.36],[.48,.37]]):oval('face_forehead','额头',.51,.382,.14,.07),oval('face_chin','下巴',.493,girl?.692:.756,.085,.045)]
    for(const [side,x] of [['right',.365],['left',.615]] as const){
      zones.push(oval(`face_cheek_${side}`,`${side==='left'?'左':'右'}脸颊`,side==='left'?.649:.331,cy+.115,.085,.065))
      zones.push(named(face,`eye_${side}`,`${side==='left'?'左':'右'}眼部`,'unspecified',oval('','',x,cy,.09,.08)))
      zones.push(oval(`face_eyebrow_${side}`,`${side==='left'?'左':'右'}眉毛周围`,side==='left'?.63:.35,girl?.365:.43,girl?.075:.09,.025))
    }
    zones.push(oval('ear_left_whole','整个左耳',.78,girl?.535:.595,.06,.085),oval('ear_right_whole','整个右耳',girl?.224:.20,girl?.535:.595,.06,.085),oval('head_crown','头顶',.5,.14,.20,.08),oval('neck_whole','整个颈部',.50,girl?.80:.85,.09,.05))
    zones.push(named(face,'nose','鼻部','unspecified',oval('','',.495,girl?.554:.61,.052,.057)),named(face,'mouth','口部','unspecified',oval('','',.49,girl?.632:.70,.09,.035)))
    return zones
  }
  const group=siblings(region,view)
  return group.flatMap(r=>{
    const z=bodyZone(model,view,r)
    return z?[{...cropLocatorZone(z,visual),id:`${r.id}_whole`,label:CHILD_LOCATIONS.get(`${r.id}_whole`)!.label}]:[]
  })
}
