import { useMemo, useRef, useState, type FormEvent, type RefObject } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Avatar, WebPageHeader } from '../../components/common'
import { HealthProfileActionBar } from '../../components/health'
import { HohoButton } from '../../components/design-system'
import { getBasicHealthProfileValues, toFamilyMemberHealthUpdate, type BasicHealthProfileValues } from '../../features/health-profile/utils/healthProfileBasicInfo'
import { familyMemberService } from '../../services/familyMembers'
import { adaptFamilyMember } from '../../services/healthEventDetailAdapter'
import { readProfileSection, saveProfileSection } from '../../services/profileSectionStorage'
import { useAppStore } from '../../store/useAppStore'
import type { Member } from '../../types'
import { formatAgeFromBirthday } from '../../utils/formatAgeFromBirthday'
import { growthCardActionLabel, growthCardMissing, validAbo, validHeight, validWeight } from './growthCardForm'

type FormValues = BasicHealthProfileValues
const genderLabel = { male: '男', female: '女', undisclosed: '未填写', '': '未填写' } as const
const readRecords = (key: string) => { try { return JSON.parse(readProfileSection(key)) as Array<Record<string, string | boolean>> } catch { return [] } }

function MetricPreview({ label, value, unit, revision }: { label: string; value: string; unit?: string; revision: string }) {
  return <span><small>{label}</small><strong className="growth-card-live-value" key={`${label}-${revision}`}>{value || '待生成'}</strong>{value && unit && <small>{unit}</small>}</span>
}

function GrowthCardPreview({ member, values, established }: { member: Member; values: FormValues; established: boolean }) {
  const paired = validHeight(values.height) && validWeight(values.weight)
  return <section className={`growth-card-preview ${established ? 'growth-card-preview--established' : ''}`} aria-label={`${member.name}的成长身份卡预览`}>
    <header><Avatar name={member.name} size="md" src={member.avatar} /><span><small>{member.name}的成长身份卡</small><strong>{member.name}</strong></span>{established && <em><Check size={13} />已建立</em>}</header>
    <div className="growth-card-preview__metrics"><MetricPreview label="身高" revision={String(values.height)} unit="cm" value={validHeight(values.height) ? String(values.height) : ''} /><MetricPreview label="体重" revision={String(values.weight)} unit="kg" value={validWeight(values.weight) ? String(values.weight) : ''} /><MetricPreview label="血型" revision={String(values.aboBloodType)} unit="血型" value={validAbo(values.aboBloodType) ? `${values.aboBloodType}型` : '待选择'} /></div>
    {paired && <p className="growth-card-paired"><Check size={14} />已形成一组成长数据</p>}
  </section>
}

function NumberField({ error, id, inputRef, label, onChange, unit, value }: { error?: string; id: string; inputRef?: RefObject<HTMLInputElement>; label: string; onChange: (value: string) => void; unit: string; value: string }) {
  return <label className="growth-card-number-field" htmlFor={id}><span>{label}</span><span><input aria-invalid={Boolean(error)} id={id} inputMode="decimal" ref={inputRef} min={id === 'growth-height' ? 20 : 1} max={id === 'growth-height' ? 260 : 500} step="any" type="number" value={value} onChange={(event) => onChange(event.target.value)} /><small>{unit}</small></span>{error && <em role="alert">{error}</em>}</label>
}

function GrowthCardReveal({ member, values, onContinue, onDone }: { member: Member; values: FormValues; onContinue: () => void; onDone: () => void }) {
  return <main className="app-shell health-profile-detail-shell growth-card-reveal"><WebPageHeader fallback="/health-profile" title="成长身份卡" /><div className="growth-card-reveal__body"><section className="growth-card-reveal__card"><Avatar name={member.name} size="lg" src={member.avatar} /><h2>{member.name}</h2><p>{genderLabel[member.gender ?? '']} · {member.birthday ? formatAgeFromBirthday(member.birthday) : member.age}</p><div><MetricPreview label="身高" revision="reveal-height" unit="cm" value={String(values.height)} /><MetricPreview label="体重" revision="reveal-weight" unit="kg" value={String(values.weight)} /><MetricPreview label="血型" revision="reveal-blood" unit="血型" value={`${values.aboBloodType}型`} /></div><span><Check size={15} />基础档案已建立</span></section><h1>{member.name}的成长身份卡已建立</h1><p>以后记录症状、生成病情摘要时，将自动带入基础信息</p></div><HealthProfileActionBar><HohoButton fullWidth onClick={onDone} size="large">完成</HohoButton><button className="growth-card-secondary-action" onClick={onContinue} type="button">继续补充出生信息</button></HealthProfileActionBar></main>
}

