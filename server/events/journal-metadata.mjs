import { TimeResolverService } from '../ai/time-resolver-service.mjs'
import { HealthEventRecordError } from './health-event-record-error.mjs'

const categories = new Set(['diet', 'sleep', 'elimination', 'activity', 'emotion', 'social', 'symptom', 'measurement', 'growth', 'injury', 'medication', 'care', 'vaccination', 'environment', 'visit', 'examination', 'other'])
const dietKinds = new Set(['feeding', 'complementary', 'meal', 'snack', 'supplement'])
const feedingMethods = new Set(['breast', 'formula', 'expressed', 'mixed'])
const foodForms = new Set(['puree', 'minced', 'small-pieces', 'finger-food'])
const meals = new Set(['早餐', '午餐', '晚餐', '零食'])
const appetites = new Set(['比平时少', '和平时差不多', '比平时多'])
const supplementUnits = new Set(['滴', '毫升', '粒', '袋'])
const bowelShapes = new Set(['硬小颗粒', '细小颗粒', '成团偏硬', '光滑条状', '松散软块', '糊状', '水样', '无法判断'])
const bowelColors = new Set(['灰白', '黄色', '黄褐', '棕色', '深棕', '绿色', '近黑', '红色', '无法判断'])
const bowelAmounts = new Set(['很少', '较少', '一般', '较多', '很多'])
const bowelDurations = new Set(['1–2分钟', '2–5分钟', '5–10分钟', '超过10分钟'])
const bowelProcesses = new Set(['顺利', '有些费力', '明显费力', '像是还没排完'])
const bowelBlood = new Set(['none-seen', 'possibly-seen', 'small-amount', 'large-amount'])
const bowelObservations = new Set(['黏液', '泡沫', '奶瓣或食物残渣', '腹胀', '肚子痛（孩子能表达时）', '排便时哭闹或明显不适', '没有特别发现'])
const sleepKinds = new Set(['night', 'nap'])
const sleepQualities = new Set(['睡得安稳', '有些翻动', '频繁醒来'])
const sleepObservations = new Set(['夜醒', '入睡困难', '咳嗽', '鼻塞', '抓挠', '呼吸不适', '其他'])
const outdoorActivities = new Set(['stroller_outing', 'walking', 'free_play', 'running_jumping', 'cycling_balance_bike', 'ball_play', 'climbing', 'other'])
const outdoorDurationRanges = new Set(['under_15', '15_30', '30_60', 'over_60'])
const outdoorPlaces = new Set(['neighborhood', 'park', 'grassland', 'playground', 'school_kindergarten', 'mall_indoor_venue', 'other'])
const outdoorContacts = new Set(['plants_pollen', 'animals', 'sand_soil', 'dust', 'cold_air', 'smoke_odor', 'water', 'none_observed'])
const outdoorStates = new Set(['good', 'tired', 'very_tired', 'stopped'])
const outdoorObservations = new Set(['cough', 'wheeze_breathing_discomfort', 'runny_nose_sneeze', 'red_eyes_eye_rubbing', 'red_itchy_skin', 'scratching', 'fall_injury', 'none_observed'])
const symptomCategories = new Set(['skin', 'fever', 'respiratory', 'ent', 'gastrointestinal', 'pain', 'other'])
const symptomImpacts = new Set(['little', 'some', 'clear'])
const symptomOnsets = new Set(['just_now', 'today', 'yesterday', 'two_three_days', 'within_week', 'earlier'])
const symptomTrends = new Set(['same', 'more_noticeable', 'improving', 'returned', 'recurrent', 'unclear'])
const medicationRoutes = new Set(['oral', 'topical', 'nebulized', 'inhaled', 'nasal', 'ophthalmic', 'other'])
const medicationObservations = new Set(['not_observed_yet', 'some_relief', 'no_obvious_change', 'discomfort_observed'])
const medicationSuggestedBy = new Set(['doctor', 'pharmacist', 'original_instruction', 'caregiver_record', 'other'])
const medicationRecognitionSources = new Set(['camera', 'album'])
const medicationRecognitionStatuses = new Set(['not_used', 'draft_unverified', 'user_edited'])
const vaccinationDoses = new Set(['dose_1', 'dose_2', 'dose_3', 'dose_4', 'booster', 'unknown'])
const vaccinationSites = new Set(['left_upper_arm', 'right_upper_arm', 'left_thigh', 'right_thigh', 'other', 'not_recorded'])
const vaccinationObservations = new Set(['not_observed_yet', 'nothing_notable', 'injection_site_redness_or_pain', 'fever', 'energy_or_appetite_change', 'other'])
const visitTypes = new Set(['outpatient', 'emergency', 'inpatient', 'online_consultation', 'follow_up', 'other'])
const visitFollowUpActions = new Set(['home_observation', 'medication_as_instructed', 'awaiting_results', 'follow_up', 'referral', 'hospitalization', 'other'])
const visitDocumentTypes = new Set(['medical_record', 'prescription', 'examination_report', 'receipt', 'other'])
const visitRecognitionStatuses = new Set(['not_used', 'draft_unverified', 'user_edited'])
const resolver = new TimeResolverService()

function cleanStrings(value, field, limit = 12) {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > limit || value.some((item) => typeof item !== 'string' || !item.trim() || item.trim().length > 80)) {
    throw new HealthEventRecordError(`${field}无效`, 400, 'INVALID_JOURNAL_DIET')
  }
  return [...new Set(value.map((item) => item.trim()))]
}

