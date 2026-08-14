import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import type { BodyLocationAtlasKey, BodyLocationLaterality, BodyLocationOption, BodyLocationView } from '../../../features/body-location'

interface AtlasProps {
  atlas: BodyLocationAtlasKey
  laterality: Extract<BodyLocationLaterality, 'left' | 'right'>
  options: readonly BodyLocationOption[]
  selectedIds: Set<string>
  view: BodyLocationView
  onToggle: (item: BodyLocationOption) => void
}

interface ZoneShape {
  id: string
  d: string
  labelX?: number
  labelY?: number
}

const surface = 'rgb(var(--hoho-color-surface))'
const canvas = 'rgb(var(--hoho-color-background))'
const border = 'rgb(var(--hoho-color-border-strong))'
const primary = 'rgb(var(--hoho-color-primary))'
const primarySoft = 'rgb(var(--hoho-color-primary-soft))'

const sideId = (id: string, laterality: 'left' | 'right') => `${id}_${laterality}`

function InteractiveZones({ shapes, options, selectedIds, onToggle }: { shapes: readonly ZoneShape[]; options: readonly BodyLocationOption[]; selectedIds: Set<string>; onToggle: AtlasProps['onToggle'] }) {
  const optionMap = new Map(options.map((item) => [item.id, item]))
  return <>{shapes.map((shape) => {
    const item = optionMap.get(shape.id)
    if (!item) return null
    const selected = selectedIds.has(item.id)
    return <g aria-label={item.label} aria-pressed={selected} className="body-atlas-zone" key={item.id} onClick={() => onToggle(item)} onKeyDown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onToggle(item) }
    }} role="button" tabIndex={0}>
      <path d={shape.d} fill={selected ? primary : primarySoft} fillOpacity={selected ? 0.78 : 0.78} stroke={selected ? primary : border} strokeLinejoin="round" strokeWidth={selected ? 2.2 : 1.2} />
      {selected && shape.labelX != null && shape.labelY != null && <g aria-hidden="true" transform={`translate(${shape.labelX} ${shape.labelY})`}><circle fill={surface} r="9" /><path d="m-4 0 3 3 6-7" fill="none" stroke={primary} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></g>}
    </g>
  })}</>
}

function ViewCaption({ children }: { children: ReactNode }) {
  return <text fill="rgb(var(--hoho-color-text-weak))" fontSize="11" fontWeight="600" textAnchor="middle" x="160" y="344">{children}</text>
}

function HeadAtlas(props: AtlasProps) {
  const front = props.view === 'front'
  const shapes: ZoneShape[] = front ? [
    { id: 'head_crown', d: 'M111 82C114 32 206 32 209 82L194 91C171 79 149 79 126 91Z', labelX: 160, labelY: 64 },
    { id: 'head_forehead', d: 'M126 91C149 79 171 79 194 91L193 133H127Z', labelX: 160, labelY: 109 },
    { id: 'head_temple_left', d: 'M111 88C101 103 101 135 112 151L128 140L127 93Z', labelX: 116, labelY: 118 },
    { id: 'head_temple_right', d: 'M209 88C219 103 219 135 208 151L192 140L193 93Z', labelX: 204, labelY: 118 },
    { id: 'head_face_left', d: 'M112 151L128 140H160V219C133 215 117 188 112 151Z', labelX: 139, labelY: 175 },
    { id: 'head_face_right', d: 'M208 151L192 140H160V219C187 215 203 188 208 151Z', labelX: 181, labelY: 175 }
  ] : [
    { id: 'head_crown', d: 'M111 82C114 32 206 32 209 82L194 96H126Z', labelX: 160, labelY: 65 },
    { id: 'head_back_left', d: 'M111 82L126 96H160V189C132 188 111 164 106 127Z', labelX: 135, labelY: 132 },
    { id: 'head_back_right', d: 'M209 82L194 96H160V189C188 188 209 164 214 127Z', labelX: 185, labelY: 132 },
    { id: 'head_occipital', d: 'M124 189C141 217 179 217 196 189L160 169Z', labelX: 160, labelY: 194 }
  ]
  return <svg aria-label={`头部${front ? '正面' : '后面'}定位图`} className="body-atlas-svg" role="img" viewBox="0 0 320 360">
    <path d="M111 82C111 38 209 38 209 82C225 98 221 160 202 193C191 218 178 231 160 231C142 231 129 218 118 193C99 160 95 98 111 82Z" fill={surface} stroke={border} strokeWidth="2" />
    <InteractiveZones {...props} shapes={shapes} />
    {front && <g aria-hidden="true" fill="none" stroke={border} strokeLinecap="round"><path d="M137 132q10-7 20 0M183 132q-10-7-20 0M160 137v24l-7 6h14M144 187q16 10 32 0" /><circle cx="146" cy="137" fill={border} r="2" /><circle cx="174" cy="137" fill={border} r="2" /></g>}
    <path d="M140 230v22M180 230v22M140 252l-42 19M180 252l42 19" fill="none" stroke={border} strokeLinecap="round" strokeWidth="2" />
    <ViewCaption>{front ? '头面轮廓 · 正面' : '头部轮廓 · 后面'}</ViewCaption>
  </svg>
}

