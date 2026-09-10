import { useEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from 'react'
import { Check, ChevronDown, ChevronUp, Minus, Plus, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Avatar, WebPageHeader } from '../../components/common'
import { HealthProfileActionBar } from '../../components/health'
import { HohoButton } from '../../components/design-system'
import { calculateGrowthPosition, heightMeasureLabel, type GrowthPosition } from '../../features/health-profile/utils/childGrowthReference'
import { formatBloodTypeDisplay, getBasicHealthProfileValues, toFamilyMemberHealthUpdate, type BasicHealthProfileValues } from '../../features/health-profile/utils/healthProfileBasicInfo'
import { familyMemberService } from '../../services/familyMembers'
import { adaptFamilyMember } from '../../services/healthEventDetailAdapter'
import { readProfileSection, saveProfileSection } from '../../services/profileSectionStorage'
import { useAppStore } from '../../store/useAppStore'
import type { Member } from '../../types'
import { formatAgeFromBirthday } from '../../utils/formatAgeFromBirthday'
import { growthCardActionLabel, validAbo, validHeight, validRh, validWeight } from './growthCardForm'

type FormValues = BasicHealthProfileValues
const genderLabel = { male: '男', female: '女', undisclosed: '未填写', '': '未填写' } as const
const readRecords = (key: string) => { try { return JSON.parse(readProfileSection(key)) as Array<Record<string, string | boolean>> } catch { return [] } }
const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }

function GrowthTrack({ result, showLabel = true }: { result: GrowthPosition; showLabel?: boolean }) {
  return <span className="growth-feedback-track" aria-label={`${result.percentileLabel}，${result.referenceMessage}`}><span /><i style={{ left: `${result.position}%` }} />{showLabel && <strong style={{ left: `${result.position}%` }}>{result.percentileLabel}</strong>}</span>
}

function FeedbackMetric({ label, result, unit, value }: { label: string; result: GrowthPosition | null; unit: string; value: string }) {
  return <span className="growth-feedback-metric"><b>{label} {value} {unit}{result ? ` · ${result.percentileLabel}` : ''}</b>{result && <GrowthTrack result={result} showLabel={false} />}</span>
}

function GrowthFeedbackBar({ heightResult, label, member, values, weightResult }: { heightResult: GrowthPosition | null; label: string; member: Member; values: FormValues; weightResult: GrowthPosition | null }) {
  const hasHeight = validHeight(values.height), paired = hasHeight && validWeight(values.weight)
  const age = member.birthday ? formatAgeFromBirthday(member.birthday) : member.age
  const unavailableCopy = !member.birthday
    ? `已记录本次${label}，补充出生日期后可查看成长位置`
    : !['female', 'male'].includes(member.gender ?? '')
      ? `已记录本次${label}，补充性别后可查看成长位置`
      : `已记录本次${label}，当前年龄暂无可用成长参考`
  return <section className="growth-feedback-bar" aria-live="polite" data-state={paired ? 'paired' : hasHeight ? 'height' : 'empty'}>
    {!hasHeight ? <><Avatar name={member.name} size="md" src={member.avatar} /><span className="growth-feedback-bar__intro"><strong>{member.name} · {genderLabel[member.gender ?? '']} · {age}</strong><small>填入{label}和体重，立即查看成长位置</small></span></> : paired ? <div className="growth-feedback-bar__paired"><strong>成长坐标已建立 <Check aria-hidden="true" size={15} /></strong><div><FeedbackMetric label={label} result={heightResult} unit="cm" value={String(values.height)} /><FeedbackMetric label="体重" result={weightResult} unit="kg" value={String(values.weight)} /></div><small>下次记录，就能看见长高和体重变化</small></div> : <div className="growth-feedback-bar__single"><strong>{label} {values.height} cm</strong>{heightResult ? <><span>已定位到同龄{member.gender === 'female' ? '女孩' : '男孩'}的成长曲线</span><GrowthTrack result={heightResult} /><small>{heightResult.referenceMessage}</small></> : <small>{unavailableCopy}</small>}</div>}
  </section>
}

function NumberField({ error, id, inputRef, label, onBlur, onChange, unit, value }: { error?: string; id: string; inputRef?: RefObject<HTMLInputElement>; label: string; onBlur?: () => void; onChange: (value: string) => void; unit: string; value: string }) {
  const height = id.includes('height') || id.includes('length')
  return <label className="growth-card-number-field" htmlFor={id}><span>{label}</span><span><input aria-invalid={Boolean(error)} id={id} inputMode="decimal" ref={inputRef} min={height ? 20 : 1} max={height ? 260 : 500} step="0.1" type="number" value={value} onBlur={onBlur} onChange={(event) => onChange(event.target.value)} /><small>{unit}</small></span>{error && <em role="alert">{error}</em>}</label>
}

