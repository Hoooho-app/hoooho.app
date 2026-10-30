import contours from './child-data/selection-contours.json' with {type:'json'}
import type {ChildRegion} from './childBodyCatalog'
import type {Bounds,Point} from './childBodyGeometry'
import type {GraphicalVisual} from './locatorDetails'
import type {LocatorZone} from './locatorGeometry'
import type {LocatorModel} from './locatorDictionary'

const polygon=(points:readonly Point[])=>`M ${points.map(p=>p.join(' ')).join(' L ')} Z`
const rectangle=(x:number,y:number,w:number,h:number)=>polygon([[x,y],[x+w,y],[x+w,y+h],[x,y+h]])
const band=(top:number,bottom:number)=>rectangle(-.1,top,1.2,bottom-top)
function project(path:string,bounds:Bounds) {
 let coordinate=0
 return path.replace(/-?\d*\.?\d+/g,n=>{const axis=coordinate++%2;return String((Number(n)-bounds[axis])/bounds[axis+2])})
}

/** Exterior geometry is tied to the exact raster, including gaps between fingers.
 * Paths use the same source crop as the image, so changing views cannot shift it.
 */
export function selectionSilhouette(visual:GraphicalVisual):string {
 const key=visual.asset.startsWith('/body-locator/')?visual.asset:`/body-locator/${visual.asset.startsWith('neutral-')?'v2':'v1'}/${visual.asset.replace('assets/','')}`
 const source=(contours.assets as Record<string,{contours:number[][][]}>)[key]
 return source?source.contours.map(points=>project(polygon(points as unknown as Point[]),visual.bounds)).join(' '):''
}

/** Anatomical partitions define the inside boundary; the raster silhouette clips
 * the outside. They are illustration regions, not diagnostic/clinical borders.
 * Hit targets stay generous and independent from these visible masks.
 */