function ChestAtlas(props: AtlasProps) {
  const front = props.view === 'front'
  const shapes: ZoneShape[] = front ? [
    { id: 'chest_upper_left', d: 'M93 85C110 66 133 60 154 67V108H92Z', labelX: 124, labelY: 88 },
    { id: 'chest_upper_right', d: 'M166 67C187 60 210 66 227 85L228 108H166Z', labelX: 196, labelY: 88 },
    { id: 'chest_left', d: 'M92 108H154V174C132 173 108 163 94 148Z', labelX: 124, labelY: 137 },
    { id: 'chest_center', d: 'M154 67H166V184L160 196L154 184Z', labelX: 160, labelY: 128 },
    { id: 'chest_right', d: 'M166 108H228L226 148C212 163 188 173 166 174Z', labelX: 196, labelY: 137 },
    { id: 'chest_left_rib', d: 'M94 148C108 163 132 173 154 174V205C128 202 108 193 96 180Z', labelX: 125, labelY: 183 },
    { id: 'chest_right_rib', d: 'M226 148C212 163 188 173 166 174V205C192 202 212 193 224 180Z', labelX: 195, labelY: 183 },
    { id: 'chest_wall_left', d: 'M76 92L92 85L96 180L82 204C68 166 67 124 76 92Z', labelX: 84, labelY: 139 },
    { id: 'chest_wall_right', d: 'M244 92L228 85L224 180L238 204C252 166 253 124 244 92Z', labelX: 236, labelY: 139 }
  ] : [
    { id: 'chest_scapular_left', d: 'M91 82C111 65 137 64 154 72V150C126 149 102 137 90 116Z', labelX: 124, labelY: 108 },
    { id: 'chest_scapular_right', d: 'M166 72C183 64 209 65 229 82L230 116C218 137 194 149 166 150Z', labelX: 196, labelY: 108 },
    { id: 'chest_spine', d: 'M154 72H166V222H154Z', labelX: 160, labelY: 152 },
    { id: 'chest_back_left', d: 'M90 116C102 137 126 149 154 150V222C126 220 103 208 92 187Z', labelX: 124, labelY: 178 },
    { id: 'chest_back_right', d: 'M230 116C218 137 194 149 166 150V222C194 220 217 208 228 187Z', labelX: 196, labelY: 178 }
  ]
  return <svg aria-label={`胸部${front ? '正面' : '背面'}定位图`} className="body-atlas-svg" role="img" viewBox="0 0 320 360">
    <path d="M103 43C111 67 81 63 72 91C60 130 66 193 91 235C107 251 133 258 160 258C187 258 213 251 229 235C254 193 260 130 248 91C239 63 209 67 217 43C196 53 181 58 160 58C139 58 124 53 103 43Z" fill={surface} stroke={border} strokeLinejoin="round" strokeWidth="2" />
    <InteractiveZones {...props} shapes={shapes} />
    <path d="M102 43c13 15 28 20 58 20s45-5 58-20M91 235c22-10 116-10 138 0" fill="none" stroke={border} strokeLinecap="round" />
    <ViewCaption>{front ? '胸廓轮廓 · 正面' : '胸廓轮廓 · 背面'}</ViewCaption>
  </svg>
}