function validateDiet(value) {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || !dietKinds.has(value.kind)) throw new HealthEventRecordError('饮食记录类型无效', 400, 'INVALID_JOURNAL_DIET')
  const result = { kind: value.kind }
  if (value.feedingMethod !== undefined) {
    if (!feedingMethods.has(value.feedingMethod)) throw new HealthEventRecordError('喂养方式无效', 400, 'INVALID_JOURNAL_DIET')
    result.feedingMethod = value.feedingMethod
  }
  if (value.breastSeconds !== undefined) {
    const { left, right, total } = value.breastSeconds ?? {}
    if (![left, right, total].every((item) => Number.isInteger(item) && item >= 0 && item <= 86_400) || total !== left + right) throw new HealthEventRecordError('喂养时长无效', 400, 'INVALID_JOURNAL_DIET')
    result.breastSeconds = { left, right, total }
  }
  if (value.bottleMl !== undefined) {
    if (!Number.isFinite(value.bottleMl) || value.bottleMl <= 0 || value.bottleMl > 5000) throw new HealthEventRecordError('喂奶量无效', 400, 'INVALID_JOURNAL_DIET')
    result.bottleMl = value.bottleMl
  }
  const foods = cleanStrings(value.foods, '食物')
  const firstTryFoods = cleanStrings(value.firstTryFoods, '首次尝试食物')
  const reactions = cleanStrings(value.reactions, '进食后观察', 8)
  const feedingStatuses = cleanStrings(value.feedingStatuses, '进食状态', 8)
  const supplementNames = cleanStrings(value.supplementNames, '补剂名称')
  if (foods !== undefined) result.foods = foods
  if (firstTryFoods !== undefined) {
    if (firstTryFoods.some((food) => !foods?.includes(food))) throw new HealthEventRecordError('首次尝试食物必须来自本次食物', 400, 'INVALID_JOURNAL_DIET')
    result.firstTryFoods = firstTryFoods
  }
  if (reactions !== undefined) result.reactions = reactions
  if (feedingStatuses !== undefined) result.feedingStatuses = feedingStatuses
  if (supplementNames !== undefined) result.supplementNames = supplementNames
  if (value.foodForm !== undefined) {
    if (!foodForms.has(value.foodForm)) throw new HealthEventRecordError('食物形态无效', 400, 'INVALID_JOURNAL_DIET')
    result.foodForm = value.foodForm
  }
  if (value.meal !== undefined) {
    if (!meals.has(value.meal)) throw new HealthEventRecordError('餐次无效', 400, 'INVALID_JOURNAL_DIET')
    result.meal = value.meal
  }
  if (value.appetite !== undefined) {
    if (!appetites.has(value.appetite)) throw new HealthEventRecordError('食欲记录无效', 400, 'INVALID_JOURNAL_DIET')
    result.appetite = value.appetite
  }
  if (value.supplementUnit !== undefined) {
    if (!supplementUnits.has(value.supplementUnit)) throw new HealthEventRecordError('补剂单位无效', 400, 'INVALID_JOURNAL_DIET')
    result.supplementUnit = value.supplementUnit
  }
  for (const key of ['amount', 'voiceTranscript', 'supplementAmount']) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== 'string' || !value[key].trim() || value[key].trim().length > 1000) throw new HealthEventRecordError('饮食记录内容无效', 400, 'INVALID_JOURNAL_DIET')
      result[key] = value[key].trim()
    }
  }
  if (value.kind === 'supplement' && (!supplementNames?.length || !Number.isFinite(Number(result.supplementAmount)) || Number(result.supplementAmount) <= 0 || !result.supplementUnit)) {
    throw new HealthEventRecordError('补剂名称、用量和单位不能为空', 400, 'INVALID_JOURNAL_DIET')
  }
  return result
}

function validateBowel(value) {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object') throw new HealthEventRecordError('排便记录无效', 400, 'INVALID_JOURNAL_BOWEL')
  const shapes = cleanStrings(value.shapes, '排便形状', 8) ?? []
  const observations = cleanStrings(value.observations, '其他观察', 7) ?? []
  if (shapes.some((item) => !bowelShapes.has(item)) || observations.some((item) => !bowelObservations.has(item))) throw new HealthEventRecordError('排便观察选项无效', 400, 'INVALID_JOURNAL_BOWEL')
  if (observations.includes('没有特别发现') && observations.length > 1) throw new HealthEventRecordError('排便观察选项互斥', 400, 'INVALID_JOURNAL_BOWEL')
  const result = { shapes, observations }
  for (const [key, allowed] of [['color', bowelColors], ['amount', bowelAmounts], ['durationRange', bowelDurations], ['process', bowelProcesses], ['bloodObservation', bowelBlood]]) {
    if (value[key] !== undefined) {
      if (!allowed.has(value[key])) throw new HealthEventRecordError('排便记录选项无效', 400, 'INVALID_JOURNAL_BOWEL')
      result[key] = value[key]
    }
  }
  return result
}

