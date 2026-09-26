import anchors from './child-data/region-anchors.json' with { type: 'json' }
import atlases from './child-data/atlas-layouts.json' with { type: 'json' }
import manifest from './child-data/source-manifest.json' with { type: 'json' }
import { CHILD_CATALOG_VERSION, type ChildLocation, type ChildModel, type ChildRegion, type ChildView } from './childBodyCatalog'

export type Point = readonly [number, number]
export type Bounds = readonly [number, number, number, number]
export type LocalAngle = 'palm' | 'dorsal' | 'plantar' | 'medial' | 'lateral'
export interface ChildVisual { asset: string; width: number; height: number; bounds: Bounds; kind: 'body' | 'face' | 'hand' | 'foot'; angle?: LocalAngle }
export const CHILD_GEOMETRY_VERSION = '1.0.0'
export const geometryCompatible = () => CHILD_GEOMETRY_VERSION === CHILD_CATALOG_VERSION && anchors.schemaVersion === CHILD_CATALOG_VERSION && atlases.schemaVersion === CHILD_CATALOG_VERSION && manifest.version === CHILD_CATALOG_VERSION
export const assetUrl = (asset: string) => `/body-locator/v1/${asset.replace('assets/', '')}`
export const regionAnchor = (model: ChildModel, view: ChildView, id: string) => anchors.entries.find(item => item.model === model && item.view === view && item.regionId === id)
export function childVisual(model: ChildModel, view: ChildView, region?: ChildRegion, angle?: LocalAngle): ChildVisual | null {
  if (region && (region.id === 'external_genital' || region.id === 'perineum' || region.id.startsWith('groin'))) return null
  if (region?.zoom === 'hand' || region?.zoom === 'foot') {
    const asset = `assets/${region.zoom}-${region.side}.png`
    const atlas = atlases.atlases.find(item => item.asset === asset)!
    const panel = atlas.panels.find(item => item.id === angle) ?? atlas.panels[0]
    return { asset, width: region.zoom === 'hand' ? 1536 : 1254, height: region.zoom === 'hand' ? 1024 : 1254, bounds: panel.bounds as unknown as Bounds, kind: region.zoom, angle: panel.id as LocalAngle }
  }
  if (region?.zoom === 'face' && view === 'front' && region.id !== 'head') return { asset: `assets/${model}-face.png`, width: 1254, height: 1254, bounds: [0, 0, 1, 1], kind: 'face' }
  const anchor = region && regionAnchor(model, view, region.id)
  return { asset: `assets/${model}-${view}.png`, width: 1024, height: 1536, bounds: (anchor?.zoomBounds ?? [0, 0, 1, 1]) as unknown as Bounds, kind: 'body' }
}

/** Normalized source-image polygons, calibrated separately around each asset's own anchor.
 * Smaller ear/face/neck/limb regions paint after the head. Zoom windows are never used as hit bounds.
 * Covered/hidden regions retain their explicit named entry; no fine anatomy is drawn on clothing.
 */