const abdomenShapes: ZoneShape[] = [
  { id: 'abdomen_left_upper', d: 'M94 96C111 82 132 78 151 82V135H91Z', labelX: 123, labelY: 108 },
  { id: 'abdomen_upper', d: 'M151 82C157 79 163 79 169 82V135H151Z', labelX: 160, labelY: 108 },
  { id: 'abdomen_right_upper', d: 'M169 82C188 78 209 82 226 96L229 135H169Z', labelX: 197, labelY: 108 },
  { id: 'abdomen_left_side', d: 'M91 135H151V190H88Z', labelX: 121, labelY: 162 },
  { id: 'abdomen_navel', d: 'M151 135H169V190H151Z', labelX: 160, labelY: 162 },
  { id: 'abdomen_right_side', d: 'M169 135H229L232 190H169Z', labelX: 199, labelY: 162 },
  { id: 'abdomen_left_lower', d: 'M88 190H151V245C126 241 104 231 91 215Z', labelX: 122, labelY: 217 },
  { id: 'abdomen_lower', d: 'M151 190H169V247C163 249 157 249 151 247Z', labelX: 160, labelY: 218 },
  { id: 'abdomen_right_lower', d: 'M169 190H232L229 215C216 231 194 241 169 245Z', labelX: 198, labelY: 217 }
]

function AbdomenAtlas(props: AtlasProps) {
  const reference = props.view === 'organ-reference'
  return <div className="grid gap-2">
    <svg aria-label={reference ? '腹部器官位置参照图' : '腹部表面位置定位图'} className="body-atlas-svg" role="img" viewBox="0 0 320 360">
      <path d="M110 46C117 69 89 72 82 101C73 141 78 205 94 236C110 258 133 268 160 268C187 268 210 258 226 236C242 205 247 141 238 101C231 72 203 69 210 46C190 55 178 59 160 59C142 59 130 55 110 46Z" fill={surface} stroke={border} strokeLinejoin="round" strokeWidth="2" />
      <path d="M92 106C112 80 136 77 160 85C184 77 208 80 228 106M89 219C110 248 210 248 231 219" fill="none" stroke={border} strokeLinecap="round" />
      {!reference && <InteractiveZones {...props} shapes={abdomenShapes} />}
      {reference && <g aria-hidden="true" strokeWidth="1.4">
        <path d="M161 99C184 82 219 91 220 118C220 143 191 149 164 137Z" fill="rgb(var(--hoho-color-warning) / 0.22)" stroke="rgb(var(--hoho-color-warning))" />
        <path d="M201 132c10-8 17 3 8 15-10 6-16-8-8-15Z" fill="rgb(var(--hoho-color-success) / 0.25)" stroke="rgb(var(--hoho-color-success))" />
        <path d="M150 104c-23-10-37 13-27 41 5 15 21 22 34 12 9-8 1-19-7-25Z" fill="rgb(var(--hoho-color-error) / 0.16)" stroke="rgb(var(--hoho-color-error))" />
        <path d="M112 139c-11-5-20 6-17 19 4 14 17 18 24 8 5-8 2-22-7-27Z" fill="rgb(var(--hoho-color-primary) / 0.18)" stroke={primary} />
        <path d="M122 166c25-15 62-13 82 5 14 13 12 39-2 52-19 18-62 18-82 1-18-16-18-45 2-58Z" fill="none" stroke="rgb(var(--hoho-color-warning))" strokeWidth="8" />
        <path d="M139 176c14-10 35-6 39 7 5 15-17 14-11 28 5 11-17 18-26 6-8-11 10-17 1-27-7-8-10-9-3-14Z" fill="rgb(var(--hoho-color-warning) / 0.12)" stroke="rgb(var(--hoho-color-warning))" />
      </g>}
      <circle cx="160" cy="163" fill={reference ? border : surface} r="3" stroke={border} />
      <ViewCaption>{reference ? '器官大致位置 · 仅供理解' : '腹部轮廓 · 表面位置'}</ViewCaption>
    </svg>
    {reference && <div className="grid grid-cols-3 gap-1.5 text-center text-xs text-text-secondary"><span>肝脏 / 胆囊</span><span>胃 / 脾</span><span>肠道</span></div>}
    {reference && <p className="rounded-control bg-primary-soft px-3 py-2 text-xs leading-5 text-text-secondary">器官位置仅帮助理解，不代表疼痛来源。症状位置仍按身体表面区域保存。</p>}
  </div>
}

