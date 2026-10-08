import { Check } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { type ChildRegion, type ChildView } from '../../../features/body-location/childBodyCatalog'
import { localAngles, type Bounds, type LocalAngle } from '../../../features/body-location/childBodyGeometry'
import { LOCATOR_CATEGORIES, applicableLocation, categoryId, type LocatorModel } from '../../../features/body-location/locatorDictionary'
import { bodyZone, cropLocatorZone, locatorAssetUrl, locatorVisual, locatorZones, type LocatorZone } from '../../../features/body-location/locatorGeometry'

interface Props {model:LocatorModel;view:ChildView;region?:ChildRegion;angle:LocalAngle;selectedIds:string[];onRegion:(id:string)=>void;onToggle:(id:string)=>void;onOverflow:(ids:string[])=>void;zoom:Bounds|null;onZoom:(bounds:Bounds|null)=>void}
export function LocatorStage({model,view,region,angle,selectedIds,onRegion,onToggle,onOverflow,zoom,onZoom}:Props) {
  const host=useRef<HTMLDivElement>(null)
  const [size,setSize]=useState({width:343,height:340})
  const [status,setStatus]=useState<'loading'|'ready'|'error'>('loading'),[attempt,setAttempt]=useState(0)
  const visual=useMemo(()=>locatorVisual(model,view,region,angle),[model,view,region,angle])
  const selected=new Set(selectedIds)
  useLayoutEffect(()=>{if(!host.current)return;const {width,height}=host.current.getBoundingClientRect();setSize({width,height});const observer=new ResizeObserver(entries=>{const {width,height}=entries[0].contentRect;setSize({width,height})});observer.observe(host.current);return()=>observer.disconnect()},[region?.id,view,angle])
  useEffect(()=>{
    if(!visual)return
    let active=true;setStatus('loading');const img=new Image()
    img.onload=async()=>{await img.decode().catch(()=>undefined);if(active)setStatus(img.naturalWidth===visual.width&&img.naturalHeight===visual.height?'ready':'error')}
    img.onerror=()=>{if(active)setStatus('error')};img.src=locatorAssetUrl(visual)
    return()=>{active=false}
  },[visual,attempt])
  const zones=useMemo(()=>visual?(region?locatorZones(model,view,region,visual):LOCATOR_CATEGORIES.flatMap(c=>c.regions.filter(r=>r.views.includes(view)&&r.items.some(i=>applicableLocation(i,model))).flatMap(r=>{const z=bodyZone(model,view,r);return z?[{...cropLocatorZone(z,visual),id:c.id,label:c.label,sourceRegionId:r.id}]:[]}))):[],[visual,model,view,region])
  const globalOrder=view==='front'?['head','face','neck','shoulder','chest','abdomen','hand','thigh','knee','foot','upper_arm','elbow','forearm','lower_leg','wrist','ankle','ear','hip']:['head','neck','shoulder','back','hand','buttock','thigh','knee','lower_leg','foot','upper_arm','elbow','forearm','wrist','ankle','ear']
  const unique=zones.filter((z,i)=>zones.findIndex(other=>other.id===z.id)===i)
  const availableHeight=Math.max(1,size.height-(region?0:44))
  const rowCount=Math.max(1,Math.floor(availableHeight/48)),capacity=rowCount*2
  const rank=(id:string)=>globalOrder.includes(id)?globalOrder.indexOf(id):999
  const ranked=region?unique:[...unique].sort((a,b)=>rank(a.id)-rank(b.id))
  const visible=ranked.slice(0,capacity).sort((a,b)=>a.point[1]-b.point[1])
  const callouts=visible.map((z,i)=>{
    const column=i%2===0?'left':'right'
    const anchor=region?z:zones.filter(other=>other.id===z.id).sort((a,b)=>column==='left'?a.point[0]-b.point[0]:b.point[0]-a.point[0])[0]
    return {...anchor,column,row:Math.floor(i/2)}
  })
  const overflow=LOCATOR_CATEGORIES.filter(c=>c.regions.some(r=>r.items.some(i=>applicableLocation(i,model)))&&!visible.some(z=>z.id===c.id)).map(c=>c.id)
  const [zx,zy,zw,zh]=zoom??[0,0,1,1]
  const cropRatio=visual ? visual.width*visual.bounds[2]*zw/(visual.height*visual.bounds[3]*zh) : .65
  const column=Math.min(88,Math.max(76,size.width*.23)),gap=8
  const imageW=Math.max(1,Math.min(size.width-column*2-gap*2,(availableHeight-8)*cropRatio)),imageH=imageW/cropRatio
  const ix=(size.width-imageW)/2,iy=(availableHeight-imageH)/2
  const point=(z:LocatorZone)=>[ix+(z.point[0]-zx)/zw*imageW,iy+(z.point[1]-zy)/zh*imageH]
  const isSelected=(z:LocatorZone)=>region?selected.has(z.id):selectedIds.some(id=>LOCATOR_CATEGORIES.find(c=>c.id===z.id)?.regions.some(r=>r.id===z.sourceRegionId&&r.items.some(i=>i.id===id)))
  const activate=(z:LocatorZone)=>{
    if(!region){onRegion(z.id);return}
    const [, ,w,h]=z.bounds
    if(!zoom&&(w*imageW<44||h*imageH<44)){
      const bw=Math.min(1,Math.max(w*3,.20)),bh=Math.min(1,Math.max(h*2,.22))
      onZoom([Math.max(0,Math.min(1-bw,z.point[0]-bw/2)),Math.max(0,Math.min(1-bh,z.point[1]-bh/2)),bw,bh]);return
    }
    onToggle(z.id)
  }
  const viewLabel=region&&(region.zoom==='hand'||region.zoom==='foot') ? localAngles(region).find(item=>item.id===angle)?.label??'' : view==='front'?'正面':'背面'
  return <div className="locator-stage" ref={host} data-asset={visual?.asset} data-angle={visual?.angle} data-visible-entries={visible.map(z=>z.id).join(',')}>
    {visual&&status==='ready'&&<svg className="locator-canvas" viewBox={`0 0 ${size.width} ${size.height}`} aria-label={`${model==='girl'?'女孩':model==='boy'?'男孩':'中性儿童'}${region?region.label:'全身'}${viewLabel}示意图`}>
      <svg x={ix} y={iy} width={imageW} height={imageH} viewBox={`${zx} ${zy} ${zw} ${zh}`} preserveAspectRatio="none">
        <image href={locatorAssetUrl(visual)} x={-visual.bounds[0]/visual.bounds[2]} y={-visual.bounds[1]/visual.bounds[3]} width={1/visual.bounds[2]} height={1/visual.bounds[3]} preserveAspectRatio="none"/>
        {zones.map((z,i)=><g key={`${z.id}:${i}`}><path d={z.path} data-zone-id={z.id} className="locator-zone" data-selected={isSelected(z)} onClick={()=>activate(z)}><title>{z.label}</title></path>{isSelected(z)&&<text className="locator-check" x={z.point[0]} y={z.point[1]} textAnchor="middle" dominantBaseline="middle" fontSize={.045*Math.min(zw,zh)}>✓</text>}</g>)}
      </svg>
      {!zoom&&callouts.map(z=>{const p=point(z);return <path className="locator-leader" key={z.id} d={`M ${p.join(' ')} L ${z.column==='left'?column:size.width-column} ${z.row*48+22}`}/>})}
    </svg>}
    {(!visual||status!=='ready')&&<div className="locator-image-status" role="status">{!visual?'当前部位使用文字选择':status==='loading'?'正在加载图片…':'图片暂时无法加载'}{visual&&status==='error'&&<button type="button" onClick={()=>setAttempt(v=>v+1)}>重试图片</button>}</div>}
    {!zoom&&callouts.map(z=><button className="locator-callout" data-region-id={region?undefined:z.id} data-location-id={region?z.id:undefined} style={{[z.column]:0,top:z.row*48,width:column}} aria-label={z.label} aria-pressed={region?isSelected(z):undefined} key={z.id} onClick={()=>region?onToggle(z.id):onRegion(z.id)} type="button">{isSelected(z)&&<Check size={12}/>}<span>{region?z.label.replace(/^(左|右)/,''):z.label}</span></button>)}
    {zoom&&<button className="locator-zoom-back" type="button" onClick={()=>onZoom(null)}>返回局部图</button>}
    {!region&&<button className="locator-more-trigger" type="button" onClick={()=>onOverflow(overflow)}>更多部位</button>}
  </div>
}