function BloodTypeField({ update, values }: { update: (key: string, value: string | boolean) => void; values: FormValues }) {
  const rhOptions = [['positive', 'Rh+'], ['negative', 'Rh−'], ['unknown', '不知道']] as const
  return <fieldset className="growth-card-blood-type"><legend>血型</legend><div>{['A', 'B', 'AB', 'O'].map((bloodType) => <button aria-pressed={values.aboBloodType === bloodType} key={bloodType} onClick={() => update('aboBloodType', bloodType)} type="button">{values.aboBloodType === bloodType && <Check aria-hidden="true" size={13} />}{bloodType}型</button>)}</div><div className="growth-card-blood-type__rh">{rhOptions.map(([value, label]) => <button aria-pressed={values.rhBloodType === value} key={value} onClick={() => update('rhBloodType', value)} type="button">{values.rhBloodType === value && <Check aria-hidden="true" size={13} />}{label}</button>)}</div></fieldset>
}

function RevealMetric({ label, result, unit, value }: { label: string; result: GrowthPosition | null; unit: string; value: string }) {
  return <span><small>{label}</small><strong>{value}</strong><small>{unit}</small>{result && <em>{result.percentileLabel}</em>}</span>
}

function GrowthSnapshot({ heightResult, label, measuredAt, member, onContinue, onDone, values, weightResult }: { heightResult: GrowthPosition | null; label: string; measuredAt: string; member: Member; onContinue: () => void; onDone: () => void; values: FormValues; weightResult: GrowthPosition | null }) {
  const blood = formatBloodTypeDisplay(String(values.aboBloodType ?? ''), String(values.rhBloodType ?? ''))
  return <main className="app-shell health-profile-detail-shell growth-card-reveal"><WebPageHeader fallback="/health-profile" title="成长快照" /><div className="growth-card-reveal__body"><section className="growth-card-reveal__card"><header><Avatar name={member.name} size="lg" src={member.avatar} /><span><h2>{member.name}</h2><p>{member.birthday ? formatAgeFromBirthday(member.birthday) : member.age} · {measuredAt === today() ? '记录于今天' : `记录于${measuredAt}`}</p></span></header><div><RevealMetric label={label} result={heightResult} unit="cm" value={String(values.height)} /><RevealMetric label="体重" result={weightResult} unit="kg" value={String(values.weight)} />{blood && <RevealMetric label="血型" result={null} unit="" value={blood} />}</div></section><h1>第一组成长坐标已建立</h1><p>下一次记录后，这里会显示长高了多少、体重变化多少</p></div><HealthProfileActionBar><HohoButton fullWidth onClick={onDone} size="large">完成</HohoButton><button className="growth-card-secondary-action" onClick={onContinue} type="button">继续补充信息</button></HealthProfileActionBar></main>
}

