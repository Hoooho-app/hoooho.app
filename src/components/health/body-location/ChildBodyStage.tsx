import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { CHILD_REGIONS, type ChildLocation, type ChildModel, type ChildRegion, type ChildView } from '../../../features/body-location/childBodyCatalog'
import { assetUrl, childVisual, geometryCompatible, locationPoint, projectedPoint, regionAnchor, regionPolygon, type ChildVisual, type LocalAngle, type Point } from '../../../features/body-location/childBodyGeometry'

interface Props { model: ChildModel; view: ChildView; region?: ChildRegion; angle?: LocalAngle; selectedIds: string[]; selectionNumbers: Record<string,number>; onRegion: (id: string) => void; onToggle: (id: string) => void }
interface Callout { id: string; label: string; point: Point; selected: boolean; number?: number }

function Illustration({ visual, children }: { visual: ChildVisual; children: React.ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'mismatch'>('loading')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setStatus('loading')
    const image = new Image()
    image.onload = () => { if (active) setStatus(image.naturalWidth === visual.width && image.naturalHeight === visual.height && geometryCompatible() ? 'ready' : 'mismatch') }
    image.onerror = () => { if (active) setStatus('error') }
    image.src = assetUrl(visual.asset)
    return () => { active = false }
  }, [visual.asset, visual.width, visual.height, attempt])
  if (status !== 'ready') return <div className="child-body-image-status" role="status"><p>{status === 'loading' ? '正在加载身体示意图…' : status === 'mismatch' ? '示意图暂不可用，请通过部位名称选择。' : '图片加载失败，仍可通过部位名称选择。'}</p>{status !== 'loading' && <button onClick={() => setAttempt(value => value + 1)} type="button">重新加载图片</button>}</div>
  return children
}

