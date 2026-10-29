import type { ReactNode } from 'react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { type ChildRegion, type ChildView } from '../../../features/body-location/childBodyCatalog'
import { localAngles, type Bounds, type LocalAngle } from '../../../features/body-location/childBodyGeometry'
import { type LocatorModel } from '../../../features/body-location/locatorDictionary'
import { locatorAssetUrl, type LocatorZone } from '../../../features/body-location/locatorGeometry'
import { graphicalVisual, graphicalZones } from '../../../features/body-location/graphicalLocator'

interface Props {model:LocatorModel;view:ChildView;region?:ChildRegion;angle:LocalAngle;selectedIds:string[];onRegion:(id:string)=>void;onToggle:(id:string)=>void;controls?:ReactNode;zoom:Bounds|null;onZoom:(bounds:Bounds|null)=>void}
export function LocatorStage({model,view,region,angle,selectedIds,onRegion,onToggle,controls,zoom,onZoom}:Props) {
  const host=useRef<HTMLDivElement>(null)
  const [size,setSize]=useState({width:343,height:340})
  const [status,setStatus]=useState<'loading'|'ready'|'error'>('loading'),[attempt,setAttempt]=useState(0)
  const visual=useMemo(()=>graphicalVisual(model,view,region,angle),[model,view,region,angle])
  const selected=new Set(selectedIds)
  useLayoutEffect(()=>{if(!host.current)return;const {width,height}=host.current.getBoundingClientRect();setSize({width,height});const observer=new ResizeObserver(entries=>{const {width,height}=entries[0].contentRect;setSize({width,height})});observer.observe(host.current);return()=>observer.disconnect()},[region?.id,view,angle])
  useEffect(()=>{
    if(!visual)return
    let active=true;setStatus('loading');const img=new Image()
    img.onload=async()=>{await img.decode().catch(()=>undefined);if(active)setStatus(img.naturalWidth===visual.width&&img.naturalHeight===visual.height?'ready':'error')}
    img.onerror=()=>{if(active)setStatus('error')};img.src=locatorAssetUrl(visual)
    return()=>{active=false}
  },[visual,attempt])
  const zones=useMemo(()=>visual?graphicalZones(model,view,region,visual):[],[visual,model,view,region])
  const availableHeight=Math.max(1,size.height-52)
  const [zx,zy,zw,zh]=zoom??[0,0,1,1]
  const cropRatio=visual ? visual.width*visual.bounds[2]*zw/(visual.height*visual.bounds[3]*zh) : .65
  const imageW=Math.max(1,Math.min(size.width-16,(availableHeight-8)*cropRatio)),imageH=imageW/cropRatio
  const ix=(size.width-imageW)/2,iy=52+(availableHeight-imageH)/2
  const isSelected=(z:LocatorZone)=>selected.has(z.id)
  const activate=(z:LocatorZone)=>{if(!region){onRegion(z.id);return}if(z.id.startsWith('hand_')&&z.id.endsWith('_whole')&&!z.id.match(/_(thumb|index|middle|ring|little)_/)){onRegion(z.id.replace(/_whole$/, ''));return}if(z.id.startsWith('foot_')&&z.id.endsWith('_whole')){onRegion(z.id.replace(/_whole$/, ''));return}onToggle(z.id)}
  const viewLabel=region&&(region.zoom==='hand'||region.zoom==='foot') ? localAngles(region).find(item=>item.id===angle)?.label??'' : view==='front'?'正面':'背面'
  return <div className="locator-stage" ref={host} data-asset={visual?.asset} data-source-bounds={visual?.bounds.join(',')} data-detail-kind={visual?.detail?.kind} data-angle={visual?.angle} data-visible-entries={zones.map(z=>z.id).join(',')}>
    {visual&&status==='ready'&&<svg className="locator-canvas" viewBox={`0 0 ${size.width} ${size.height}`} role="group" aria-label={`${model==='girl'?'女孩':model==='boy'?'男孩':'中性儿童'}${region?region.label:'全身'}${viewLabel}示意图`}>
      <svg x={ix} y={iy} width={imageW} height={imageH} viewBox={`${zx} ${zy} ${zw} ${zh}`} preserveAspectRatio="none">
        <image href={locatorAssetUrl(visual)} x={-visual.bounds[0]/visual.bounds[2]} y={-visual.bounds[1]/visual.bounds[3]} width={1/visual.bounds[2]} height={1/visual.bounds[3]} preserveAspectRatio="none"/>
        {zones.map((z,i)=><g key={`${z.id}:${i}`}><path d={z.path} data-zone-id={z.id} className="locator-zone" role="button" tabIndex={0} aria-label={z.label} aria-pressed={region?isSelected(z):undefined} data-region-id={region?undefined:z.id} data-location-id={region?z.id:undefined} data-selected={isSelected(z)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activate(z)}}} onClick={()=>activate(z)}><title>{z.label}</title></path>{isSelected(z)&&<text className="locator-check" x={z.point[0]} y={z.point[1]} textAnchor="middle" dominantBaseline="middle" fontSize={.045*Math.min(zw,zh)}>✓</text>}</g>)}
      </svg>

    </svg>}
    {(!visual||status!=='ready')&&<div className="locator-image-status" role="status">{!visual?'当前图片暂不可用':status==='loading'?'正在加载图片…':'图片暂时无法加载'}{visual&&status==='error'&&<button type="button" onClick={()=>setAttempt(v=>v+1)}>重试图片</button>}</div>}
    <div className="locator-image-controls">{controls}</div>
  </div>
}