function validateSleep(value) {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || !sleepKinds.has(value.kind)) throw new HealthEventRecordError('睡眠类型无效', 400, 'INVALID_JOURNAL_SLEEP')
  const sleepAt = new Date(value.sleepAt)
  if (!Number.isFinite(sleepAt.getTime())) throw new HealthEventRecordError('睡眠时间无效', 400, 'INVALID_JOURNAL_SLEEP')
  if (value.status === 'ongoing') return { sleepAt: sleepAt.toISOString(), kind: value.kind, status: 'ongoing' }
  const wakeAt = new Date(value.wakeAt)
  if (!Number.isFinite(wakeAt.getTime())) throw new HealthEventRecordError('睡眠时间无效', 400, 'INVALID_JOURNAL_SLEEP')
  const durationMinutes = Math.round((wakeAt.getTime() - sleepAt.getTime()) / 60_000)
  if (durationMinutes <= 0 || durationMinutes > 1440) throw new HealthEventRecordError('睡眠时长必须大于0且不超过24小时', 400, 'INVALID_JOURNAL_SLEEP')
  if (value.quality !== undefined && !sleepQualities.has(value.quality)) throw new HealthEventRecordError('睡眠感受无效', 400, 'INVALID_JOURNAL_SLEEP')
  const observations = cleanStrings(value.observations, '睡眠观察', 7)
  if (observations?.some((item) => !sleepObservations.has(item))) throw new HealthEventRecordError('睡眠观察无效', 400, 'INVALID_JOURNAL_SLEEP')
  const otherNote = value.otherNote === undefined ? undefined : validateSleepNote(value.otherNote)
  if (otherNote && !observations?.includes('其他')) throw new HealthEventRecordError('睡眠补充说明必须选择其他', 400, 'INVALID_JOURNAL_SLEEP')
  return { sleepAt: sleepAt.toISOString(), wakeAt: wakeAt.toISOString(), durationMinutes, kind: value.kind, ...(value.status === 'completed' ? { status: 'completed' } : {}), ...(value.quality ? { quality: value.quality } : {}), ...(observations?.length ? { observations } : {}), ...(otherNote ? { otherNote } : {}) }
}

function validateSleepNote(value) {
  if (typeof value !== 'string' || value.trim().length > 120) throw new HealthEventRecordError('睡眠补充说明无效', 400, 'INVALID_JOURNAL_SLEEP')
  return value.trim()
}

function optionalShortText(value, field) {
  if (value === undefined || value === '') return undefined
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 80) throw new HealthEventRecordError(`${field}无效`, 400, 'INVALID_JOURNAL_OUTDOOR_ACTIVITY')
  return value.trim()
}

function validateOutdoorActivity(value) {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object') throw new HealthEventRecordError('户外活动记录无效', 400, 'INVALID_JOURNAL_OUTDOOR_ACTIVITY')
  const activities = cleanStrings(value.activities, '活动类型', 8) ?? []
  const places = cleanStrings(value.places, '活动地点', 7) ?? []
  const contacts = cleanStrings(value.contacts, '环境接触', 8) ?? []
  const observations = cleanStrings(value.observations, '身体观察', 8) ?? []
  if (activities.some((item) => !outdoorActivities.has(item)) || places.some((item) => !outdoorPlaces.has(item)) || contacts.some((item) => !outdoorContacts.has(item)) || observations.some((item) => !outdoorObservations.has(item))) throw new HealthEventRecordError('户外活动选项无效', 400, 'INVALID_JOURNAL_OUTDOOR_ACTIVITY')
  if (contacts.includes('none_observed') && contacts.length > 1) throw new HealthEventRecordError('环境接触选项互斥', 400, 'INVALID_JOURNAL_OUTDOOR_ACTIVITY')
  if (observations.includes('none_observed') && observations.length > 1) throw new HealthEventRecordError('身体观察选项互斥', 400, 'INVALID_JOURNAL_OUTDOOR_ACTIVITY')
  if (value.durationRange !== undefined && !outdoorDurationRanges.has(value.durationRange)) throw new HealthEventRecordError('活动时长范围无效', 400, 'INVALID_JOURNAL_OUTDOOR_ACTIVITY')
  if (value.durationMinutes !== undefined && (!Number.isInteger(value.durationMinutes) || value.durationMinutes <= 0 || value.durationMinutes > 1440)) throw new HealthEventRecordError('具体活动时长无效', 400, 'INVALID_JOURNAL_OUTDOOR_ACTIVITY')
  if (value.durationRange !== undefined && value.durationMinutes !== undefined) throw new HealthEventRecordError('活动时长只能选择一种填写方式', 400, 'INVALID_JOURNAL_OUTDOOR_ACTIVITY')
  if (value.activityState !== undefined && !outdoorStates.has(value.activityState)) throw new HealthEventRecordError('活动状态无效', 400, 'INVALID_JOURNAL_OUTDOOR_ACTIVITY')
  const activityOtherText = optionalShortText(value.activityOtherText, '其他活动名称')
  const placeOtherText = optionalShortText(value.placeOtherText, '其他地点名称')
  if (activityOtherText && !activities.includes('other')) throw new HealthEventRecordError('其他活动名称必须选择其他', 400, 'INVALID_JOURNAL_OUTDOOR_ACTIVITY')
  if (placeOtherText && !places.includes('other')) throw new HealthEventRecordError('其他地点名称必须选择其他', 400, 'INVALID_JOURNAL_OUTDOOR_ACTIVITY')
  return { activities, places, contacts, observations, ...(activityOtherText ? { activityOtherText } : {}), ...(placeOtherText ? { placeOtherText } : {}), ...(value.durationRange ? { durationRange: value.durationRange } : {}), ...(value.durationMinutes ? { durationMinutes: value.durationMinutes } : {}), ...(value.activityState ? { activityState: value.activityState } : {}) }
}

