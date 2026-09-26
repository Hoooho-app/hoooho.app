import './FactCharts.css'

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
}: {
  points: Array<{ value: number; at: string; sourceId: string }>
  unit: string
  label: string
  onPoint?: (id: string) => void
  scatter?: boolean
  domain?: [number, number]
}) {
  if (points.length < 2) return null
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
      role="img"
      aria-label={`${label}，${points.length} 个测量点，具体数值见下方列表`}
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
        <g key={`${p.sourceId}:${i}`}>
          <circle
            cx={coords[i].x}
            cy={coords[i].y}
            r="4"
            className="hoho-chart-point"
            onClick={onPoint ? () => onPoint(p.sourceId) : undefined}
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