export function selectionPartition(zone:LocatorZone,visual:GraphicalVisual,region:ChildRegion|undefined,model:LocatorModel):string {
 const id=zone.id
 let path:string|undefined
 if(visual.detail){
  const kind=visual.detail.kind
  if(kind==='arm'){
   const span=id.startsWith('upper_arm_')?[0,.385]:id.startsWith('elbow_')?(/_(crease|tip)$/.test(id)?[.415,.455]:[.385,.485]):id.startsWith('forearm_')?[.485,.675]:id.startsWith('wrist_')?(/_(crease|dorsal)$/.test(id)?[.69,.73]:[.675,.75]):[.75,1]
   path=band(span[0],span[1])
  }else if(kind==='leg'){
   const span=id.startsWith('thigh_')?[0,.22]:id.startsWith('knee_')?[.22,.37]:id.startsWith('lower_leg_')?[.37,.70]:id.startsWith('ankle_')?[.70,.805]:[.805,1]
   path=band(span[0],span[1])
  }else if(kind==='neck'){
   const sourceX=visual.detail.crop[0]+zone.point[0]*visual.detail.crop[2]
   path=id==='neck_anterior_upper'?rectangle(.30,0,.44,.12):id==='neck_anterior_lower'?rectangle(.30,.12,.44,.11):id==='neck_nape'?rectangle(.30,0,.44,.23):rectangle(sourceX<.52?.25:.59,0,.17,.23)
  }else if(kind==='torso'){
   // The chest follows the axillary edge instead of an isolated oval patch.
   const rightUpper='M .52 .20 Q .38 .20 .35 .12 L -.1 .12 L -.1 .32 Q .17 .34 .245 .42 L .52 .42 Z'
   const leftUpper='M .52 .20 Q .66 .20 .69 .12 L 1.1 .12 L 1.1 .32 Q .87 .34 .79 .42 L .52 .42 Z'
   const rightLower='M .245 .42 L .52 .42 L .52 .60 L .20 .60 Q .24 .50 .245 .42 Z'
   const leftLower='M .52 .42 L .79 .42 Q .78 .50 .82 .60 L .52 .60 Z'
   const chest:Record<string,string>={chest_upper_right:rightUpper,chest_upper_left:leftUpper,chest_lower_right:rightLower,chest_lower_left:leftLower,chest_sternal:rectangle(.475,.22,.09,.38),chest_collarbone_right:'M .51 .19 Q .35 .17 .20 .21 L .22 .25 Q .36 .22 .51 .24 Z',chest_collarbone_left:'M .52 .19 Q .69 .17 .84 .21 L .82 .25 Q .68 .22 .52 .24 Z'}
   path=chest[id]
   if(id.startsWith('abdomen_'))path=id==='abdomen_umbilicus'?'M .51 .77 Q .55 .76 .56 .80 Q .55 .83 .52 .83 Q .49 .81 .51 .77 Z':rectangle(id.endsWith('right')?0:.52,id.includes('_upper_')?.54:.77,id.endsWith('right')?.52:.48,id.includes('_upper_')?.23:.24)
   if(id.startsWith('back_'))path=id==='back_middle_mid'?rectangle(.47,.22,.10,.75):rectangle(id.endsWith('left')?0:.52,id.includes('_upper_')?.22:.57,id.endsWith('left')?.52:.48,id.includes('_upper_')?.35:.44)
   if(id.startsWith('shoulder_'))path=rectangle(zone.point[0]<.5?0:.77,.16,.24,.28)
   if(id.startsWith('axilla_'))path=polygon(zone.point[0]<.5?[[.20,.34],[.28,.35],[.29,.50],[.22,.53],[.18,.45]]:[[.78,.34],[.86,.35],[.88,.45],[.82,.53],[.75,.50]])
  }else if(kind==='groin'){
   path=id.startsWith('hip_')?rectangle(id.includes('_right_')?0:.70,.25,.30,.24):undefined
  }
  // The few natural folds keep their traced crease shape, never an oval border.
  return path?project(path,visual.detail.crop):zone.path
 }
 if(visual.kind==='hand'){
  const thumbRight=region?.side==='left'?visual.angle==='palm':visual.angle!=='palm'
  if(id.endsWith('_palm')||id.endsWith('_dorsum')){
   const palm='M .12 .49 Q .20 .48 .25 .43 Q .26 .39 .32 .385 Q .39 .36 .445 .365 Q .51 .355 .57 .38 Q .65 .38 .72 .425 L .74 .49 Q .72 .54 .65 .56 Q .69 .63 .72 .66 L .66 .755 L .12 .755 Z'
   path=thumbRight?palm:project(palm,[1,0,-1,1])
  }else if(id.includes('_thumb_')){
   const points:Point[]=[[.76,.32],[1.05,.32],[1.05,.67],[.72,.67],[.64,.55]]
   path=polygon(thumbRight?points:points.map(([x,y])=>[1-x,y]))
  }else{
   const [x,y,w,h]=zone.bounds
   path=rectangle(x-.055,y-.065,w+.11,h+.095)
  }
 }else if(visual.kind==='foot'){
  if(id.endsWith('_sole'))path=rectangle(0,.25,1,.75)
  else if(id.endsWith('_dorsum'))path=rectangle(0,.26,1,.50)
  else if(/_toe_[1-5]$/.test(id)){
   const i=Number(id.at(-1))-1,left=region?.side==='left',plantar=visual.angle==='plantar'
   const centers=plantar?(left?[.32,.435,.516,.594,.657]:[.578,.465,.392,.333,.257]):left?[.688,.565,.478,.407,.344]:[.455,.577,.651,.716,.777]
   const adjacent=[i>0?(centers[i-1]+centers[i])/2:centers[i]+(centers[i]-centers[1]),i<4?(centers[i+1]+centers[i])/2:centers[i]+(centers[i]-centers[3])].sort((a,b)=>a-b)
   path=rectangle(adjacent[0],0,adjacent[1]-adjacent[0],zone.bounds[1]+zone.bounds[3]+.04)
  }else{const [x,y,w,h]=zone.bounds;path=rectangle(x-.035,y-.04,w+.07,h+.08)}
 }else if(visual.kind==='face'){
  const girl=model==='girl',dy=girl?-.063:0
  const face=(p:string)=>project(p,[0,-dy,1,1])
  if(id.includes('_eyebrow_')){
   const brow='M .285 .46 C .30 .42 .34 .40 .375 .406 Q .408 .413 .43 .44 C .37 .418 .33 .422 .285 .46 Z'
   path=face(id.endsWith('_left')?project(brow,[.99,0,-1,1]):brow)
  }else if(id.includes('_eye_')){
   const eye='M .30 .55 C .302 .486 .385 .465 .423 .52 C .452 .58 .389 .622 .334 .60 C .310 .59 .302 .57 .30 .55 Z'
   path=face(id.endsWith('_left')?project(eye,[.99,0,-1,1]):eye)
  }else if(id==='face_forehead'){
   path=girl?'M .39 .342 C .46 .33 .50 .306 .526 .27 Q .55 .233 .558 .215 C .57 .27 .595 .31 .64 .343 C .60 .327 .58 .326 .56 .34 Q .50 .365 .43 .345 Z':'M .40 .423 C .47 .43 .54 .38 .58 .275 C .58 .335 .61 .38 .66 .405 Q .61 .39 .565 .42 Q .50 .47 .43 .435 Z'
  }else if(id.includes('_cheek_')){
   const cheek='M .28 .60 Q .35 .64 .43 .61 L .45 .66 Q .41 .70 .43 .73 Q .32 .72 .26 .64 Z'
   path=face(id.endsWith('_left')?project(cheek,[.99,0,-1,1]):cheek)
  }else if(id==='face_chin')path=face('M .40 .725 Q .49 .75 .58 .725 L .63 .75 Q .50 .82 .36 .75 Z')
  else if(id.endsWith('_nose'))path=face('M .47 .54 Q .49 .52 .52 .54 L .53 .59 Q .57 .62 .53 .645 Q .49 .66 .455 .64 Q .43 .62 .46 .60 Z')
  else if(id.endsWith('_mouth'))path=face('M .416 .677 Q .49 .703 .575 .677 Q .55 .72 .49 .718 Q .44 .717 .416 .677 Z')
  else if(id.startsWith('ear_'))path=face(id.includes('_right_')?'M .28 .51 L .28 .66 Q .18 .72 .14 .63 L .14 .50 Z':'M .71 .51 L .71 .66 Q .81 .72 .85 .63 L .85 .50 Z')
  else if(id==='head_crown')path=band(0,.25)
  else if(id==='neck_whole')path=face('M .40 .77 L .59 .77 L .61 .815 L .65 .855 Q .50 .945 .355 .855 L .39 .815 Z')
 }else if(id.endsWith('_whole')){
  path=rectangle(0,0,1,1)
 }else if(id.startsWith('head_')){
  path=band(zone.bounds[1],zone.bounds[1]+zone.bounds[3])
 }
 return path??zone.path
}