function validateSymptom(value) {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || !symptomCategories.has(value.symptomCategory)) throw new HealthEventRecordError('症状分类无效', 400, 'INVALID_JOURNAL_SYMPTOM')
  if (!Array.isArray(value.locations) || value.locations.length < 1 || value.locations.length > 20) throw new HealthEventRecordError('请至少标记一个身体部位', 400, 'INVALID_JOURNAL_SYMPTOM')
  const locations = value.locations.map((item, index) => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id.trim() || typeof item.label !== 'string' || !item.label.trim() || item.locationNumber !== index + 1 || !['surface', 'organ'].includes(item.locationLayer)) throw new HealthEventRecordError('症状位置无效', 400, 'INVALID_JOURNAL_SYMPTOM')
    const result = { id: item.id.trim(), label: item.label.trim(), locationNumber: item.locationNumber, locationLayer: item.locationLayer, localRegion: typeof item.localRegion === 'string' && item.localRegion.trim() ? item.localRegion.trim() : item.label.trim() }
    for (const key of ['bodySide', 'bodyView', 'bodyRegion', 'markedArea']) if (typeof item[key] === 'string' && item[key].trim()) result[key] = item[key].trim()
    return result
  })
  const descriptors = cleanStrings(value.descriptors, '症状表现', 20) ?? []
  const associatedSymptoms = cleanStrings(value.associatedSymptoms, '伴随表现', 12)
  if (associatedSymptoms?.includes('没有特别发现') && associatedSymptoms.length > 1) throw new HealthEventRecordError('伴随表现选项互斥', 400, 'INVALID_JOURNAL_SYMPTOM')
  if (value.impactLevel !== undefined && !symptomImpacts.has(value.impactLevel)) throw new HealthEventRecordError('影响程度无效', 400, 'INVALID_JOURNAL_SYMPTOM')
  if (value.onsetApprox !== undefined && !symptomOnsets.has(value.onsetApprox)) throw new HealthEventRecordError('开始时间无效', 400, 'INVALID_JOURNAL_SYMPTOM')
  if (value.trend !== undefined && !symptomTrends.has(value.trend)) throw new HealthEventRecordError('变化记录无效', 400, 'INVALID_JOURNAL_SYMPTOM')
  const optionalText = (source, field, limit) => source === undefined ? undefined : typeof source === 'string' && source.trim() && source.trim().length <= limit ? source.trim() : (() => { throw new HealthEventRecordError(`${field}无效`, 400, 'INVALID_JOURNAL_SYMPTOM') })()
  const otherCategoryText = optionalText(value.otherCategoryText, '其他症状', 80)
  if (value.symptomCategory === 'other' && !otherCategoryText) throw new HealthEventRecordError('请填写其他症状', 400, 'INVALID_JOURNAL_SYMPTOM')
  const shortNote = optionalText(value.shortNote, '症状补充', 160)
  const generatedSummary = optionalText(value.generatedSummary, '症状摘要', 1000)
  let symptomSpecificData
  if (value.symptomSpecificData !== undefined) {
    if (!value.symptomSpecificData || typeof value.symptomSpecificData !== 'object' || Array.isArray(value.symptomSpecificData) || Object.keys(value.symptomSpecificData).length > 20) throw new HealthEventRecordError('症状专属信息无效', 400, 'INVALID_JOURNAL_SYMPTOM')
    symptomSpecificData = {}
    for (const [key, item] of Object.entries(value.symptomSpecificData)) {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key) || !(typeof item === 'string' && item.length <= 160 || typeof item === 'number' && Number.isFinite(item) || typeof item === 'boolean' || Array.isArray(item) && item.length <= 12 && item.every((entry) => typeof entry === 'string' && entry.length <= 80))) throw new HealthEventRecordError('症状专属信息无效', 400, 'INVALID_JOURNAL_SYMPTOM')
      symptomSpecificData[key] = item
    }
  }
  return { symptomCategory: value.symptomCategory, locations, descriptors, ...(otherCategoryText ? { otherCategoryText } : {}), ...(value.impactLevel ? { impactLevel: value.impactLevel } : {}), ...(value.onsetApprox ? { onsetApprox: value.onsetApprox } : {}), ...(value.trend ? { trend: value.trend } : {}), ...(associatedSymptoms?.length ? { associatedSymptoms } : {}), ...(symptomSpecificData ? { symptomSpecificData } : {}), ...(shortNote ? { shortNote } : {}), ...(generatedSummary ? { generatedSummary } : {}) }
}

