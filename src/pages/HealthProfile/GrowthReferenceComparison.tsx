import { PRODUCT_FEATURES } from '../../../shared/product-visibility.mjs'
import { useEffect, useMemo, useState } from 'react'
import { Sprout } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { BottomSheetSurface, HohoButton, HohoSection, HohoSurfaceRow } from '../../components/design-system'
import { calculateGrowthPosition, exactAgeInMonths, growthValueAtZScore, type GrowthReferenceId } from '../../features/health-profile/utils/childGrowthReference'
import { apiRequest } from '../../services/apiClient'
import { useAppStore } from '../../store/useAppStore'
import type { GrowthMeasurementApiDto, Member } from '../../types'
import { GrowthCurveChart } from './GrowthCurveChart'
import { metricDisplayValue, metricRecords, type GrowthMeasure } from './growthInterpretation'
import './growthReferenceComparison.css'

type ProductAccess = { owned: boolean; included: boolean; available: boolean }
type Entitlements = { products?: Record<string, ProductAccess> }
const productId = 'growth-comparison'
const references = [
  { id: 'who-2006' as const, name: 'WHO 2006', population: '国际儿童标准 · 0–5岁', source: 'https://www.who.int/tools/child-growth-standards/standards/length-height-for-age' },
  { id: 'cdc-2000' as const, name: 'CDC 2000', population: '美国儿童参考 · 2–20岁', source: 'https://www.cdc.gov/growthcharts/cdc-data-files.htm' }
]

export function GrowthReferenceComparison(props: { member: Member; records: GrowthMeasurementApiDto[]; measure: GrowthMeasure }) {
  return PRODUCT_FEATURES.careJourney ? <GrowthReferenceComparisonContent {...props} /> : null
}

