import './FactCharts.css'
import type { MouseEvent } from 'react'

export function FactDistribution({
  values,
}: {
  values: Array<{ label: string; count: number }>
}) {
  const total = values.reduce((sum, value) => sum + value.count, 0)
  let offset = 0
  return (
    <figure className="hoho-fact-distribution">
      {total > 0 && values.filter((v) => v.count > 0).length > 1 && (
        <svg
          viewBox="0 0 120 120"
          role="img"
          aria-label={values.map((v) => `${v.label} ${v.count} 条`).join('，')}
        >
          {values.map((value, index) => {
            const length = (value.count / total) * 100
            const start = offset
            offset += length
            return (
              <circle
                key={value.label}
                cx="60"
                cy="60"
                r="44"
                fill="none"
                strokeWidth="13"
                pathLength="100"
                strokeDasharray={`${length} ${100 - length}`}
                strokeDashoffset={-start}
                transform="rotate(-90 60 60)"
                className={`hoho-chart-tone-${index % 4}`}
              />
            )
          })}
          <text x="60" y="62" textAnchor="middle" className="hoho-chart-total">
            {total}
          </text>
          <text x="60" y="79" textAnchor="middle" className="hoho-chart-unit">
            条记录
          </text>
        </svg>
      )}
      <figcaption>
        {values.map((value, index) => (
          <div key={value.label}>
            <span
              className={`hoho-chart-key hoho-chart-tone-${index % 4}`}
              aria-hidden="true"
            />
            <span>{value.label}</span>
            <strong>{value.count}</strong>
          </div>
        ))}
      </figcaption>
    </figure>
  )
}
export function FactLineChart({
  points,
  unit,
  label,
  onPoint,
  scatter = false,
  domain,
  accessibleLabel,
  interactivePoints = false,
  presentation = 'default', selectedSourceId,
}: {
  points: Array<{ value: number; at: string; sourceId: string }>
  unit: string
  label: string
  onPoint?: (id: string) => void
  scatter?: boolean
  domain?: [number, number]
  accessibleLabel?: string
  interactivePoints?: boolean
  presentation?: 'default' | 'temperature'
  selectedSourceId?: string
}) {
  if (points.length < 2) return null
  if(presentation==='temperature'){
    const ordered=[...points].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)||a.sourceId.localeCompare(b.sourceId)),w=350,h=246,left=38,right=14,top=22,bottom=45
    const min=Math.floor((Math.min(...ordered.map(p=>p.value))-.2)*2)/2,max=Math.max(min+.5,Math.ceil((Math.max(...ordered.map(p=>p.value))+.2)*2)/2),start=Date.parse(ordered[0].at),span=Date.parse(ordered.at(-1)!.at)-start||1
    const x=(p:typeof ordered[number])=>left+(Date.parse(p.at)-start)/span*(w-left-right),y=(value:number)=>top+(max-value)/(max-min)*(h-top-bottom),shown=new Set([0,Math.floor((ordered.length-1)/2),ordered.length-1])
    const date=(at:string)=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit'}).format(new Date(at)).split('/').reverse().join('/'),time=(at:string)=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(at)),selected=ordered.find(p=>p.sourceId===selectedSourceId)
    const fullTime=(at:string)=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(at))
    const selectNearest=(event:MouseEvent<SVGGElement>,fallback:string)=>{
      const matrix=event.currentTarget.ownerSVGElement?.getScreenCTM()
      if(!matrix||event.detail===0){onPoint?.(fallback);return}
      const pointer=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse()),distances=ordered.map(p=>({p,distance:Math.hypot(pointer.x-x(p),pointer.y-y(p.value))})),nearest=Math.min(...distances.map(p=>p.distance))
      const candidates=distances.filter(p=>p.distance<=nearest+.01).map(({p})=>p),index=candidates.findIndex(p=>p.sourceId===selectedSourceId)
      onPoint?.(candidates[(index+1)%candidates.length].sourceId)
    }
    return <svg className="hoho-fact-line hoho-fact-line--temperature" viewBox={`0 0 ${w} ${h}`} role="group" aria-label={accessibleLabel??label}>
      <text x={4} y={13}>{unit}</text>{[0,1,2].map(i=>{const value=min+(max-min)*i/2;return <g key={i}><line x1={left} y1={y(value)} x2={w-right} y2={y(value)} className="hoho-chart-axis"/><text x={left-8} y={y(value)+4} textAnchor="end">{value.toFixed(1)}</text></g>})}
      <polyline points={ordered.map(p=>`${x(p)},${y(p.value)}`).join(' ')} fill="none" className="hoho-chart-trace" strokeWidth={2.3}/>
      {ordered.map((p,i)=><g key={p.sourceId}><g role="button" tabIndex={0} aria-label={`${fullTime(p.at)} · ${p.value} ${unit}`} aria-pressed={p.sourceId===selectedSourceId} onClick={event=>selectNearest(event,p.sourceId)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onPoint?.(p.sourceId)}}}><circle cx={x(p)} cy={y(p.value)} r={22} fill="transparent"/><circle cx={x(p)} cy={y(p.value)} r={4} className="hoho-chart-point"/></g>{shown.has(i)&&<><text x={x(p)} y={h-25} textAnchor={i===0?'start':i===ordered.length-1?'end':'middle'}>{date(p.at)}</text><text x={x(p)} y={h-9} textAnchor={i===0?'start':i===ordered.length-1?'end':'middle'}>{time(p.at)}</text></>}</g>)}
      {selected&&<g pointerEvents="none" transform={`translate(${Math.min(w-156,Math.max(0,x(selected)-76))},${Math.max(0,y(selected.value)-35)})`}><rect width={152} height={24} rx={7} className="hoho-chart-tooltip"/><text x={76} y={16} textAnchor="middle" role="status">{date(selected.at)} {time(selected.at)} · {selected.value} {unit}</text></g>}
    </svg>
  }
  const times = points.map((p) => Date.parse(p.at)),
    values = points.map((p) => p.value)
  const minTime = Math.min(...times),
    span = Math.max(...times) - minTime || 1
  const axisTime = (at: string) =>
    new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      ...(span <= 86400000
        ? ({ hour: '2-digit', minute: '2-digit' } as const)
        : ({ month: 'numeric', day: 'numeric' } as const)),
    }).format(new Date(at))
  const min = Math.min(...values, domain?.[0] ?? Infinity),
    max = Math.max(...values, domain?.[1] ?? -Infinity),
    pad = domain ? 0 : Math.max((max - min) * 0.15, 0.1)
  const coords = points.map((p, i) => ({
    x: 42 + ((times[i] - minTime) / span) * 250,
    y: 125 - ((p.value - min + pad) / (max - min + pad * 2)) * 100,
  }))
  return (
    <svg
      className="hoho-fact-line"
      viewBox="0 0 320 162"
      role={interactivePoints?'group':'img'}
      aria-label={accessibleLabel ?? `${label}，${points.length} 个测量点，具体数值见下方列表`}
    >
      <text x="4" y="15">
        {unit}
      </text>
      <text x="2" y="37">
        {max}
      </text>
      <text x="2" y="129">
        {min}
      </text>
      <path d="M40 22 V130 H300" className="hoho-chart-axis" fill="none" />
      {!scatter && <polyline
        points={coords.map((p) => `${p.x},${p.y}`).join(' ')}
        fill="none"
        className="hoho-chart-trace"
        strokeWidth="2"
      />}
      {points.map((p, i) => (
        <g key={`${p.sourceId}:${i}`} role={interactivePoints?'button':undefined} tabIndex={interactivePoints?0:undefined} aria-label={interactivePoints?`${new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(p.at))} · ${p.value} ${unit}`:undefined} onClick={interactivePoints?()=>onPoint?.(p.sourceId):undefined} onKeyDown={interactivePoints?event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onPoint?.(p.sourceId)}}:undefined}>
          {interactivePoints&&<circle cx={coords[i].x} cy={coords[i].y} r="20" fill="transparent"/>}
          <circle
            cx={coords[i].x}
            cy={coords[i].y}
            r="4"
            className="hoho-chart-point"
            onClick={onPoint&&!interactivePoints ? () => onPoint(p.sourceId) : undefined}
          />
          <title>
            {p.at} · {p.value} {unit}
          </title>
        </g>
      ))}
      <text x="40" y="153">
        {axisTime(points[0].at)}
      </text>
      <text x="300" y="153" textAnchor="end">
        {axisTime(points.at(-1)!.at)}
      </text>
    </svg>
  )
}