export function BasicHealthProfilePage({ member }: { member: Member }) {
  const navigate = useNavigate()
  const token = useAppStore((state) => state.authToken), members = useAppStore((state) => state.members), setMembers = useAppStore((state) => state.setMembers)
  const basicKey = `hoho-health-profile:${member.id}:basic`, birthKey = `hoho-health-profile:${member.id}:birth`
  const initialBasic = useMemo(() => getBasicHealthProfileValues(member, readRecords(basicKey)[0] as FormValues), [basicKey, member])
  const initialBirth = useMemo(() => readRecords(birthKey)[0] ?? {}, [birthKey])
  const initiallyEstablished = growthCardMissing(initialBasic).length === 0
  const [values, setValues] = useState<FormValues>(initialBasic), [birthValues, setBirthValues] = useState(initialBirth)
  const [expanded, setExpanded] = useState(false), [submitting, setSubmitting] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState(''), [revealed, setRevealed] = useState(false), [established, setEstablished] = useState(initiallyEstablished)
  const birthLengthRef = useRef<HTMLInputElement>(null)
  const missing = growthCardMissing(values)
  const fieldErrors = { height: values.height && !validHeight(values.height) ? '请输入 20–260 cm' : '', weight: values.weight && !validWeight(values.weight) ? '请输入 1–500 kg' : '' }
  const update = (key: string, value: string | boolean) => { setValues((current) => ({ ...current, [key]: value })); setError(''); setStatus('') }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (missing.length || fieldErrors.height || fieldErrors.weight || !token) return
    setSubmitting(true); setError(''); setStatus('')
    try {
      const updated = await familyMemberService.update(member.id, toFamilyMemberHealthUpdate(values), token)
      const savedAt = new Date().toISOString(), savedValues = { ...getBasicHealthProfileValues(adaptFamilyMember(updated), values), _savedAt: savedAt }
      await saveProfileSection(basicKey, [savedValues])
      if (Object.values(birthValues).some(Boolean) || Object.keys(initialBirth).length) await saveProfileSection(birthKey, [{ ...initialBirth, ...birthValues, _savedAt: savedAt }])
      setMembers(members.map((item) => item.id === updated.id ? adaptFamilyMember(updated) : item)); setValues(savedValues)
      if (established) setStatus('成长数据已更新')
      else { setEstablished(true); setRevealed(true) }
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : '保存失败，请检查网络后重试') }
    finally { setSubmitting(false) }
  }

  if (revealed) return <GrowthCardReveal member={member} values={values} onDone={() => navigate('/health-profile', { replace: true, state: { growthCardSaved: true } })} onContinue={() => { setRevealed(false); setExpanded(true); requestAnimationFrame(() => birthLengthRef.current?.focus()) }} />

  return <main className="app-shell health-profile-detail-shell growth-card-editor"><WebPageHeader fallback="/health-profile" title="基础健康信息" /><div className="page-content health-profile-page-content"><GrowthCardPreview established={established} member={member} values={values} /><form id="growth-card-form" onSubmit={submit}>
    <div className="growth-card-core-fields"><NumberField error={fieldErrors.height} id="growth-height" label="身高" unit="cm" value={String(values.height ?? '')} onChange={(value) => update('height', value)} /><NumberField error={fieldErrors.weight} id="growth-weight" label="体重" unit="kg" value={String(values.weight ?? '')} onChange={(value) => update('weight', value)} /></div>
    <fieldset className="growth-card-blood-type"><legend>ABO 血型</legend><div>{['A','B','AB','O'].map((bloodType) => <button aria-pressed={values.aboBloodType === bloodType} key={bloodType} onClick={() => update('aboBloodType', bloodType)} type="button">{values.aboBloodType === bloodType && <Check size={14} />}{bloodType}型</button>)}</div></fieldset>
    <button aria-expanded={expanded} className="growth-card-more-toggle" onClick={() => setExpanded((current) => !current)} type="button">补充更多信息<ChevronDown className={expanded ? 'rotate-180' : ''} size={18} /></button>
    {expanded && <section className="growth-card-more-fields"><div className="growth-card-core-fields"><NumberField id="growth-head" label="头围" unit="cm" value={String(values.headCircumference ?? '')} onChange={(value) => update('headCircumference', value)} /><NumberField id="growth-waist" label="腰围" unit="cm" value={String(values.waistCircumference ?? '')} onChange={(value) => update('waistCircumference', value)} /></div><div className="growth-card-core-fields"><NumberField id="birth-length" inputRef={birthLengthRef} label="出生身长" unit="cm" value={String(birthValues.birthLength ?? '')} onChange={(value) => setBirthValues((current) => ({ ...current, birthLength: value }))} /><NumberField id="birth-weight" label="出生体重" unit="kg" value={String(birthValues.birthWeight ?? '')} onChange={(value) => setBirthValues((current) => ({ ...current, birthWeight: value }))} /></div><label className="hoho-field"><span className="hoho-text-label">体脂率</span><input className="hoho-input" inputMode="decimal" type="number" step="any" value={String(values.bodyFatPercentage ?? '')} onChange={(event) => update('bodyFatPercentage', event.target.value)} /></label><fieldset className="growth-card-blood-type"><legend>RhD</legend><div>{[['positive','阳性'],['negative','阴性']].map(([value,label]) => <button aria-pressed={values.rhBloodType === value} key={value} onClick={() => update('rhBloodType', value)} type="button">{values.rhBloodType === value && <Check size={14} />}{label}</button>)}</div></fieldset><label className="hoho-field"><span className="hoho-text-label">其他血型信息</span><input className="hoho-input" value={String(values.otherBloodTypeInfo ?? '')} onChange={(event) => update('otherBloodTypeInfo', event.target.value)} /></label></section>}
    {error && <p className="growth-card-form-error" role="alert">{error}</p>}{status && <p className="growth-card-form-status" role="status"><Check size={15} />{status}</p>}
  </form></div><HealthProfileActionBar><HohoButton disabled={missing.length > 0 || Boolean(fieldErrors.height || fieldErrors.weight)} form="growth-card-form" fullWidth loading={submitting} size="large" type="submit">{growthCardActionLabel(values, established)}</HohoButton>{error && <button aria-label="关闭错误提示" className="sr-only" onClick={() => setError('')} type="button"><X /></button>}</HealthProfileActionBar></main>
}
