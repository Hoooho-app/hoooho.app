import type { JournalCategory } from '../../types/journal'
import type { TriggerCopyKey } from './triggerOpportunityI18n'

export type TriggerType = 'time' | 'event' | 'record-gap'
export type IllustrationKey = 'late-sleep' | 'morning-sleep' | 'nap' | 'bedtime' | 'breakfast' | 'new-food' | 'dinner' | 'hydration' | 'potty' | 'bowel-review' | 'outdoor' | 'activity-check' | 'body-change' | 'symptom-trend' | 'food-reaction' | 'contact-reaction' | 'medicine' | 'care' | 'injury' | 'vaccine' | 'visit'

export type TriggerPrefill = Record<string, string | boolean>
export type TriggerCardConfig = {
  id: string; copyKey: TriggerCopyKey; category: JournalCategory; triggerType: TriggerType; priority: number
  timeWindow?: { start: number; end: number }; prerequisite?: { recordType: JournalCategory; minDelayMinutes?: number; maxDelayMinutes?: number; predicate?: 'new-food' | 'contact' | 'incomplete-visit' }
  illustrationKey: IllustrationKey; mode: 'start' | 'backfill' | 'nap'; prefill: readonly [TriggerPrefill, TriggerPrefill]; cooldownKey: string
}

