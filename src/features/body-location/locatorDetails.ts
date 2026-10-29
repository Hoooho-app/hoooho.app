import {CHILD_LOCATIONS, type ChildRegion, type ChildView} from './childBodyCatalog'
import type {Bounds,ChildVisual} from './childBodyGeometry'
import {categoryId} from './locatorDictionary'
import {cropLocatorZone,curved,oval,type LocatorZone} from './locatorGeometry'
import {LOCATOR_DETAIL_ASSETS as assets} from './locatorDetailAssets'

type DetailKind='torso'|'neck'|'arm'|'leg'|'groin'
export interface GraphicalVisual extends ChildVisual {detail?:{kind:DetailKind;crop:Bounds}}
const full:Bounds=[0,0,1,1]
function image(key:keyof typeof assets,panel:Bounds,kind:DetailKind,crop:Bounds=full):GraphicalVisual {
 const source=assets[key]
 return {asset:source.asset,width:source.width,height:source.height,kind:'body',bounds:[panel[0]+panel[2]*crop[0],panel[1]+panel[3]*crop[1],panel[2]*crop[2],panel[3]*crop[3]],detail:{kind,crop}}
}
export function detailVisual(region:ChildRegion,view:ChildView):GraphicalVisual|null {
 const category=categoryId(region.id),left=region.side==='left'
 if(['chest','abdomen','back','neck','shoulder','axilla'].includes(category)){
  const crop:Bounds=category==='neck'?[.22,0,.56,.30]:category==='abdomen'?[.18,.48,.65,.50]:category==='back'?[0,.08,1,.90]:[0,.09,1,.56]
  return image('torso-atlas',view==='front'?[0,0,.5,1]:[.5,0,.5,1],category==='neck'?'neck':'torso',crop)
 }
 if(['upper_arm','elbow','forearm','wrist'].includes(category))return image(view==='front'?'arm-front':'arm-back',left?[.5,0,.5,1]:[0,0,.5,1],'arm')
 if(['thigh','knee','lower_leg','ankle'].includes(category))return image('leg-atlas',view==='front'?(left?[.295,0,.205,1]:[.075,0,.205,1]):left?[.55,0,.20,1]:[.75,0,.20,1],'leg')
 if(view==='front'&&['groin','hip'].includes(category))return image('groin-diagram',full,'groin')
 return null
}
const zone=(id:string,x:number,y:number,w:number,h:number)=>oval(id,CHILD_LOCATIONS.get(id)!.label,x,y,w,h)
const area=(id:string,x:number,y:number,w:number,h:number)=>curved(id,CHILD_LOCATIONS.get(id)!.label,[[x,y],[x+w,y],[x+w,y+h],[x,y+h]])
export function detailZones(region:ChildRegion,view:ChildView,visual:GraphicalVisual):LocatorZone[] {
 const kind=visual.detail!.kind,category=categoryId(region.id),side=region.side==='left'?'left':'right',left=side==='left',front=view==='front'
 let zones:LocatorZone[]=[]
 if(kind==='neck'){
  zones=front?[zone('neck_anterior_upper',.52,.075,.065,.05),zone('neck_anterior_lower',.52,.155,.075,.045)]:[zone('neck_nape',.51,.12,.08,.08)]
  zones.push(zone(`neck_side_${front?'right':'left'}`,.405,.13,.035,.065),zone(`neck_side_${front?'left':'right'}`,.63,.13,.035,.065))
 }else if(kind==='torso'){
  if(category==='abdomen'){
   zones=[area('abdomen_upper_right',.25,.55,.22,.20),area('abdomen_upper_left',.55,.55,.22,.20),area('abdomen_lower_right',.25,.78,.22,.18),area('abdomen_lower_left',.55,.78,.22,.18),zone('abdomen_umbilicus',.53,.795,.065,.06)]
  }else if(!front){
   zones=[area('back_upper_left',.24,.27,.23,.27),area('back_upper_right',.55,.27,.23,.27),area('back_lower_left',.24,.58,.23,.34),area('back_lower_right',.55,.58,.23,.34),area('back_middle_mid',.47,.31,.08,.52)]
  }else{
   zones=[area('chest_upper_right',.24,.25,.22,.15),area('chest_upper_left',.56,.25,.22,.15),area('chest_lower_right',.24,.41,.22,.16),area('chest_lower_left',.56,.41,.22,.16),area('chest_sternal',.46,.25,.10,.32),zone('chest_collarbone_right',.38,.20,.10,.035),zone('chest_collarbone_left',.65,.20,.10,.035)]
  }
  if(['shoulder','axilla'].includes(category))for(const [position,s] of [[.18,front?'right':'left'],[.86,front?'left':'right']] as const){zones.push(zone(`shoulder_${s}_whole`,position,.30,.08,.14),zone(`axilla_${s}_whole`,position<.5?.245:.79,.46,.045,.065))}
 }else if(kind==='arm'){
  const shoulderX=front?.50:left?.45:.55,elbowX=front?(left?.42:.585):left?.39:.61,wristX=front?(left?.28:.73):left?.30:.696
  zones=[zone(`upper_arm_${side}_whole`,shoulderX,.25,.20,.19),zone(`elbow_${side}_whole`,elbowX,.435,.20,.065),zone(`forearm_${side}_whole`,(elbowX+wristX)/2,.57,.18,.12),zone(`wrist_${side}_whole`,wristX,.71,.15,.05),zone(`hand_${side}_whole`,front?(left?.30:.70):left?.33:.67,.835,.24,.12)]
  zones.push(zone(`elbow_${side}_${front?'crease':'tip'}`,elbowX,.435,.18,.03))
  zones.push(zone(`wrist_${side}_${front?'crease':'dorsal'}`,wristX,.71,.14,.025))
 }else if(kind==='leg'){
  const [thigh,knee,shin,ankle,foot]=front?(left?[.410,.363,.466,.429,.524]:[.585,.634,.522,.559,.459]):left?[.53,.5925,.485,.55,.50]:[.4525,.4025,.51,.4525,.50]
  zones=[zone(`thigh_${side}_whole`,thigh,.10,.36,.11),zone(`knee_${side}_whole`,knee,.285,.34,.085),zone(`lower_leg_${side}_whole`,shin,.54,.30,.18),zone(`ankle_${side}_whole`,ankle,.755,.27,.055),zone(`foot_${side}_whole`,foot,.87,.38,.095)]
 }else if(kind==='groin'){
  zones=[zone('hip_right_whole',.22,.36,.055,.10),zone('hip_left_whole',.78,.36,.055,.10),curved('groin_right_fold',CHILD_LOCATIONS.get('groin_right_fold')!.label,[[.21,.32],[.32,.40],[.47,.54],[.43,.59],[.29,.46],[.18,.38]]),curved('groin_left_fold',CHILD_LOCATIONS.get('groin_left_fold')!.label,[[.79,.32],[.68,.40],[.53,.54],[.57,.59],[.71,.46],[.82,.38]])]
 }
 return zones.filter(z=>CHILD_LOCATIONS.get(z.id)!.views.includes(view)).map(z=>cropLocatorZone(z,{...visual,bounds:visual.detail!.crop}))
}