function BackAtlas(props: AtlasProps) {
  const shapes: ZoneShape[] = [
    { id: 'back_scapular_left', d: 'M91 85C108 65 137 66 154 76V137C127 136 105 125 92 106Z', labelX: 124, labelY: 102 },
    { id: 'back_scapular_right', d: 'M166 76C183 66 212 65 229 85L228 106C215 125 193 136 166 137Z', labelX: 196, labelY: 102 },
    { id: 'back_upper', d: 'M92 106C105 125 127 136 154 137H166C193 136 215 125 228 106L226 164H94Z', labelX: 160, labelY: 145 },
    { id: 'back_middle', d: 'M94 164H226L221 213C194 225 126 225 99 213Z', labelX: 160, labelY: 193 },
    { id: 'back_lower_left', d: 'M99 213C116 220 135 224 154 224V272C126 269 106 258 96 242Z', labelX: 126, labelY: 242 },
    { id: 'back_lower_right', d: 'M221 213C204 220 185 224 166 224V272C194 269 214 258 224 242Z', labelX: 194, labelY: 242 },
    { id: 'back_lower', d: 'M154 137H166V272H154Z', labelX: 160, labelY: 236 }
  ]
  return <svg aria-label="腰背部背面定位图" className="body-atlas-svg" role="img" viewBox="0 0 320 360">
    <path d="M104 45C111 67 82 69 74 98C63 138 70 218 94 258C111 277 134 283 160 283C186 283 209 277 226 258C250 218 257 138 246 98C238 69 209 67 216 45C197 54 180 58 160 58C140 58 123 54 104 45Z" fill={surface} stroke={border} strokeWidth="2" />
    <InteractiveZones {...props} shapes={shapes} />
    <path d="M160 72v196M105 91c19 13 31 18 49 20M215 91c-19 13-31 18-49 20" fill="none" stroke={border} strokeLinecap="round" />
    <ViewCaption>腰背轮廓 · 背面</ViewCaption>
  </svg>
}

function HandAtlas(props: AtlasProps) {
  const side = props.laterality
  const ids = (base: string) => sideId(base, side)
  const shapes: ZoneShape[] = [
    { id: ids('hand_wrist'), d: 'M126 275H194L189 319H131Z', labelX: 160, labelY: 294 },
    { id: ids('hand_thumb'), d: 'M126 175C103 154 88 159 83 172C77 190 105 213 127 222Z', labelX: 105, labelY: 190 },
    { id: ids('hand_index'), d: 'M126 169L119 68C118 48 141 45 144 66L149 168Z', labelX: 133, labelY: 105 },
    { id: ids('hand_middle'), d: 'M149 168L148 45C148 24 173 24 173 45L171 168Z', labelX: 160, labelY: 92 },
    { id: ids('hand_ring'), d: 'M171 168L176 61C177 41 201 43 201 63L194 172Z', labelX: 188, labelY: 105 },
    { id: ids('hand_little'), d: 'M194 172L204 94C207 75 229 82 226 101L215 190Z', labelX: 213, labelY: 126 },
    ...(props.view === 'palm' ? [
      { id: ids('hand_thenar'), d: 'M126 175C143 177 151 201 150 238L127 222Z', labelX: 137, labelY: 211 },
      { id: ids('hand_palm'), d: 'M150 168H194L215 190C215 232 203 261 189 275H150Z', labelX: 179, labelY: 225 },
      { id: ids('hand_hypothenar'), d: 'M189 275C204 255 215 226 215 190L226 183C235 220 222 266 194 282Z', labelX: 209, labelY: 245 }
    ] : [
      { id: ids('hand_knuckle'), d: 'M127 168H215L214 204C190 195 151 195 127 205Z', labelX: 171, labelY: 184 },
      { id: ids('hand_back'), d: 'M127 205C151 195 190 195 214 204C214 236 203 260 189 275H131C126 251 124 228 127 205Z', labelX: 170, labelY: 233 }
    ])
  ]
  return <svg aria-label={`${side === 'left' ? '左' : '右'}手${props.view === 'palm' ? '手掌' : '手背'}定位图`} className="body-atlas-svg" role="img" viewBox="0 0 320 360">
    <path d="M131 319L126 275C100 247 91 215 83 185C77 166 97 154 116 170L119 68C118 48 141 45 144 66L148 45C148 24 173 24 173 45L176 61C177 41 201 43 201 63L204 94C207 75 229 82 226 101L215 190C235 220 222 270 194 282L189 319Z" fill={surface} stroke={border} strokeLinejoin="round" strokeWidth="2" />
    <InteractiveZones {...props} shapes={shapes} />
    <ViewCaption>{side === 'left' ? '左手' : '右手'} · {props.view === 'palm' ? '手掌' : '手背'}</ViewCaption>
  </svg>
}