export function regionPolygon(model: ChildModel, view: ChildView, region: ChildRegion): Point[] | null {
  const a = regionAnchor(model, view, region.id)
  if (!a || !geometryCompatible()) return null
  const [x, y] = a.anchor
  const type = region.id.replace(/_(left|right)$/, '')
  if (type === 'head' && view === 'back') return model === 'girl'
    ? [[.42,.065],[.58,.065],[.63,.095],[.665,.13],[.688,.17],[.723,.24],[.713,.27],[.676,.292],[.60,.307],[.40,.307],[.332,.296],[.288,.27],[.278,.24],[.30,.20],[.32,.155],[.35,.11],[.38,.083]]
    : [[.44,.04],[.57,.04],[.64,.065],[.68,.10],[.705,.14],[.713,.175],[.684,.21],[.644,.242],[.61,.27],[.568,.293],[.54,.302],[.455,.298],[.405,.285],[.37,.267],[.34,.238],[.312,.207],[.29,.174],[.29,.133],[.31,.10],[.345,.072],[.38,.054]]
  if (type === 'head') return model === 'girl'
    ? [[.30,.10],[.40,.051],[.61,.06],[.70,.13],[.72,.27],[.64,.31],[.34,.31],[.27,.26]]
    : [[.29,.095],[.43,.035],[.60,.055],[.72,.13],[.70,.26],[.60,.315],[.39,.315],[.29,.24]]
  if (type === 'face') return model === 'girl' ? [[.385,.177],[.616,.177],[.637,.249],[.57,.299],[.45,.3],[.366,.252]] : [[.37,.196],[.63,.196],[.642,.278],[.57,.324],[.43,.324],[.359,.276]]
  const sizes: Record<string, Point> = {
    ear: [.025,.025], neck: [.052,.014], chest: [.10,.038], abdomen: [.117,.040], back: [.117,.089],
    shoulder: [.045,.034], axilla: [.018,.012], upper_arm: [.036,.022], elbow: [.038,.016], forearm: [.036,.025],
    wrist: [.023,.011], hand: [.043,.030], hip: [.024,.031], groin: [.025,.018], buttock: [.060,.042],
    thigh: [.053,.027], knee: [.049,.019], lower_leg: [.042,.045], ankle: [.032,.012], foot: [.051,.023],
    external_genital: [.023,.022], perineum: [.021,.009]
  }
  const size = sizes[type]
  if (!size) return null
  const [w, h] = size
  // Slanted limbs follow the actual A-pose, rather than filling rectangular gaps beside the child.
  const tilt = ['upper_arm','forearm','hand'].includes(type) ? (x < .5 ? -.016 : .016) : 0
  return [[x-w-tilt,y-h],[x+w-tilt,y-h],[x+w+tilt,y+h],[x-w+tilt,y+h]]
}

export const localAngles = (region: ChildRegion) => region.zoom === 'hand'
  ? [{ id: 'palm', label: '手掌' }, { id: 'dorsal', label: '手背' }] as const
  : region.zoom === 'foot' ? [{ id: 'dorsal', label: '脚背' }, { id: 'plantar', label: '足底' }, { id: 'medial', label: '内侧' }, { id: 'lateral', label: '外侧' }] as const : []

/** Fine points are an explicit allowlist. Missing geometry always means text-only feedback.
 * These are illustration landmarks, not clinical boundaries. Each panel uses its own coordinates.
 */
