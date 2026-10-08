import { optimizedPublicImages } from '../../generated/optimizedPublicImages'
import { CHILD_LOCATIONS, type ChildRegion, type ChildView } from './childBodyCatalog'
import { childVisual, locationPoint, projectedPoint, regionAnchor, type Bounds, type ChildVisual, type LocalAngle, type Point } from './childBodyGeometry'
import { categoryId, type LocatorModel } from './locatorDictionary'

export interface LocatorZone { id:string; label:string; path:string; point:Point; bounds:Bounds; sourceRegionId?:string }
const neutralLandmarks:Record<string,[number,number,number,number]>={
  head:[.5,.18,.245,.165],face:[.5,.252,.12,.047],ear:[.665,.25,.022,.023],neck:[.5,.330,.049,.012],
  chest:[.5,.439,.118,.055],abdomen:[.5,.535,.13,.047],back:[.5,.455,.126,.125],
  shoulder:[.642,.392,.038,.027],axilla:[.636,.446,.018,.015],upper_arm:[.691,.469,.027,.025],elbow:[.723,.51,.030,.019],forearm:[.757,.55,.027,.034],wrist:[.782,.585,.020,.014],hand:[.808,.615,.035,.040],
  hip:[.646,.636,.025,.028],groin:[.547,.65,.023,.016],buttock:[.58,.632,.067,.033],thigh:[.584,.707,.052,.032],knee:[.589,.762,.044,.022],lower_leg:[.599,.82,.043,.052],ankle:[.593,.9,.028,.016],foot:[.601,.935,.048,.022]
}
function neutralAnchor(view:ChildView,region:ChildRegion) {
  const point=neutralLandmarks[categoryId(region.id)]
  if(!point)return null
  const [rightX,y,w,h]=point
  const x=region.side==='left'?(view==='front'?rightX:1-rightX):region.side==='right'?(view==='front'?1-rightX:rightX):.5
  return {anchor:[x,y] as Point,bounds:[Math.max(0,x-w*1.7),Math.max(0,y-h*1.7),Math.min(1,w*3.4),Math.min(1,h*3.4)] as Bounds,size:[w,h] as Point}
}
/** Paths and their centroids use the same cropped-image coordinates (0..1). */
function curved(id:string,label:string,points:Point[]):LocatorZone {
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),minX=Math.min(...xs),minY=Math.min(...ys),maxX=Math.max(...xs),maxY=Math.max(...ys)
  const mid=(a:Point,b:Point)=>[(a[0]+b[0])/2,(a[1]+b[1])/2] as const
  const start=mid(points.at(-1)!,points[0])
  const path=`M ${start.join(' ')} `+points.map((p,i)=>`Q ${p.join(' ')} ${mid(p,points[(i+1)%points.length]).join(' ')}`).join(' ')+' Z'
  return {id,label,path,point:[(minX+maxX)/2,(minY+maxY)/2],bounds:[minX,minY,maxX-minX,maxY-minY]}
}
function oval(id:string,label:string,x:number,y:number,w:number,h:number,tilt=0) {
  return curved(id,label,[[x-w-tilt,y-h*.7],[x-tilt,y-h],[x+w-tilt,y-h*.7],[x+w+tilt,y+h*.65],[x+tilt,y+h],[x-w+tilt,y+h*.65]])
}
export function locatorVisual(model:LocatorModel,view:ChildView,region?:ChildRegion,angle?:LocalAngle):ChildVisual|null {
  if(model!=='neutral'){const visual=childVisual(model,view,region,angle);return visual&&!region?{...visual,bounds:[.12,.01,.76,.965]}:visual}
  if(region?.zoom==='hand'||region?.zoom==='foot')return childVisual('boy',view,region,angle)
  if(region && ['external_genital','perineum','groin_left','groin_right'].includes(region.id))return null
  const bounds=region ? neutralAnchor(view,region)?.bounds : undefined
  return {asset:`neutral-${view}.png`,width:1024,height:1536,bounds:bounds??[.12,.01,.76,.965],kind:'body'}
}
export const locatorAssetUrl=(visual:ChildVisual)=> { const original = `/body-locator/${visual.asset.startsWith('neutral-')?'v2':'v1'}/${visual.asset.replace('assets/','')}`; return optimizedPublicImages[original] ?? original }
export function bodyZone(model:LocatorModel,view:ChildView,region:ChildRegion):LocatorZone|null {
  const measured=model==='neutral'?'boy':model
  const a=model==='neutral'?neutralAnchor(view,region):regionAnchor(measured,view,region.id)
  if(!a)return null
  const [x,y]=a.anchor,kind=categoryId(region.id)
  if(model==='neutral'&&kind!=='head'){const s=neutralAnchor(view,region)!.size;return oval(region.id,region.label,x,y,s[0],s[1],['upper_arm','forearm'].includes(kind)?x<.5?-.013:.013:0)}
  if(kind==='head') {
    const pts:Point[]=model==='neutral'&&view==='front'?[[.33,.10],[.43,.063],[.57,.066],[.665,.107],[.695,.19],[.665,.255],[.58,.29],[.43,.297],[.35,.26],[.30,.19],[.30,.14]]:view==='back' ? measured==='girl' ? [[.42,.065],[.59,.066],[.66,.12],[.71,.22],[.715,.275],[.62,.307],[.39,.305],[.285,.272],[.29,.21],[.34,.12]] : [[.42,.04],[.59,.045],[.68,.10],[.71,.17],[.68,.23],[.61,.28],[.53,.305],[.44,.3],[.36,.26],[.29,.18],[.30,.11],[.35,.07]] : measured==='girl' ? [[.32,.10],[.43,.052],[.59,.06],[.68,.12],[.71,.20],[.71,.26],[.62,.30],[.39,.30],[.285,.26],[.29,.18]] : [[.33,.09],[.45,.037],[.61,.06],[.70,.13],[.70,.23],[.64,.29],[.56,.324],[.43,.322],[.35,.27],[.29,.18],[.30,.12]]
    return curved(region.id,region.label,pts)
  }
  const sizes:Record<string,[number,number]>={face:[.105,.055],ear:[.022,.022],neck:[.046,.012],chest:[.112,.046],abdomen:[.125,.056],back:[.124,.112],shoulder:[.041,.028],axilla:[.016,.013],upper_arm:[.027,.028],elbow:[.031,.019],forearm:[.026,.033],wrist:[.021,.016],hand:[.036,.039],hip:[.025,.036],groin:[.022,.017],buttock:[.057,.038],thigh:[.052,.037],knee:[.047,.024],lower_leg:[.04,.058],ankle:[.029,.019],foot:[.051,.028]}
  const s=sizes[kind]
  if(!s)return null
  return oval(region.id,region.label,x,y,s[0],s[1],['upper_arm','forearm'].includes(kind)?x<.5?-.013:.013:0)
}
export function locatorZones(model:LocatorModel,view:ChildView,region:ChildRegion,visual:ChildVisual):LocatorZone[] {
  const measured=model==='neutral'?'boy':model
  const zone=(suffix:string,points:Point[])=>{const id=`${region.id}_${suffix}`,item=CHILD_LOCATIONS.get(id);return item ? curved(id,item.label,points):null}
  const result:LocatorZone[]=[]
  if(visual.kind==='hand') {
    const left=region.side==='left',palm=visual.angle==='palm'
    const xs=left?(palm?[.86,.65,.475,.30,.15]:[.15,.34,.54,.71,.86]):(palm?[.14,.37,.55,.72,.85]:[.88,.61,.45,.29,.14])
    const ys=left?[.43,.18,.11,.17,.29]:[.42,.16,.11,.16,.26]
    const fingers=['thumb','index','middle','ring','little']
    fingers.forEach((finger,i)=>{
      const x=xs[i],top=ys[i]-.06,root=i===0?.565:.385,w=i===0?.065:i===4?.041:.043
      const lean=i===0?(x<.5?.12:-.12):i===4?(x<.5?.022:-.022):0
      const z=zone(`${finger}_${palm?'palmar':'dorsal'}`,[[x-w,top+.015],[x,top],[x+w,top+.018],[x+w+lean,root],[x+lean,root+.006],[x-w+lean,root]])
      if(z)result.push(z)
    })
    if(palm) {
      const thumbRight=xs[0]>.5
      const center=zone('palm_center',[[.38,.445],[.56,.44],[.64,.49],[.61,.56],[.45,.58],[.34,.53]])
      const thumb=zone('palm_thumb',thumbRight?[[.65,.515],[.75,.57],[.67,.685],[.55,.705],[.55,.62]]:[[.34,.515],[.25,.57],[.33,.685],[.46,.705],[.46,.62]])
      const little=zone('palm_little',thumbRight?[[.29,.52],[.36,.565],[.42,.615],[.43,.69],[.34,.685],[.28,.62]]:[[.69,.52],[.62,.565],[.57,.615],[.57,.69],[.66,.685],[.72,.62]])
      const base=zone('palm_base',[[.40,.705],[.60,.705],[.62,.747],[.38,.747]])
      for(const z of [center,thumb,little,base])if(z)result.push(z)
    } else {const z=zone('dorsum',[[.34,.43],[.65,.43],[.71,.53],[.66,.64],[.57,.70],[.39,.68],[.30,.57]]);if(z)result.push(z)}
    return result
  }
  if(visual.kind==='foot') {
    const plantar=visual.angle==='plantar',dorsal=visual.angle==='dorsal',left=region.side==='left'
    if(plantar){
      const fore=zone('plantar_forefoot',left?[[.28,.225],[.62,.24],[.66,.34],[.61,.415],[.33,.415],[.27,.33]]:[[.235,.245],[.55,.23],[.62,.29],[.59,.36],[.50,.405],[.29,.415],[.225,.34]])
      const arch=zone('arch',left?[[.32,.455],[.48,.465],[.515,.58],[.49,.70],[.33,.70],[.312,.58]]:[[.425,.465],[.565,.455],[.566,.60],[.55,.70],[.425,.70],[.40,.59]])
      const heel=zone('heel_sole',left?[[.355,.735],[.58,.73],[.585,.82],[.54,.915],[.405,.92],[.34,.84]]:[[.315,.735],[.54,.73],[.545,.82],[.51,.915],[.365,.92],[.31,.84]])
      for(const z of [fore,arch,heel])if(z)result.push(z)
    }else if(dorsal){const z=zone('dorsum',left?[[.34,.28],[.68,.28],[.69,.43],[.59,.70],[.40,.71],[.32,.49]]:[[.37,.28],[.75,.28],[.76,.49],[.68,.71],[.48,.70],[.37,.43]]);if(z)result.push(z)}
    else {
      // Only the visible arch and heel in the calibrated side panels are graphic targets.
      for(const item of region.items){const p=locationPoint(measured,view,region,visual,item);if(!p||/edge/.test(item.id))continue;const q=projectedPoint(p,visual);result.push(oval(item.id,item.label,q[0],q[1],/heel/.test(item.id)?.07:.10,.065))}
    }
    if(plantar||dorsal)for(const item of region.items){if(!/toe_[1-5]_(dorsal|plantar)$/.test(item.id))continue;const p=locationPoint(measured,view,region,visual,item);if(!p)continue;const q=projectedPoint(p,visual),i=Number(item.id.match(/toe_([1-5])/)![1]);result.push(oval(item.id,item.label,q[0],q[1],i===1?.054:.026,i===1?.06:.038))}
    return result
  }
  if(region.id==='head') {
    const girl=measured==='girl'
    const raw: [string,Point[]][]=view==='front' ? [
      ['crown',girl?[[.38,.087],[.45,.057],[.56,.064],[.63,.095],[.57,.122],[.43,.122]]:[[.38,.077],[.46,.045],[.57,.065],[.63,.095],[.56,.115],[.42,.109]]],
      ['frontal_scalp',girl?[[.36,.12],[.44,.109],[.56,.124],[.62,.144],[.632,.159],[.587,.157],[.554,.14],[.514,.177],[.465,.183],[.404,.166],[.355,.152]]:[[.33,.125],[.43,.106],[.53,.119],[.62,.143],[.635,.157],[.595,.161],[.559,.147],[.522,.184],[.43,.184],[.35,.161]]],
      ['temporal_scalp_right',girl?[[.31,.13],[.35,.15],[.365,.19],[.343,.223],[.30,.225]]:[[.30,.13],[.34,.15],[.355,.19],[.34,.22],[.30,.212]]],
      ['temporal_scalp_left',girl?[[.65,.15],[.685,.13],[.705,.215],[.676,.232],[.645,.20]]:[[.655,.15],[.69,.137],[.705,.212],[.672,.22],[.65,.19]]]
    ] : [
      ['crown',girl?[[.39,.093],[.45,.071],[.57,.079],[.63,.11],[.58,.136],[.43,.136]]:[[.37,.085],[.45,.052],[.58,.065],[.64,.10],[.57,.132],[.42,.124]]],
      ['occiput',girl?[[.36,.145],[.47,.137],[.64,.157],[.685,.24],[.62,.289],[.41,.289],[.32,.242]]:[[.34,.142],[.45,.13],[.65,.155],[.68,.217],[.61,.274],[.45,.289],[.36,.248],[.315,.20]]],
      ['temporal_scalp_left',girl?[[.32,.142],[.36,.16],[.34,.245],[.30,.26],[.29,.213]]:[[.30,.125],[.34,.148],[.34,.226],[.31,.22],[.29,.175]]],
      ['temporal_scalp_right',girl?[[.665,.16],[.695,.147],[.715,.22],[.70,.26],[.665,.245]]:[[.66,.148],[.695,.13],[.71,.175],[.69,.22],[.66,.226]]]
    ]
    for(const [suffix,points] of raw){const calibrated=model==='neutral'&&view==='front'?points.map(([x,y])=>[.5+(x-.5)*.90,y+(y<.13?.020:.004)] as Point):points;const z=zone(suffix,calibrated.map(p=>projectedPoint(p,visual)));if(z)result.push(z)}
    return result
  }
  if(model==='neutral' && region.zoom==='face')return result // No reuse of another child's fine face coordinates.
  if(visual.kind==='face') {
    for(const item of region.items){const p=locationPoint(measured,view,region,visual,item);if(!p)continue
      const feature=item.id.replace(/^face_/,'').replace(/_(left|right)$/,'')
      const sizes:Record<string,[number,number]>={forehead:[.095,.035],cheek:[.07,.048],chin:[.059,.026],eyebrow:[.046,.010],upper_eyelid:[.037,.008],lower_eyelid:[.043,.007],nose_bridge:[.016,.026],nose_tip:[.029,.012],upper_lip:[.043,.007],lower_lip:[.043,.009]}
      const s=sizes[feature];if(s)result.push(oval(item.id,item.label,p[0],p[1],...s))
    }
    return result
  }
  const global=bodyZone(model,view,region)
  if(!global)return result
  const visible=region.items.filter(item=>item.coverage==='specific'&&item.views.includes(view)&&item.surface===(categoryId(region.id)==='wrist'?(view==='front'?'palmar':'dorsal'):(view==='front'?'anterior':'posterior')))
  // No arbitrary subdivisions on clothing or invisible medial/lateral anatomy.
  const suffixes:Record<string,string[]>={shoulder:['front','back'],upper_arm:['front','back'],elbow:['crease','tip'],forearm:['front','back'],wrist:['palmar','dorsal'],knee:['front','crease'],thigh:['front','back'],lower_leg:['front','calf'],ankle:['front','back']}
  const allowed=suffixes[categoryId(region.id)]??[]
  // Whole visible limb surface shares its region contour; text-only margins remain available in the drawer.
  return visible.filter(i=>allowed.some(s=>i.id===`${region.id}_${s}`)).map(item=>({...global,id:item.id,label:item.label,path:projectPath(global.path,visual),point:projectedPoint(global.point,visual),bounds:projectBounds(global.bounds,visual)}))
}
function projectPath(path:string,visual:ChildVisual){let coordinate=0;return path.replace(/-?\d*\.?\d+/g,n=>{const i=coordinate++%2;return String((Number(n)-visual.bounds[i])/visual.bounds[i+2])})}
function projectBounds(b:Bounds,v:ChildVisual):Bounds {return [(b[0]-v.bounds[0])/v.bounds[2],(b[1]-v.bounds[1])/v.bounds[3],b[2]/v.bounds[2],b[3]/v.bounds[3]]}
export function cropLocatorZone(zone:LocatorZone,visual:ChildVisual):LocatorZone {return {...zone,path:projectPath(zone.path,visual),point:projectedPoint(zone.point,visual),bounds:projectBounds(zone.bounds,visual)}}