function validateMedication(value) {
  if (value === undefined) return undefined
  if (value && typeof value === 'object' && Array.isArray(value.medications)) {
    if (value.medications.length < 1 || value.medications.length > 12) throw new HealthEventRecordError('用药项目数量无效', 400, 'INVALID_JOURNAL_MEDICATION')
    const ids = new Set()
    const medications = value.medications.map((item) => {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id.trim() || ids.has(item.id) || typeof item.medicationName !== 'string' || !item.medicationName.trim() || item.medicationName.trim().length > 120) throw new HealthEventRecordError('用药项目无效', 400, 'INVALID_JOURNAL_MEDICATION')
      ids.add(item.id)
      if (!Number.isFinite(item.amountValue) || item.amountValue <= 0 || item.amountValue > 100000 || typeof item.amountUnit !== 'string' || !item.amountUnit.trim() || item.amountUnit.trim().length > 20) throw new HealthEventRecordError('本次用量无效', 400, 'INVALID_JOURNAL_MEDICATION')
      if (![0.1, 0.5, 1].includes(item.dosageStep)) throw new HealthEventRecordError('剂量步长无效', 400, 'INVALID_JOURNAL_MEDICATION')
      const result = { id: item.id.trim(), medicationName: item.medicationName.trim(), amountValue: item.amountValue, amountUnit: item.amountUnit.trim(), dosageStep: item.dosageStep }
      const photoIds = cleanStrings(item.photoIds, '药品照片', 6); if (photoIds?.length) result.photoIds = photoIds
      if (item.recognitionSource !== undefined) { if (!medicationRecognitionSources.has(item.recognitionSource) || !medicationRecognitionStatuses.has(item.recognitionStatus)) throw new HealthEventRecordError('识别状态无效', 400, 'INVALID_JOURNAL_MEDICATION'); result.recognitionSource = item.recognitionSource; result.recognitionStatus = item.recognitionStatus }
      if (item.reminder !== undefined) {
        const reminder = item.reminder
        if (!reminder || typeof reminder.enabled !== 'boolean' || !['daily', 'interval_hours', 'weekly', 'custom'].includes(reminder.frequency) || !Number.isInteger(reminder.timesPerDay) || reminder.timesPerDay < 1 || reminder.timesPerDay > 12 || !Array.isArray(reminder.times) || reminder.times.length !== reminder.timesPerDay || reminder.times.some((time) => typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) || !Number.isInteger(reminder.durationDays) || reminder.durationDays < 1 || reminder.durationDays > 365) throw new HealthEventRecordError('用药提醒设置无效', 400, 'INVALID_JOURNAL_MEDICATION')
        result.reminder = { enabled: reminder.enabled, frequency: reminder.frequency, timesPerDay: reminder.timesPerDay, times: [...new Set(reminder.times)].sort(), durationDays: reminder.durationDays }
        if (result.reminder.times.length !== reminder.timesPerDay) throw new HealthEventRecordError('提醒时间不能重复', 400, 'INVALID_JOURNAL_MEDICATION')
        if (reminder.configured !== undefined) { if (typeof reminder.configured !== 'boolean') throw new HealthEventRecordError('用药提醒设置无效', 400, 'INVALID_JOURNAL_MEDICATION'); result.reminder.configured = reminder.configured }
        if (reminder.endDate !== undefined) { if (typeof reminder.endDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(reminder.endDate) || !Number.isFinite(Date.parse(`${reminder.endDate}T00:00:00Z`))) throw new HealthEventRecordError('提醒结束日期无效', 400, 'INVALID_JOURNAL_MEDICATION'); result.reminder.endDate = reminder.endDate }
        if (reminder.frequency === 'interval_hours' && reminder.configured) {
          if (!Number.isInteger(reminder.intervalHours) || reminder.intervalHours < 1 || reminder.intervalHours > 168 || typeof reminder.firstReminderAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(reminder.firstReminderAt)) throw new HealthEventRecordError('间隔提醒设置无效', 400, 'INVALID_JOURNAL_MEDICATION')
          result.reminder.intervalHours = reminder.intervalHours; result.reminder.firstReminderAt = reminder.firstReminderAt
        }
        if (reminder.frequency === 'weekly' && reminder.configured) {
          if (!Array.isArray(reminder.weekdays) || reminder.weekdays.length < 1 || reminder.weekdays.length > 7 || reminder.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6) || new Set(reminder.weekdays).size !== reminder.weekdays.length || !Number.isInteger(reminder.durationWeeks) || reminder.durationWeeks < 1 || reminder.durationWeeks > 52) throw new HealthEventRecordError('每周提醒设置无效', 400, 'INVALID_JOURNAL_MEDICATION')
          result.reminder.weekdays = [...reminder.weekdays].sort(); result.reminder.durationWeeks = reminder.durationWeeks
        }
        if (reminder.frequency === 'custom' && reminder.configured) {
          if (!Array.isArray(reminder.selectedDates) || reminder.selectedDates.length < 1 || reminder.selectedDates.length > 100 || reminder.selectedDates.some((date) => typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))) || new Set(reminder.selectedDates).size !== reminder.selectedDates.length) throw new HealthEventRecordError('自定义提醒日期无效', 400, 'INVALID_JOURNAL_MEDICATION')
          result.reminder.selectedDates = [...reminder.selectedDates].sort()
        }
      }
      return result
    })
    const first = medications[0]
    return { medications, medicationName: first.medicationName, amountValue: first.amountValue, amountUnit: first.amountUnit, administrationRoute: 'oral' }
  }
  if (!value || typeof value !== 'object' || typeof value.medicationName !== 'string' || !value.medicationName.trim() || value.medicationName.trim().length > 120 || !medicationRoutes.has(value.administrationRoute)) throw new HealthEventRecordError('用药记录无效', 400, 'INVALID_JOURNAL_MEDICATION')
  const result = { medicationName: value.medicationName.trim(), administrationRoute: value.administrationRoute }
  for (const key of ['genericName', 'brandName', 'dosageForm', 'strengthText', 'suggestedByOther']) if (value[key] !== undefined) {
    if (typeof value[key] !== 'string' || !value[key].trim() || value[key].trim().length > 120) throw new HealthEventRecordError('药品信息无效', 400, 'INVALID_JOURNAL_MEDICATION')
    result[key] = value[key].trim()
  }
  if (value.amountValue !== undefined) {
    if (!Number.isFinite(value.amountValue) || value.amountValue <= 0 || value.amountValue > 100000 || typeof value.amountUnit !== 'string' || !value.amountUnit.trim() || value.amountUnit.trim().length > 20) throw new HealthEventRecordError('本次用量无效', 400, 'INVALID_JOURNAL_MEDICATION')
    result.amountValue = value.amountValue; result.amountUnit = value.amountUnit.trim()
  } else if (value.amountUnit !== undefined) throw new HealthEventRecordError('不能只填写用量单位', 400, 'INVALID_JOURNAL_MEDICATION')
  const reasons = cleanStrings(value.reasons, '使用原因', 8); if (reasons?.length) result.reasons = reasons
  const linked = cleanStrings(value.linkedSymptomRecordIds, '关联症状', 20); if (linked?.length) result.linkedSymptomRecordIds = linked
  if (value.suggestedBy !== undefined) { if (!medicationSuggestedBy.has(value.suggestedBy)) throw new HealthEventRecordError('建议来源无效', 400, 'INVALID_JOURNAL_MEDICATION'); result.suggestedBy = value.suggestedBy }
  if (value.observationAfterUse !== undefined) { if (!medicationObservations.has(value.observationAfterUse)) throw new HealthEventRecordError('用后观察无效', 400, 'INVALID_JOURNAL_MEDICATION'); result.observationAfterUse = value.observationAfterUse }
  if (value.recognitionSource !== undefined) { if (!medicationRecognitionSources.has(value.recognitionSource) || !medicationRecognitionStatuses.has(value.recognitionStatus)) throw new HealthEventRecordError('识别状态无效', 400, 'INVALID_JOURNAL_MEDICATION'); result.recognitionSource = value.recognitionSource; result.recognitionStatus = value.recognitionStatus }
  if (value.note !== undefined) { if (typeof value.note !== 'string' || !value.note.trim() || value.note.trim().length > 200) throw new HealthEventRecordError('用药备注无效', 400, 'INVALID_JOURNAL_MEDICATION'); result.note = value.note.trim() }
  if (value.routeDetails !== undefined) { if (!value.routeDetails || typeof value.routeDetails !== 'object' || Array.isArray(value.routeDetails) || JSON.stringify(value.routeDetails).length > 2000) throw new HealthEventRecordError('使用方式详情无效', 400, 'INVALID_JOURNAL_MEDICATION'); result.routeDetails = value.routeDetails }
  if (value.bodyLocations !== undefined) result.bodyLocations = validateSymptom({ symptomCategory: 'other', otherCategoryText: '用药位置', locations: value.bodyLocations, descriptors: [] }).locations
  return result
}