export function locationPoint(model: ChildModel, view: ChildView, region: ChildRegion, visual: ChildVisual, item: ChildLocation): Point | null {
  if (!geometryCompatible() || item.displayMode === 'text' || !item.views.includes(view) || item.coverage !== 'specific') return null
  if (visual.kind === 'face') {
    const girl = model === 'girl'
    const cy = girl ? .485 : .548
    const x = item.side === 'left' ? .615 : .365
    const relative: Record<string, Point> = {
      eyebrow: [x,cy-.105], upper_eyelid: [x,cy-.056], lower_eyelid: [x,cy+.058],
      inner_canthus: [item.side === 'left' ? .554 : .432,cy+.02], outer_canthus: [item.side === 'left' ? .681 : .308,cy+.016],
      eye_surface: [x,cy+.008], cheek: [item.side === 'left' ? .649 : .331,cy+.115],
      nose_wing: [item.side === 'left' ? .533 : .466,girl ? .565 : .627],
      nostril_rim: [item.side === 'left' ? .519 : .48,girl ? .576 : .641],
      mouth_corner: [item.side === 'left' ? .568 : .422,girl ? .622 : .684]
    }
    const feature = item.id.replace(/^face_/, '').replace(/_(left|right)$/, '')
    const central: Record<string, Point> = {
      forehead: [.51,girl ? .342 : .382], glabella: [.493,cy-.08], nose_bridge: [.495,cy-.005],
      nose_tip: [.495,girl ? .561 : .616], columella: [.494,girl ? .58 : .644],
      philtrum: [.493,girl ? .605 : .669], upper_lip: [.49,girl ? .623 : .689],
      lower_lip: [.49,girl ? .639 : .705], chin: [.493,girl ? .692 : .756]
    }
    return relative[feature] ?? central[feature] ?? null
  }
  if (visual.kind === 'hand') {
    const side = region.side, angle = visual.angle
    const suffix = item.id.replace(`hand_${side}_`, '')
    const palm = angle === 'palm'
    if (item.surface === 'palmar' && !palm || item.surface === 'dorsal' && palm) return null
    // Positions inside each half panel. Separate per-side measurements preserve thumb orientation.
    const fingerXs = side === 'left' ? (palm ? [.86,.65,.475,.30,.15] : [.15,.34,.54,.71,.86]) : (palm ? [.14,.37,.55,.72,.85] : [.88,.61,.45,.29,.14])
    const tipYs = side === 'left' ? (palm ? [.43,.18,.11,.17,.29] : [.42,.18,.11,.17,.29]) : (palm ? [.42,.155,.11,.16,.26] : [.42,.16,.10,.16,.26])
    const fingers = ['thumb','index','middle','ring','little']
    const f = fingers.findIndex(name => suffix.startsWith(`${name}_`))
    let point: Point | null = null
    if (f >= 0) {
      const part = suffix.slice(fingers[f].length + 1)
      const top = tipYs[f], root = f === 0 ? .575 : .393
      // Whole fingers and ambiguous nail folds/joint margins deliberately have no fake pinpoint.
      if (part === 'nail' && !palm) point = [fingerXs[f], top+.007]
      else if (part === 'palmar' && palm || part === 'dorsal' && !palm) point = [fingerXs[f], (top+root)/2]
      else if (part === 'tip') point = [fingerXs[f], top-.022]
    } else if (suffix === 'palm_center' && palm) point = [side === 'left' ? .51 : .55,.535]
    else if (suffix === 'palm_thumb' && palm) point = [side === 'left' ? .65 : .37,.603]
    else if (suffix === 'palm_little' && palm) point = [side === 'left' ? .365 : .69,.595]
    else if (suffix === 'dorsum' && !palm) point = [.51,.538]
    return point ? [(palm ? 0 : .5)+point[0]*.5,point[1]] : null
  }
  if (visual.kind === 'foot') {
    const side = region.side, angle = visual.angle
    const suffix = item.id.replace(`foot_${side}_`, '')
    const dorsal = angle === 'dorsal', plantar = angle === 'plantar'
    const points: Record<string, Partial<Record<LocalAngle, Point>>> = {
      dorsum: { dorsal: [side === 'left' ? .54 : .59,.50] },
      plantar_forefoot: { plantar: [.49,.34] }, arch: { plantar: [side === 'left' ? .39 : .53,.60] },
      heel_sole: { plantar: [.49,.84] }, medial_arch: { medial: [.52,.60] }, lateral_arch: { lateral: [.49,.62] },
      heel_medial: { medial: [side === 'left' ? .83 : .17,.59] }, heel_lateral: { lateral: [side === 'left' ? .20 : .80,.59] },
      medial_edge: { medial: [.52,.65] }, lateral_edge: { lateral: [.51,.66] }
    }
    let point = points[suffix]?.[angle!]
    const toe = suffix.match(/^toe_([1-5])_(nail|dorsal|plantar|tip)$/)
    if (toe && (dorsal || plantar)) {
      const i = Number(toe[1])-1, part = toe[2]
      const xs = dorsal ? (side === 'left' ? [.688,.565,.478,.407,.344] : [.455,.577,.651,.716,.777]) : (side === 'left' ? [.32,.435,.516,.594,.657] : [.578,.465,.392,.333,.257])
      const ys = dorsal ? [.14,.10,.125,.175,.24] : [.135,.123,.166,.215,.27]
      if ((part === 'nail' || part === 'dorsal') && dorsal || part === 'plantar' && plantar || part === 'tip') point = [xs[i],ys[i]+(part === 'tip' ? -.035 : part === 'nail' ? 0 : .055)]
    }
    if (!point) return null
    const [bx,by,bw,bh] = visual.bounds
    return [bx+point[0]*bw,by+point[1]*bh]
  }
  const anchor = regionAnchor(model, view, region.id)
  if (!anchor) return null
  const suffix = item.id.slice(region.id.length+1)
  const exact = (region.id.startsWith('elbow_') && (view === 'front' ? suffix === 'crease' : suffix === 'tip'))
    || (region.id.startsWith('knee_') && (view === 'front' ? suffix === 'front' : suffix === 'crease'))
  return exact ? anchor.anchor as unknown as Point : null
}

export function projectedPoint(point: Point, visual: ChildVisual): Point {
  const [x,y,w,h] = visual.bounds
  return [(point[0]-x)/w,(point[1]-y)/h]
}
