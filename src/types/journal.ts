export type JournalCategory = 'diet' | 'sleep' | 'elimination' | 'activity' | 'emotion' | 'social' | 'symptom' | 'measurement' | 'growth' | 'injury' | 'medication' | 'care' | 'vaccination' | 'environment' | 'visit' | 'examination' | 'other'

export type DietRecordKind = 'feeding' | 'complementary' | 'meal' | 'snack' | 'supplement'

export interface JournalDietDetails {
  kind: DietRecordKind
  feedingMethod?: 'breast' | 'formula' | 'expressed' | 'mixed'
  breastSeconds?: { left: number; right: number; total: number }
  bottleMl?: number
  foods?: string[]
  foodForm?: 'puree' | 'minced' | 'small-pieces' | 'finger-food'
  amount?: string
  firstTryFoods?: string[]
  reactions?: string[]
  meal?: '早餐' | '午餐' | '晚餐' | '零食'
  appetite?: '比平时少' | '和平时差不多' | '比平时多'
  feedingStatuses?: string[]
  voiceTranscript?: string
  supplementNames?: string[]
  supplementAmount?: string
  supplementUnit?: '滴' | '毫升' | '粒' | '袋'
}

export interface JournalBowelDetails {
  shapes: string[]
  color?: string
  amount?: string
  durationRange?: string
  process?: string
  bloodObservation?: 'none-seen' | 'possibly-seen' | 'small-amount' | 'large-amount'
  observations: string[]
}

export interface JournalSleepDetails {
  sleepAt: string
  wakeAt: string
  durationMinutes: number
  kind: 'night' | 'nap'
  status?: 'ongoing' | 'completed'
  quality?: '睡得安稳' | '有些翻动' | '频繁醒来'
  observations?: string[]
  otherNote?: string
}

export type OutdoorActivityKind = 'stroller_outing' | 'walking' | 'free_play' | 'running_jumping' | 'cycling_balance_bike' | 'ball_play' | 'climbing' | 'other'
export type OutdoorActivityPlace = 'neighborhood' | 'park' | 'grassland' | 'playground' | 'school_kindergarten' | 'mall_indoor_venue' | 'other'
export type OutdoorActivityContact = 'plants_pollen' | 'animals' | 'sand_soil' | 'dust' | 'cold_air' | 'smoke_odor' | 'water' | 'none_observed'
export type OutdoorActivityObservation = 'cough' | 'wheeze_breathing_discomfort' | 'runny_nose_sneeze' | 'red_eyes_eye_rubbing' | 'red_itchy_skin' | 'scratching' | 'fall_injury' | 'none_observed'

export interface JournalOutdoorActivityDetails {
  activities: OutdoorActivityKind[]
  activityOtherText?: string
  durationRange?: 'under_15' | '15_30' | '30_60' | 'over_60'
  durationMinutes?: number
  places: OutdoorActivityPlace[]
  placeOtherText?: string
  contacts: OutdoorActivityContact[]
  activityState?: 'good' | 'tired' | 'very_tired' | 'stopped'
  observations: OutdoorActivityObservation[]
}

export type SymptomCategory = 'skin' | 'fever' | 'respiratory' | 'ent' | 'gastrointestinal' | 'pain' | 'other'
export type SymptomImpactLevel = 'little' | 'some' | 'clear'

export interface JournalSymptomLocation {
  id: string
  label: string
  locationNumber: number
  locationLayer: 'surface' | 'organ'
  bodySide?: 'left' | 'right' | 'bilateral' | 'center' | 'none'
  bodyView?: 'front' | 'back' | 'internal' | 'palm' | 'dorsum' | 'sole' | 'organ-reference'
  bodyRegion?: string
  localRegion: string
  markedArea?: string
}

export interface JournalSymptomDetails {
  symptomCategory: SymptomCategory
  otherCategoryText?: string
  locations: JournalSymptomLocation[]
  descriptors: string[]
  impactLevel?: SymptomImpactLevel
  onsetApprox?: 'just_now' | 'today' | 'yesterday' | 'two_three_days' | 'within_week' | 'earlier'
  trend?: 'same' | 'more_noticeable' | 'improving' | 'returned' | 'recurrent' | 'unclear'
  associatedSymptoms?: string[]
  symptomSpecificData?: Record<string, string | number | boolean | string[]>
  shortNote?: string
  generatedSummary?: string
}

export type MedicationRoute = 'oral' | 'topical' | 'nebulized' | 'inhaled' | 'nasal' | 'ophthalmic' | 'other'
export type MedicationObservation = 'not_observed_yet' | 'some_relief' | 'no_obvious_change' | 'discomfort_observed'