function validateVaccination(value) {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || !Array.isArray(value.items) || value.items.length < 1 || value.items.length > 8) throw new HealthEventRecordError('疫苗接种记录无效', 400, 'INVALID_JOURNAL_VACCINATION')
  const ids = new Set()
  const items = value.items.map((item) => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id.trim() || ids.has(item.id) || typeof item.vaccineName !== 'string' || !item.vaccineName.trim() || item.vaccineName.trim().length > 120 || !vaccinationDoses.has(item.doseSequence)) throw new HealthEventRecordError('疫苗项目无效', 400, 'INVALID_JOURNAL_VACCINATION')
    ids.add(item.id)
    const result = { id: item.id.trim(), vaccineName: item.vaccineName.trim(), doseSequence: item.doseSequence }
    for (const key of ['vaccineCode', 'commonAbbreviation', 'manufacturerName', 'batchNumber']) if (item[key] !== undefined && item[key] !== '') {
      if (typeof item[key] !== 'string' || item[key].trim().length > 120) throw new HealthEventRecordError('疫苗项目内容无效', 400, 'INVALID_JOURNAL_VACCINATION')
      result[key] = item[key].trim()
    }
    if (item.injectionSite !== undefined) { if (!vaccinationSites.has(item.injectionSite)) throw new HealthEventRecordError('接种部位无效', 400, 'INVALID_JOURNAL_VACCINATION'); result.injectionSite = item.injectionSite }
    if (item.injectionSiteOtherText !== undefined && item.injectionSiteOtherText !== '') { if (item.injectionSite !== 'other' || typeof item.injectionSiteOtherText !== 'string' || item.injectionSiteOtherText.trim().length > 80) throw new HealthEventRecordError('其他接种部位无效', 400, 'INVALID_JOURNAL_VACCINATION'); result.injectionSiteOtherText = item.injectionSiteOtherText.trim() }
    return result
  })
  const observations = cleanStrings(value.observations, '接种后观察', 6) ?? []
  if (observations.some((item) => !vaccinationObservations.has(item)) || (observations.includes('not_observed_yet') && observations.length > 1) || (observations.includes('nothing_notable') && observations.length > 1)) throw new HealthEventRecordError('接种后观察选项互斥', 400, 'INVALID_JOURNAL_VACCINATION')
  const result = { items, ...(observations.length ? { observations } : {}) }
  for (const [key, limit] of [['institutionName', 120], ['note', 200]]) if (value[key] !== undefined && value[key] !== '') { if (typeof value[key] !== 'string' || value[key].trim().length > limit) throw new HealthEventRecordError('疫苗接种补充信息无效', 400, 'INVALID_JOURNAL_VACCINATION'); result[key] = value[key].trim() }
  const linked = cleanStrings(value.linkedSymptomRecordIds, '关联症状', 20); if (linked?.length) result.linkedSymptomRecordIds = linked
  if (value.recognitionSource !== undefined) { if (!medicationRecognitionSources.has(value.recognitionSource) || !medicationRecognitionStatuses.has(value.recognitionStatus)) throw new HealthEventRecordError('识别状态无效', 400, 'INVALID_JOURNAL_VACCINATION'); result.recognitionSource = value.recognitionSource; result.recognitionStatus = value.recognitionStatus }
  return result
}