function GrowthReferenceComparisonContent({ member, records, measure }: { member: Member; records: GrowthMeasurementApiDto[]; measure: GrowthMeasure }) {
  const navigate = useNavigate(), token = useAppStore(state => state.authToken)
  const [access, setAccess] = useState<ProductAccess | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [open, setOpen] = useState(false), [refresh, setRefresh] = useState(0)
  useEffect(() => {
    setAccess(null); setError(''); setLoading(true); setOpen(false)
    if (!token) { setLoading(false); return }
    const controller = new AbortController()
    apiRequest<Entitlements>('/api/care-journey/entitlements', { token, signal: controller.signal })
      .then(result => setAccess(result.products?.[productId] ?? null))
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '参考对照加载失败') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [token, refresh])
  useEffect(() => {
    const reload = () => setRefresh(value => value + 1)
    window.addEventListener('hoooho-data-changed', reload)
    return () => window.removeEventListener('hoooho-data-changed', reload)
  }, [])
  useEffect(() => setOpen(false), [member.id])

  const latest = metricRecords(records, measure).at(-1)
  const age = latest ? exactAgeInMonths(member.birthday, latest.measuredAt) : null
  const value = latest ? measure === 'height' ? latest.heightCm : latest.weightKg : null
  const applicable = (member.gender === 'female' || member.gender === 'male') && age != null && age >= 24 && age <= 240 && value != null
  const owned = access?.owned || access?.included
  const description = loading ? '正在读取树芽兑换状态…' : error ? '读取失败，点击重试' : !applicable ? '保存2–20岁测量后可用；WHO基础曲线继续免费' : owned ? access?.included ? '已包含 · WHO与CDC独立查看' : '已用树芽获得 · WHO与CDC独立查看' : '30树芽获得 · 同一次测量，不同参考'
  const activate = () => {
    if (error) { setRefresh(value => value + 1); return }
    if (loading || !applicable) return
    if (owned) setOpen(true)
    else if (access?.available) navigate('/care-journey/exchange?productId=growth-comparison')
  }
  const shared = useMemo(() => {
    if (age == null || age < 24 || age > 60 || (member.gender !== 'female' && member.gender !== 'male')) return null
    const maxAge = Math.min(60, Math.max(36, Math.ceil((age + 3) / 6) * 6))
    const ages = Array.from({ length: 25 }, (_, index) => 24 + (maxAge - 24) * index / 24)
    const values = references.flatMap(reference => ages.flatMap(ageInMonths => [-1.8808, 1.8808].flatMap(zScore => {
      const referenceValue = growthValueAtZScore({ ageInMonths, gender: member.gender!, measure, zScore, referenceId: reference.id })
      return referenceValue == null ? [] : [referenceValue]
    })))
    for (const record of metricRecords(records, measure)) {
      const recordAge = exactAgeInMonths(member.birthday, record.measuredAt), recordValue = measure === 'height' ? record.heightCm : record.weightKg
      if (recordAge != null && recordAge >= 24 && recordAge <= maxAge && recordValue != null) values.push(recordValue)
    }
    if (!values.length) return null
    const low = Math.min(...values), high = Math.max(...values), padding = Math.max(measure === 'height' ? 1 : .4, (high - low) * .08)
    return { ages: [24, maxAge] as const, values: [Math.floor((low - padding) * 10) / 10, Math.ceil((high + padding) * 10) / 10] as const }
  }, [age, member.birthday, member.gender, records, measure])

  return <>
    <HohoSurfaceRow className="growth-reference-entry" leading={<Sprout aria-hidden="true" size={22} />} title="多参考对照" description={description} onActivate={activate} action={!loading && !error && (!applicable || !owned && !access?.available) ? <span className="hoho-text-caption">暂不可用</span> : undefined} />
    <BottomSheetSurface label="多参考对照" open={open && Boolean(owned)} onClose={() => setOpen(false)} title="多参考对照" size="workspace" footer={<HohoButton fullWidth onClick={() => setOpen(false)}>返回成长数据</HohoButton>}>
      {latest && value != null && <div className="growth-reference-comparison">
        <p className="hoho-text-body">{latest.measuredAt} · {metricDisplayValue(measure, value)}<br />同一条已保存测量，按测量时月龄分别计算。</p>
        <div className="growth-reference-readings">
          {references.map(reference => <ReferenceReading key={reference.id} reference={reference} member={member} latest={latest} measure={measure} value={value} />)}
        </div>
        <p className="hoho-text-caption">参考人群不同，百分位不能平均，也不代表诊断。仅比较两套参考共同适用的测量；原始记录不变。</p>
        {references.map(reference => <HohoSection key={reference.id} title={reference.name} description={reference.population}>
          {reference.id === 'who-2006' && !shared ? <p className="hoho-text-body">本版WHO参考适用0–5岁；这次测量超出范围，不生成百分位。</p> : <GrowthCurveChart measure={measure} member={member} records={records} referenceId={reference.id} ageWindow={shared?.ages} valueWindow={shared?.values} />}
          <a className="hoho-text-caption" href={reference.source} target="_blank" rel="noreferrer">查看官方数据来源</a>
        </HohoSection>)}
        {shared && <p className="hoho-text-caption">两图使用相同月龄与数值刻度，均显示2–5岁范围内的已保存记录。</p>}
      </div>}
    </BottomSheetSurface>
  </>
}

function ReferenceReading({ reference, member, latest, measure, value }: { reference: { id: GrowthReferenceId; name: string; population: string }; member: Member; latest: GrowthMeasurementApiDto; measure: GrowthMeasure; value: number }) {
  const position = calculateGrowthPosition({ birthday: member.birthday, gender: member.gender, measuredAt: latest.measuredAt, measure, value, referenceId: reference.id })
  const median = position && member.gender ? growthValueAtZScore({ ageInMonths: position.ageInMonths, gender: member.gender, measure, zScore: 0, referenceId: reference.id }) : null
  return <div><h3 className="hoho-text-body">{reference.name}</h3><strong className="hoho-text-section-title">{position?.percentileLabel ?? '不适用'}</strong><p className="hoho-text-caption">P50：{median == null ? '—' : metricDisplayValue(measure, median)}</p></div>
}