export interface MedicationReminder {
  enabled: boolean
  frequency: 'daily' | 'interval_hours' | 'weekly' | 'custom'
  timesPerDay: number
  times: string[]
  durationDays: number
  configured?: boolean
  intervalHours?: number
  firstReminderAt?: string
  weekdays?: number[]
  durationWeeks?: number
  selectedDates?: string[]
  endDate?: string
}

export interface JournalMedicationItem {
  id: string
  medicationName: string
  amountValue: number
  amountUnit: string
  dosageStep: number
  photoIds?: string[]
  recognitionSource?: 'camera' | 'album'
  recognitionStatus?: 'not_used' | 'draft_unverified' | 'user_edited'
  reminder?: MedicationReminder
}

export interface JournalMedicationDetails {
  medications?: JournalMedicationItem[]
  medicationName: string
  genericName?: string
  brandName?: string
  dosageForm?: string
  strengthText?: string
  amountValue?: number
  amountUnit?: string
  administrationRoute: MedicationRoute
  routeDetails?: Record<string, string | number | boolean | string[]>
  bodyLocations?: JournalSymptomLocation[]
  reasons?: string[]
  suggestedBy?: 'doctor' | 'pharmacist' | 'original_instruction' | 'caregiver_record' | 'other'
  suggestedByOther?: string
  observationAfterUse?: MedicationObservation
  linkedSymptomRecordIds?: string[]
  note?: string
  recognitionSource?: 'camera' | 'album'
  recognitionStatus?: 'not_used' | 'draft_unverified' | 'user_edited'
}

export type VaccinationDose = 'dose_1' | 'dose_2' | 'dose_3' | 'dose_4' | 'booster' | 'unknown'
export type VaccinationSite = 'left_upper_arm' | 'right_upper_arm' | 'left_thigh' | 'right_thigh' | 'other' | 'not_recorded'
export type VaccinationObservation = 'not_observed_yet' | 'nothing_notable' | 'injection_site_redness_or_pain' | 'fever' | 'energy_or_appetite_change' | 'other'
export interface JournalVaccinationItem {
  id: string
  vaccineName: string
  vaccineCode?: string
  commonAbbreviation?: string
  doseSequence: VaccinationDose
  manufacturerName?: string
  batchNumber?: string
  injectionSite?: VaccinationSite
  injectionSiteOtherText?: string
}
export interface JournalVaccinationDetails {
  items: JournalVaccinationItem[]
  institutionName?: string
  observations?: VaccinationObservation[]
  note?: string
  linkedSymptomRecordIds?: string[]
  recognitionSource?: 'camera' | 'album'
  recognitionStatus?: 'not_used' | 'draft_unverified' | 'user_edited'
}

export type VisitType = 'outpatient' | 'emergency' | 'inpatient' | 'online_consultation' | 'follow_up' | 'other'
export type VisitFollowUpAction = 'home_observation' | 'medication_as_instructed' | 'awaiting_results' | 'follow_up' | 'referral' | 'hospitalization' | 'other'
export type VisitDocumentType = 'medical_record' | 'prescription' | 'examination_report' | 'receipt' | 'other'

export interface JournalVisitDetails {
  visitType: VisitType
  visitTypeOtherText?: string
  reasonText?: string
  linkedSymptomRecordIds?: string[]
  linkedVisitRecordId?: string
  institutionName?: string
  platformName?: string
  department?: string
  departmentOtherText?: string
  doctorName?: string
  doctorStatement?: string
  examinationTypes?: string[]
  examinationOtherText?: string
  followUpActions?: VisitFollowUpAction[]
  followUpAt?: string
  followUpRelativeText?: string
  expectedResultAt?: string
  referralInstitution?: string
  referralDepartment?: string
  referralReason?: string
  admittedAt?: string
  dischargedAt?: string
  isCurrentlyHospitalized?: boolean
  admissionNumber?: string
  emergencyArrivalAt?: string
  emergencyDepartureAt?: string
  linkedMedicationRecordIds?: string[]
  linkedExaminationRecordIds?: string[]
  linkedInjuryRecordIds?: string[]
  linkedVaccinationRecordIds?: string[]
  documentTypes?: VisitDocumentType[]
  recognitionStatus?: 'not_used' | 'draft_unverified' | 'user_edited'
  note?: string
}

export interface JournalMetadata {
  categories?: JournalCategory[]
  timePrecision?: 'exact' | 'period' | 'day' | 'unknown'
  timeLabel?: string
  occurredAt?: string
  diet?: JournalDietDetails
  bowel?: JournalBowelDetails
  sleep?: JournalSleepDetails
  outdoorActivity?: JournalOutdoorActivityDetails
  symptom?: JournalSymptomDetails
  medication?: JournalMedicationDetails
  vaccination?: JournalVaccinationDetails
  visit?: JournalVisitDetails
}