function validateVisit(value) {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || !visitTypes.has(value.visitType)) throw new HealthEventRecordError('就医方式无效', 400, 'INVALID_JOURNAL_VISIT')
  const result = { visitType: value.visitType }
  const textFields = {
    visitTypeOtherText: 80, reasonText: 240, institutionName: 120, platformName: 120,
    department: 80, departmentOtherText: 80, doctorName: 80, doctorStatement: 500,
    examinationOtherText: 120, followUpRelativeText: 80, referralInstitution: 120,
    referralDepartment: 80, referralReason: 200, admissionNumber: 80, note: 300
  }
  for (const [key, limit] of Object.entries(textFields)) if (value[key] !== undefined && value[key] !== '') {
    if (typeof value[key] !== 'string' || !value[key].trim() || value[key].trim().length > limit) throw new HealthEventRecordError('就医记录内容无效', 400, 'INVALID_JOURNAL_VISIT')
    result[key] = value[key].trim()
  }
  if (value.visitType === 'other' && !result.visitTypeOtherText) throw new HealthEventRecordError('请填写实际就医方式', 400, 'INVALID_JOURNAL_VISIT')
  if (value.visitType === 'online_consultation' && result.institutionName) throw new HealthEventRecordError('线上问诊请填写平台或机构', 400, 'INVALID_JOURNAL_VISIT')
  const examinations = cleanStrings(value.examinationTypes, '检查项目', 12); if (examinations?.length) result.examinationTypes = examinations
  const followUps = cleanStrings(value.followUpActions, '后续安排', 8); if (followUps?.some((item) => !visitFollowUpActions.has(item))) throw new HealthEventRecordError('后续安排无效', 400, 'INVALID_JOURNAL_VISIT'); if (followUps?.length) result.followUpActions = followUps
  const documentTypes = cleanStrings(value.documentTypes, '资料类型', 5); if (documentTypes?.some((item) => !visitDocumentTypes.has(item))) throw new HealthEventRecordError('资料类型无效', 400, 'INVALID_JOURNAL_VISIT'); if (documentTypes?.length) result.documentTypes = documentTypes
  for (const [key, label] of [['linkedSymptomRecordIds', '关联症状'], ['linkedMedicationRecordIds', '关联用药'], ['linkedExaminationRecordIds', '关联检查'], ['linkedInjuryRecordIds', '关联受伤'], ['linkedVaccinationRecordIds', '关联疫苗']]) {
    const ids = cleanStrings(value[key], label, 30); if (ids?.length) result[key] = ids
  }
  if (value.linkedVisitRecordId !== undefined) { if (typeof value.linkedVisitRecordId !== 'string' || !value.linkedVisitRecordId.trim() || value.linkedVisitRecordId.trim().length > 80) throw new HealthEventRecordError('关联就医记录无效', 400, 'INVALID_JOURNAL_VISIT'); result.linkedVisitRecordId = value.linkedVisitRecordId.trim() }
  for (const key of ['followUpAt', 'expectedResultAt', 'admittedAt', 'dischargedAt', 'emergencyArrivalAt', 'emergencyDepartureAt']) if (value[key] !== undefined && value[key] !== '') {
    if (typeof value[key] !== 'string' || !Number.isFinite(Date.parse(value[key]))) throw new HealthEventRecordError('就医时间信息无效', 400, 'INVALID_JOURNAL_VISIT')
    result[key] = new Date(value[key]).toISOString()
  }
  if (value.isCurrentlyHospitalized !== undefined) { if (typeof value.isCurrentlyHospitalized !== 'boolean') throw new HealthEventRecordError('住院状态无效', 400, 'INVALID_JOURNAL_VISIT'); result.isCurrentlyHospitalized = value.isCurrentlyHospitalized }
  if (result.dischargedAt && result.admittedAt && Date.parse(result.dischargedAt) < Date.parse(result.admittedAt)) throw new HealthEventRecordError('出院时间不能早于入院时间', 400, 'INVALID_JOURNAL_VISIT')
  if (value.recognitionStatus !== undefined) { if (!visitRecognitionStatuses.has(value.recognitionStatus)) throw new HealthEventRecordError('资料识别状态无效', 400, 'INVALID_JOURNAL_VISIT'); result.recognitionStatus = value.recognitionStatus }
  return result
}

function recordedClock(occurredAt, timezone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(occurredAt)).map(({ type, value }) => [type, value]))
  return `${parts.hour}:${parts.minute}`
}