export function ChildBodyStage(props: Props) {
  const { model, view, region, angle, selectedIds, selectionNumbers, onRegion, onToggle } = props
  const visual = childVisual(model, view, region, angle)
  if (!visual) return <p className="child-body-text-reference">通过下方具体名称选择位置。</p>
  const [bx,by,bw,bh] = visual.bounds
  const cropW = bw * visual.width, cropH = bh * visual.height
  const scale = Math.min(242 / cropW, (region ? 294 : 308) / cropH)
  const width = cropW*scale, height = cropH*scale
  const imageX = (360-width)/2, imageY = region ? 8+(294-height)/2 : 0
  const stageHeight = 310
  const screen = (point: Point): Point => { const p = projectedPoint(point, visual); return [imageX+p[0]*width,imageY+p[1]*height] }
  const selected = new Set(selectedIds)
  const points: Callout[] = region ? region.items.filter(item => item.sex.includes(model)).flatMap((item: ChildLocation) => {
    const p = locationPoint(model,view,region,visual,item)
    return p ? [{ id:item.id, label:item.label, point:screen(p), selected:selected.has(item.id), number:selectionNumbers[item.id] }] : []
  }) : []
  const preferred = view === 'front' ? ['head','face','neck','shoulder_right','chest','abdomen','elbow_left','hand_right','knee_left','foot_right'] : ['head','neck','shoulder_left','back','elbow_right','hand_left','buttock_right','knee_left','lower_leg_right','foot_left']
  const summaryPoints: Callout[] = preferred.flatMap(id => {
    const r = CHILD_REGIONS.find(item => item.id === id), a = regionAnchor(model,view,id)
    if (!r || !a) return []
    const count = r.items.filter(item => selected.has(item.id)).length
    return [{id,label:r.label,point:screen(a.anchor as unknown as Point),selected:count>0}]
  })
  const featured = region?.zoom === 'face' ? ['face_upper_eyelid_right','face_lower_eyelid_right','face_nose_tip','face_upper_eyelid_left','face_lower_eyelid_left','face_cheek_left'] : []
  const base = region ? (featured.length ? points.filter(item => featured.includes(item.id)) : points.slice(0,6)) : summaryPoints
  // Keep a bounded number of legible labels; every other item remains directly selectable in the same-level list.
  const callouts = base.map((item,index) => ({...item,side: (item.point[0]<176 ? 'left' : item.point[0]>184 ? 'right' : index%2 ? 'right' : 'left') as 'left'|'right',y:0}))
  for (const side of ['left','right']) {
    const column = callouts.filter(item=>item.side===side).sort((a,b)=>a.point[1]-b.point[1])
    column.forEach((item,index)=>{item.y = 8+index*(stageHeight-60)/Math.max(1,column.length-1)})
  }
  const svgPolygons = !region ? CHILD_REGIONS.filter(r=>r.views.includes(view)).flatMap(r=>{
    const polygon = regionPolygon(model,view,r)
    return polygon ? [{region:r,polygon}] : []
  }) : []
  const activePolygon = region && visual.kind === 'body' ? regionPolygon(model,view,region) : null
  // Crowded landmarks retain text selections; never stack numbered targets on a lip/eyelid.
  const markers = (region ? points.filter(item=>item.selected || callouts.some(c=>c.id===item.id)) : summaryPoints).filter((item,_index,items)=>!region || !items.some(other=>other.id!==item.id && (other.selected || !item.selected) && Math.hypot(item.point[0]-other.point[0],item.point[1]-other.point[1])<24))
  const missing = region ? region.items.filter(item=>selected.has(item.id) && !markers.some(p=>p.id===item.id)).length : 0
  return <>
    <Illustration key={visual.asset} visual={visual}>
      <div className="child-body-stage" data-asset={visual.asset} data-angle={visual.angle} style={{aspectRatio:`360 / ${stageHeight}`}}>
        <svg className="child-body-canvas" viewBox={`0 0 360 ${stageHeight}`} aria-label={`${model === 'girl' ? '女孩' : '男孩'}${view === 'front' ? '正面' : '背面'}${region ? ` · ${region.label}` : '全身'}示意图`} role="img">
          <svg x={imageX} y={imageY} width={width} height={height} viewBox={`${bx*visual.width} ${by*visual.height} ${cropW} ${cropH}`}>
            <image href={assetUrl(visual.asset)} width={visual.width} height={visual.height}/>
            {activePolygon && <polygon className="child-body-active-region" points={activePolygon.map(([x,y])=>`${x*visual.width},${y*visual.height}`).join(' ')}/>}
            {svgPolygons.map(({region:r,polygon})=><polygon key={r.id} data-region-hit={r.id} points={polygon.map(([x,y])=>`${x*visual.width},${y*visual.height}`).join(' ')} className="child-body-region-hit" data-selected={r.items.some(item=>selected.has(item.id))} onClick={()=>onRegion(r.id)}><title>{r.label}</title></polygon>)}
          </svg>
          {callouts.map(item=><path className="child-body-leader" key={item.id} d={`M ${item.point.join(' ')} L ${item.side==='left' ? 92 : 268} ${item.y+22}`}/>)}
          {markers.map(item=><g key={item.id} className="child-body-point" data-location-marker={region ? item.id : undefined} data-selected={item.selected} onClick={()=>region ? onToggle(item.id) : onRegion(item.id)}><title>{item.label}</title><circle cx={item.point[0]} cy={item.point[1]} r={item.selected&&region ? 10 : 4}/>{item.selected && region && <text x={item.point[0]} y={item.point[1]+3.5} textAnchor="middle">{item.number}</text>}</g>)}
        </svg>
        {callouts.map(item=><button key={item.id} className="child-body-callout" aria-pressed={region ? item.selected : undefined} aria-label={region ? item.label : `展开${item.label}`} data-selected={item.selected} style={{[item.side]:0,top:`${item.y/stageHeight*100}%`}} onClick={()=>region ? onToggle(item.id) : onRegion(item.id)} type="button">{item.selected&&<Check size={14}/>}<span>{item.label}</span></button>)}
      </div>
    </Illustration>
    <p className="child-body-orientation">{region ? missing ? `另有 ${missing} 处以已选名称保留，当前图不显示精确点。` : '左右按孩子自身方向' : `画面左为孩子${view==='front'?'右':'左'}侧 · 画面右为孩子${view==='front'?'左':'右'}侧`}</p>
  </>
}