export const triggerCardConfigs: readonly TriggerCardConfig[] = [
  { id:'sleep-late',copyKey:'sleep-late',category:'sleep',triggerType:'time',priority:40,timeWindow:{start:0,end:6},illustrationKey:'late-sleep',mode:'start',prefill:[{status:'ongoing'},{status:'ongoing'}],cooldownKey:'sleep-late' },
  { id:'sleep-morning',copyKey:'sleep-morning',category:'sleep',triggerType:'time',priority:40,timeWindow:{start:6,end:11},illustrationKey:'morning-sleep',mode:'backfill',prefill:[{quality:'睡得安稳'},{quality:'频繁醒来'}],cooldownKey:'sleep-morning' },
  { id:'sleep-nap',copyKey:'sleep-nap',category:'sleep',triggerType:'time',priority:38,timeWindow:{start:11,end:17},illustrationKey:'nap',mode:'nap',prefill:[{status:'ongoing',kind:'nap'},{status:'completed',kind:'nap'}],cooldownKey:'sleep-nap' },
  { id:'sleep-evening',copyKey:'sleep-evening',category:'sleep',triggerType:'time',priority:40,timeWindow:{start:17,end:24},illustrationKey:'bedtime',mode:'start',prefill:[{status:'ongoing'},{status:'backfill'}],cooldownKey:'sleep-evening' },
  { id:'breakfast',copyKey:'breakfast',category:'diet',triggerType:'time',priority:35,timeWindow:{start:6,end:10},illustrationKey:'breakfast',mode:'backfill',prefill:[{kind:'meal',meal:'早餐',appetite:'和平时差不多'},{kind:'meal',meal:'早餐',appetite:'比平时少'}],cooldownKey:'breakfast' },
  { id:'new-food',copyKey:'new-food',category:'diet',triggerType:'time',priority:34,timeWindow:{start:10,end:14},illustrationKey:'new-food',mode:'backfill',prefill:[{kind:'complementary',firstTry:'true'},{kind:'meal'}],cooldownKey:'new-food' },
  { id:'dinner',copyKey:'dinner',category:'diet',triggerType:'time',priority:36,timeWindow:{start:17,end:21},illustrationKey:'dinner',mode:'backfill',prefill:[{kind:'meal',meal:'晚餐',appetite:'和平时差不多'},{kind:'meal',meal:'晚餐',appetite:'比平时少'}],cooldownKey:'dinner' },
  { id:'hydration',copyKey:'hydration',category:'diet',triggerType:'record-gap',priority:10,illustrationKey:'hydration',mode:'backfill',prefill:[{kind:'snack',item:'水'},{kind:'snack'}],cooldownKey:'hydration' },
  { id:'bowel-morning',copyKey:'bowel-morning',category:'elimination',triggerType:'time',priority:32,timeWindow:{start:7,end:12},illustrationKey:'potty',mode:'backfill',prefill:[{occurred:'true'},{occurred:'false'}],cooldownKey:'bowel-morning' },
  { id:'bowel-evening',copyKey:'bowel-evening',category:'elimination',triggerType:'time',priority:32,timeWindow:{start:17,end:22},illustrationKey:'bowel-review',mode:'backfill',prefill:[{observation:'usual'},{observation:'different'}],cooldownKey:'bowel-evening' },
  { id:'outdoor',copyKey:'outdoor',category:'activity',triggerType:'time',priority:31,timeWindow:{start:9,end:18},illustrationKey:'outdoor',mode:'backfill',prefill:[{wentOutside:'true'},{wentOutside:'false'}],cooldownKey:'outdoor' },
  { id:'activity-followup',copyKey:'activity-followup',category:'symptom',triggerType:'event',priority:82,prerequisite:{recordType:'activity',minDelayMinutes:60,maxDelayMinutes:180},illustrationKey:'activity-check',mode:'backfill',prefill:[{trend:'same'},{trend:'more_noticeable'}],cooldownKey:'activity-followup' },
  { id:'body-change',copyKey:'body-change',category:'symptom',triggerType:'record-gap',priority:12,illustrationKey:'body-change',mode:'backfill',prefill:[{hasChange:'false'},{hasChange:'true'}],cooldownKey:'body-change' },
  { id:'symptom-followup',copyKey:'symptom-followup',category:'symptom',triggerType:'event',priority:95,prerequisite:{recordType:'symptom',minDelayMinutes:120,maxDelayMinutes:240},illustrationKey:'symptom-trend',mode:'backfill',prefill:[{trend:'improving'},{trend:'same'}],cooldownKey:'symptom-followup' },
  { id:'food-followup',copyKey:'food-followup',category:'symptom',triggerType:'event',priority:92,prerequisite:{recordType:'diet',minDelayMinutes:30,maxDelayMinutes:240,predicate:'new-food'},illustrationKey:'food-reaction',mode:'backfill',prefill:[{reaction:'none'},{reaction:'present'}],cooldownKey:'food-followup' },
  { id:'contact-followup',copyKey:'contact-followup',category:'symptom',triggerType:'event',priority:90,prerequisite:{recordType:'environment',minDelayMinutes:30,maxDelayMinutes:240,predicate:'contact'},illustrationKey:'contact-reaction',mode:'backfill',prefill:[{reaction:'none'},{reaction:'present'}],cooldownKey:'contact-followup' },
  { id:'medication-followup',copyKey:'medication-followup',category:'medication',triggerType:'event',priority:96,prerequisite:{recordType:'medication',minDelayMinutes:30,maxDelayMinutes:240},illustrationKey:'medicine',mode:'backfill',prefill:[{observationAfterUse:'some_relief'},{observationAfterUse:'no_obvious_change'}],cooldownKey:'medication-followup' },
  { id:'care-followup',copyKey:'care-followup',category:'care',triggerType:'event',priority:88,prerequisite:{recordType:'care',minDelayMinutes:30,maxDelayMinutes:240},illustrationKey:'care',mode:'backfill',prefill:[{outcome:'better'},{outcome:'unclear'}],cooldownKey:'care-followup' },
  { id:'injury',copyKey:'injury',category:'injury',triggerType:'event',priority:100,prerequisite:{recordType:'injury',minDelayMinutes:0,maxDelayMinutes:1440},illustrationKey:'injury',mode:'backfill',prefill:[{severity:'minor'},{severity:'attention'}],cooldownKey:'injury' },
  { id:'vaccination-followup',copyKey:'vaccination-followup',category:'symptom',triggerType:'event',priority:98,prerequisite:{recordType:'vaccination',minDelayMinutes:0,maxDelayMinutes:1440},illustrationKey:'vaccine',mode:'backfill',prefill:[{reaction:'none'},{reaction:'present'}],cooldownKey:'vaccination-followup' },
  { id:'visit-followup',copyKey:'visit-followup',category:'visit',triggerType:'event',priority:86,prerequisite:{recordType:'visit',minDelayMinutes:0,maxDelayMinutes:1440,predicate:'incomplete-visit'},illustrationKey:'visit',mode:'backfill',prefill:[{visitAction:'record'},{visitAction:'upload'}],cooldownKey:'visit-followup' }
] as const