export function validateJournal(value) {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'object' || !Array.isArray(value.categories) || value.categories.some((category) => !categories.has(category))) {
    throw new HealthEventRecordError('记录分类无效', 400, 'INVALID_JOURNAL_CATEGORY')
  }
  const diet = validateDiet(value.diet)
  const bowel = validateBowel(value.bowel)
  const sleep = validateSleep(value.sleep)
  const outdoorActivity = validateOutdoorActivity(value.outdoorActivity)
  const symptom = validateSymptom(value.symptom)
  const medication = validateMedication(value.medication)
  const vaccination = validateVaccination(value.vaccination)
  const visit = validateVisit(value.visit)
  if (diet && !value.categories.includes('diet')) throw new HealthEventRecordError('饮食详情必须归入喂养/饮食分类', 400, 'INVALID_JOURNAL_DIET')
  if (bowel && !value.categories.includes('elimination')) throw new HealthEventRecordError('排便详情必须归入排便分类', 400, 'INVALID_JOURNAL_BOWEL')
  if (sleep && !value.categories.includes('sleep')) throw new HealthEventRecordError('睡眠详情必须归入睡眠分类', 400, 'INVALID_JOURNAL_SLEEP')
  if (outdoorActivity && !value.categories.includes('activity')) throw new HealthEventRecordError('户外活动详情必须归入活动分类', 400, 'INVALID_JOURNAL_OUTDOOR_ACTIVITY')
  if (symptom && !value.categories.includes('symptom')) throw new HealthEventRecordError('症状详情必须归入症状分类', 400, 'INVALID_JOURNAL_SYMPTOM')
  if (medication && !value.categories.includes('medication')) throw new HealthEventRecordError('用药详情必须归入用药分类', 400, 'INVALID_JOURNAL_MEDICATION')
  if (vaccination && !value.categories.includes('vaccination')) throw new HealthEventRecordError('疫苗详情必须归入疫苗分类', 400, 'INVALID_JOURNAL_VACCINATION')
  if (visit && !value.categories.includes('visit')) throw new HealthEventRecordError('就医详情必须归入就医分类', 400, 'INVALID_JOURNAL_VISIT')
  return { categories: [...new Set(value.categories)], ...(diet ? { diet } : {}), ...(bowel ? { bowel } : {}), ...(sleep ? { sleep } : {}), ...(outdoorActivity ? { outdoorActivity } : {}), ...(symptom ? { symptom } : {}), ...(medication ? { medication } : {}), ...(vaccination ? { vaccination } : {}), ...(visit ? { visit } : {}) }
}

// Read-only presentation: never backfill guessed timestamps into historical records.
export function projectJournalRecord(record, timezone = 'Asia/Shanghai') {
  const selected = ['user_record', 'measurement', 'doctor_confirmation'].includes(record.sourceType)
  let journal = { ...record.journal, timePrecision: 'exact', occurredAt: record.occurredAt }
  if (!selected) {
    const text = record.sourceText || record.content || ''
    const clocks = text.match(/[一二两三四五六七八九十\d]{1,3}(?:点(?:半|[一二两三四五六七八九十\d]{1,3}分?)?|[:：]\d{1,2})/g) ?? []
    const days = text.match(/今天|昨天|前天|昨晚|\d{1,2}月\d{1,2}[日号]/g) ?? []
    const periods = text.match(/凌晨|半夜|今早|早上|上午|中午|下午|晚上|昨晚|夜里|夜间/g) ?? []
    // A degree such as “有一点痒” is not a clock. Only unambiguous clock context
    // may enter the existing resolver; leave uncertain originals untouched.
    const clock = clocks[0]
    const clockIndex = clock ? text.indexOf(clock) : -1
    const clockContext = !clock || clock.includes(':') || clock.includes('：') || clockIndex === 0 || /(?:今天|昨天|前天|凌晨|半夜|早上|上午|中午|下午|晚上|昨晚|夜里|夜间|在|于|到|[，,。\s])$/.test(text.slice(0, clockIndex))
    if (clockContext && !/一点(?:点|儿|痒|疼|痛)|明天|后天|下周|下个月/.test(text) && clocks.length <= 1 && new Set(days).size <= 1 && new Set(periods).size <= 1) {
      try {
        const time = resolver.resolve(text.replaceAll('：', ':'), { timezone, referenceNow: new Date(record.createdAt) })
        let projected = time
        // A spoken day without a clock still belongs to that day, but its visible
        // minute is the moment the user made the record rather than midnight.
        if (time.precision === 'day' && time.resolvedStart) {
          projected = resolver.resolve(`${text.replaceAll('：', ':')} ${recordedClock(record.occurredAt, timezone)}`, { timezone, referenceNow: new Date(record.createdAt) })
        }
        if (projected.resolvedStart && ['exact', 'period'].includes(projected.precision) && Date.parse(projected.resolvedStart) <= Date.parse(record.createdAt)) {
          journal = { ...journal, occurredAt: projected.resolvedStart, timePrecision: projected.precision, ...(projected.precision === 'period' ? { timeLabel: periods[0] === '昨晚' ? '晚上' : periods[0] } : {}) }
        }
      } catch { /* Invalid or ambiguous legacy input keeps its raw content and unknown precision. */ }
    }
  }
  return { ...record, journal }
}
