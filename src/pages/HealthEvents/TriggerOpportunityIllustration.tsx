import activityFollowUp from '../../assets/trigger-cards/activity-follow-up.png'
import activityOutdoor from '../../assets/trigger-cards/activity-outdoor.png'
import bodyChange from '../../assets/trigger-cards/body-change.png'
import bowelEveningReview from '../../assets/trigger-cards/bowel-evening-review.png'
import bowelMorning from '../../assets/trigger-cards/bowel-morning.png'
import careInjury from '../../assets/trigger-cards/care-injury.png'
import careMedicationFollowUp from '../../assets/trigger-cards/care-medication-follow-up.png'
import careTreatmentFollowUp from '../../assets/trigger-cards/care-treatment-follow-up.png'
import careVaccination from '../../assets/trigger-cards/care-vaccination.png'
import careVisitReport from '../../assets/trigger-cards/care-visit-report.png'
import feedingBreakfast from '../../assets/trigger-cards/feeding-breakfast.png'
import feedingDinner from '../../assets/trigger-cards/feeding-dinner.png'
import feedingNewFood from '../../assets/trigger-cards/feeding-new-food.png'
import feedingWaterSnack from '../../assets/trigger-cards/feeding-water-snack.png'
import reactionContact from '../../assets/trigger-cards/reaction-contact.png'
import reactionNewFood from '../../assets/trigger-cards/reaction-new-food.png'
import sleepEvening from '../../assets/trigger-cards/sleep-evening.png'
import sleepLateNight from '../../assets/trigger-cards/sleep-late-night.png'
import sleepMorningReview from '../../assets/trigger-cards/sleep-morning-review.png'
import sleepNap from '../../assets/trigger-cards/sleep-nap.png'
import symptomFollowUp from '../../assets/trigger-cards/symptom-follow-up.png'
import type { IllustrationKey } from './triggerOpportunityConfig'

export type AssetIllustrationKey = 'sleep.lateNight' | 'sleep.morningReview' | 'sleep.nap' | 'sleep.evening' | 'feeding.breakfast' | 'feeding.newFood' | 'feeding.dinner' | 'feeding.waterSnack' | 'bowel.morning' | 'bowel.eveningReview' | 'activity.outdoor' | 'activity.followUp' | 'body.change' | 'symptom.followUp' | 'reaction.newFood' | 'reaction.contact' | 'care.medicationFollowUp' | 'care.treatmentFollowUp' | 'care.injury' | 'care.vaccination' | 'care.visitReport'

export const triggerOpportunityIllustrations: Record<AssetIllustrationKey, string> = {
  'sleep.lateNight': sleepLateNight,
  'sleep.morningReview': sleepMorningReview,
  'sleep.nap': sleepNap,
  'sleep.evening': sleepEvening,
  'feeding.breakfast': feedingBreakfast,
  'feeding.newFood': feedingNewFood,
  'feeding.dinner': feedingDinner,
  'feeding.waterSnack': feedingWaterSnack,
  'bowel.morning': bowelMorning,
  'bowel.eveningReview': bowelEveningReview,
  'activity.outdoor': activityOutdoor,
  'activity.followUp': activityFollowUp,
  'body.change': bodyChange,
  'symptom.followUp': symptomFollowUp,
  'reaction.newFood': reactionNewFood,
  'reaction.contact': reactionContact,
  'care.medicationFollowUp': careMedicationFollowUp,
  'care.treatmentFollowUp': careTreatmentFollowUp,
  'care.injury': careInjury,
  'care.vaccination': careVaccination,
  'care.visitReport': careVisitReport,
}

const illustrationAliases: Record<IllustrationKey, AssetIllustrationKey> = {
  'late-sleep': 'sleep.lateNight',
  'morning-sleep': 'sleep.morningReview',
  nap: 'sleep.nap',
  bedtime: 'sleep.evening',
  breakfast: 'feeding.breakfast',
  'new-food': 'feeding.newFood',
  dinner: 'feeding.dinner',
  hydration: 'feeding.waterSnack',
  potty: 'bowel.morning',
  'bowel-review': 'bowel.eveningReview',
  outdoor: 'activity.outdoor',
  'activity-check': 'activity.followUp',
  'body-change': 'body.change',
  'symptom-trend': 'symptom.followUp',
  'food-reaction': 'reaction.newFood',
  'contact-reaction': 'reaction.contact',
  medicine: 'care.medicationFollowUp',
  care: 'care.treatmentFollowUp',
  injury: 'care.injury',
  vaccine: 'care.vaccination',
  visit: 'care.visitReport',
}

export function TriggerOpportunityIllustration({ kind }: { kind: IllustrationKey }) {
  return <div aria-hidden="true" className="trigger-opportunity-illustration">
    <img alt="" src={triggerOpportunityIllustrations[illustrationAliases[kind]]} />
  </div>
}