function FootAtlas(props: AtlasProps) {
  const side = props.laterality
  const ids = (base: string) => sideId(base, side)
  const sole = props.view === 'sole'
  const shapes: ZoneShape[] = sole ? [
    { id: ids('foot_heel'), d: 'M127 261C137 278 183 278 193 261L188 319H132Z', labelX: 160, labelY: 291 },
    { id: ids('foot_arch_medial'), d: 'M127 261C119 225 123 194 138 167L160 174V267Z', labelX: 140, labelY: 225 },
    { id: ids('foot_arch_lateral'), d: 'M160 174L190 164C199 196 201 231 193 261C184 268 173 271 160 267Z', labelX: 181, labelY: 220 },
    { id: ids('foot_ball_medial'), d: 'M117 122C124 96 145 88 160 100V174L138 167C125 154 117 140 117 122Z', labelX: 137, labelY: 133 },
    { id: ids('foot_sole'), d: 'M160 100C176 90 194 98 202 119L190 164L160 174Z', labelX: 178, labelY: 133 },
    { id: ids('foot_ball_lateral'), d: 'M202 119C211 137 207 154 190 164L202 119Z', labelX: 200, labelY: 144 },
    { id: ids('foot_sole_big_toe'), d: 'M117 122C89 117 85 80 109 70C132 62 143 79 137 99Z', labelX: 111, labelY: 91 },
    { id: ids('foot_sole_other_toes'), d: 'M137 99C139 67 196 42 216 72C227 90 218 112 202 119C183 100 160 94 137 99Z', labelX: 181, labelY: 80 }
  ] : [
    { id: ids('foot_ankle'), d: 'M132 278H188L184 321H136Z', labelX: 160, labelY: 298 },
    { id: ids('foot_dorsum_medial'), d: 'M121 167C125 133 138 113 160 105V260H128Z', labelX: 139, labelY: 202 },
    { id: ids('foot_dorsum'), d: 'M160 105C178 102 196 116 202 151L192 260H160Z', labelX: 179, labelY: 201 },
    { id: ids('foot_dorsum_lateral'), d: 'M202 151C213 183 211 226 192 260L202 151Z', labelX: 201, labelY: 198 },
    { id: ids('foot_medial_edge'), d: 'M121 167L128 260L118 245C108 219 109 188 121 167Z', labelX: 119, labelY: 215 },
    { id: ids('foot_lateral_edge'), d: 'M202 151C222 180 220 224 192 260C211 226 213 183 202 151Z', labelX: 210, labelY: 211 },
    { id: ids('foot_forefoot'), d: 'M116 116C126 91 175 79 204 103L202 151C177 137 145 139 121 167Z', labelX: 163, labelY: 122 },
    { id: ids('foot_big_toe'), d: 'M116 116C88 116 83 82 103 68C125 54 143 73 136 96Z', labelX: 108, labelY: 90 },
    { id: ids('foot_other_toes'), d: 'M136 96C149 62 203 45 219 76C226 91 217 105 204 103C183 88 157 88 136 96Z', labelX: 181, labelY: 78 }
  ]
  return <svg aria-label={`${side === 'left' ? '左' : '右'}足${sole ? '足底' : '足背'}定位图`} className="body-atlas-svg" role="img" viewBox="0 0 320 360">
    <path d="M136 321L128 260C106 230 106 190 121 167C112 145 109 129 116 116C88 116 83 82 103 68C125 54 143 73 136 96C149 62 203 45 219 76C226 91 217 105 204 103C218 133 225 181 217 217C213 237 204 252 192 260L184 321Z" fill={surface} stroke={border} strokeLinejoin="round" strokeWidth="2" />
    <InteractiveZones {...props} shapes={shapes} />
    <ViewCaption>{side === 'left' ? '左足' : '右足'} · {sole ? '足底' : '足背'}</ViewCaption>
  </svg>
}

export function BodyLocationAtlas(props: AtlasProps) {
  if (props.atlas === 'head') return <HeadAtlas {...props} />
  if (props.atlas === 'chest') return <ChestAtlas {...props} />
  if (props.atlas === 'abdomen') return <AbdomenAtlas {...props} />
  if (props.atlas === 'back') return <BackAtlas {...props} />
  if (props.atlas === 'hand') return <HandAtlas {...props} />
  return <FootAtlas {...props} />
}

export function AtlasSelectionCount({ count }: { count: number }) {
  if (!count) return null
  return <span className="inline-flex items-center gap-1 rounded-pill bg-primary px-2 py-1 text-[11px] font-semibold text-surface"><Check size={12} />{count}</span>
}