export function BasicHealthProfilePage({ member }: { member: Member }) {
  const navigate = useNavigate()
  const token = useAppStore((state) => state.authToken), members = useAppStore((state) => state.members), setMembers = useAppStore((state) => state.setMembers)
  const basicKey = `hoho-health-profile:${member.id}:basic`, birthKey = `hoho-health-profile:${member.id}:birth`
  const initialBasic = useMemo(() => getBasicHealthProfileValues(member, readRecords(basicKey)[0] as FormValues), [basicKey, member])
  const initialBirth = useMemo(() => readRecords(birthKey)[0] ?? {}, [birthKey])
  const initiallyEstablished = validHeight(initialBasic.height) && validWeight(initialBasic.weight)
  const [values, setValues] = useState<FormValues>(initialBasic), [feedbackValues, setFeedbackValues] = useState<FormValues>(initialBasic), [birthValues, setBirthValues] = useState(initialBirth)
  const [expanded, setExpanded] = useState(false), [submitting, setSubmitting] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState(''), [revealed, setRevealed] = useState(false), [established, setEstablished] = useState(initiallyEstablished)
  const birthLengthRef = useRef<HTMLInputElement>(null)
  const measuredAt = String(values.measurementDate || today()), heightLabel = heightMeasureLabel(member.birthday, measuredAt)
  const heightResult = validHeight(feedbackValues.height) ? calculateGrowthPosition({ birthday: member.birthday, gender: member.gender, measuredAt, measure: 'height', value: Number(feedbackValues.height) }) : null
  const weightResult = validWeight(feedbackValues.weight) ? calculateGrowthPosition({ birthday: member.birthday, gender: member.gender, measuredAt, measure: 'weight', value: Number(feedbackValues.weight) }) : null
  const fieldErrors = { height: values.height && !validHeight(values.height) ? '请输入 20–260 cm' : '', weight: values.weight && !validWeight(values.weight) ? '请输入 1–500 kg' : '' }
  const paired = validHeight(values.height) && validWeight(values.weight), bloodSelected = validAbo(values.aboBloodType) || validRh(values.rhBloodType)
  const canSubmit = Boolean(token) && !fieldErrors.height && !fieldErrors.weight && (paired || bloodSelected)
  const update = (key: string, value: string | boolean) => { setValues((current) => ({ ...current, [key]: value, ...(key === 'aboBloodType' || key === 'rhBloodType' ? { _bloodTypeTouched: true } : {}) })); setError(''); setStatus('') }

  useEffect(() => {
    setValues(initialBasic); setFeedbackValues(initialBasic); setBirthValues(initialBirth); setExpanded(false); setSubmitting(false); setError(''); setStatus(''); setRevealed(false); setEstablished(initiallyEstablished)
  }, [member.id])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit || !token) return
    setSubmitting(true); setError(''); setStatus('')
    try {
      const wasEstablished = established
      const updated = await familyMemberService.update(member.id, toFamilyMemberHealthUpdate(values), token)
      const savedAt = new Date().toISOString(), savedValues = { ...getBasicHealthProfileValues(adaptFamilyMember(updated), values), measurementDate: measuredAt, _savedAt: savedAt }
      await saveProfileSection(basicKey, [savedValues])
      if (Object.values(birthValues).some(Boolean) || Object.keys(initialBirth).length) await saveProfileSection(birthKey, [{ ...initialBirth, ...birthValues, _savedAt: savedAt }])
      setMembers(members.map((item) => item.id === updated.id ? adaptFamilyMember(updated) : item)); setValues(savedValues); setFeedbackValues(savedValues)
      if (paired && !wasEstablished) { setEstablished(true); setRevealed(true) } else setStatus(paired ? '成长数据已更新' : '血型已保存')
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : '保存失败，请检查网络后重试') }
    finally { setSubmitting(false) }
  }

  if (revealed) return <GrowthSnapshot heightResult={heightResult} label={heightLabel} measuredAt={measuredAt} member={member} onDone={() => navigate('/health-profile', { replace: true, state: { growthCardSaved: true } })} onContinue={() => { setRevealed(false); setExpanded(true); requestAnimationFrame(() => birthLengthRef.current?.focus()) }} values={values} weightResult={weightResult} />

  return <main className="app-shell health-profile-detail-shell growth-card-editor"><WebPageHeader fallback="/health-profile" title="基础健康信息" /><div className="page-content health-profile-page-content"><GrowthFeedbackBar heightResult={heightResult} label={heightLabel} member={member} values={feedbackValues} weightResult={weightResult} /><form id="growth-card-form" onSubmit={submit}>
    <div className="growth-card-core-fields"><NumberField error={fieldErrors.height} id="growth-height" label={heightLabel} unit="cm" value={String(values.height ?? '')} onBlur={() => setFeedbackValues((current) => ({ ...current, height: values.height }))} onChange={(value) => update('height', value)} /><NumberField error={fieldErrors.weight} id="growth-weight" label="体重" unit="kg" value={String(values.weight ?? '')} onBlur={() => setFeedbackValues((current) => ({ ...current, weight: values.weight }))} onChange={(value) => update('weight', value)} /></div>
    <BloodTypeField update={update} values={values} />
    <button aria-expanded={expanded} className="growth-card-more-toggle" onClick={() => setExpanded((current) => !current)} type="button"><span>{expanded ? <Minus aria-hidden="true" size={17} /> : <Plus aria-hidden="true" size={17} />}{expanded ? '收起更多信息' : '补充更多信息'}</span>{expanded ? <ChevronUp aria-hidden="true" size={18} /> : <ChevronDown aria-hidden="true" size={18} />}</button>
    <div className="growth-card-more-region" data-open={expanded}><section className="growth-card-more-fields"><label className="growth-card-date-field"><span>测量日期</span><input max={today()} type="date" value={measuredAt} onChange={(event) => update('measurementDate', event.target.value)} /></label><div className="growth-card-core-fields"><NumberField id="growth-head" label="头围" unit="cm" value={String(values.headCircumference ?? '')} onChange={(value) => update('headCircumference', value)} /><NumberField id="growth-waist" label="腰围" unit="cm" value={String(values.waistCircumference ?? '')} onChange={(value) => update('waistCircumference', value)} /></div><div className="growth-card-core-fields"><NumberField id="birth-length" inputRef={birthLengthRef} label="出生身长" unit="cm" value={String(birthValues.birthLength ?? '')} onChange={(value) => setBirthValues((current) => ({ ...current, birthLength: value }))} /><NumberField id="birth-weight" label="出生体重" unit="kg" value={String(birthValues.birthWeight ?? '')} onChange={(value) => setBirthValues((current) => ({ ...current, birthWeight: value }))} /></div><label className="hoho-field"><span className="hoho-text-label">体脂率</span><input className="hoho-input" inputMode="decimal" type="number" step="0.1" value={String(values.bodyFatPercentage ?? '')} onChange={(event) => update('bodyFatPercentage', event.target.value)} /></label><label className="hoho-field"><span className="hoho-text-label">其他血型信息</span><input className="hoho-input" value={String(values.otherBloodTypeInfo ?? '')} onChange={(event) => update('otherBloodTypeInfo', event.target.value)} /></label></section></div>
    {error && <p className="growth-card-form-error" role="alert">{error}</p>}{status && <p className="growth-card-form-status" role="status"><Check size={15} />{status}</p>}
  </form></div><HealthProfileActionBar><HohoButton disabled={!canSubmit} form="growth-card-form" fullWidth loading={submitting} size="large" type="submit">{growthCardActionLabel(values, established, heightLabel)}</HohoButton>{error && <button aria-label="关闭错误提示" className="sr-only" onClick={() => setError('')} type="button"><X /></button>}</HealthProfileActionBar></main>
}
