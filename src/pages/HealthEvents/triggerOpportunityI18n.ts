export type TriggerLocale = 'zh-CN' | 'en'

const copy = {
  'sleep-late': ['凌晨', '今晚入睡顺利吗？', '几点睡、哄了多久，现在记最准确', '已经睡着', '还在哄睡', '记下今晚入睡'],
  'sleep-morning': ['早晨', '昨晚睡得怎么样？', '几点睡、醒过几次，还记得就记一下', '睡得挺好', '夜里醒过', '补记昨晚睡眠'],
  'sleep-nap': ['午间', '今天午睡了吗？', '睡了多久、几点醒，顺手记下来', '正在午睡', '已经睡醒', '记下这次午睡'],
  'sleep-evening': ['晚间', '今晚准备几点睡？', '准备睡时点一下，醒来后再结束', '准备睡了', '还没睡意', '开始记录睡眠'],
  breakfast: ['早晨', '今天早上吃得怎么样？', '喝了多少、吃了什么，顺手记一下', '吃得挺好', '吃得不多', '记下早餐'],
  'new-food': ['中午', '今天尝试新食物了吗？', '第一次吃什么，有没有变化都值得记', '尝试了新的', '和平时一样', '记录喂养／饮食'],
  dinner: ['傍晚', '晚饭吃了些什么？', '正餐、零食和吃饭时间，都可以记', '吃得挺好', '没什么胃口', '记下晚餐'],
  hydration: ['记录空档', '刚刚喝水或吃零食了吗？', '不需要记得很完整，想到一点就记一点', '喝过水', '吃过零食', '记下这一次'],
  'bowel-morning': ['早晨', '今天排便了吗？', '形态、颜色和是否费力，记得就记一下', '已经排过', '还没有', '记录排便'],
  'bowel-evening': ['傍晚', '今天的排便情况还记得吗？', '次数和不舒服的情况，也可以补记', '和平时差不多', '有些不一样', '补记今天排便'],
  outdoor: ['白天', '今天出去活动了吗？', '去了哪里、活动多久，回来后顺手记', '出去玩了', '今天在家', '记录户外活动'],
  'activity-followup': ['活动记录后', '活动回来后有变化吗？', '咳嗽、皮肤发红或没有变化，都值得记', '没有变化', '有点不舒服', '记录身体变化'],
  'body-change': ['记录空档', '最近有新的身体变化吗？', '发热、咳嗽、皮肤变化，想到什么就记什么', '暂时没有', '有新情况', '记录身体变化'],
  'symptom-followup': ['症状记录后', '刚才的不舒服后来怎么样了？', '变轻、加重或没有变化，接着记录更完整', '好一些了', '没有好转', '继续记录'],
  'food-followup': ['新食物记录后', '吃过以后有出现变化吗？', '多久后出现、哪里不舒服，尽量一起记', '没有变化', '出现反应', '记录一次症状'],
  'contact-followup': ['接触记录后', '接触之后身体有变化吗？', '环境、动物和用品，都可能值得留意', '没有变化', '有些异常', '记录一次症状'],
  'medication-followup': ['用药记录后', '用药后感觉怎么样？', '有没有缓解或新的不舒服，可以接着记', '有所缓解', '没有变化', '记录用药后变化'],
  'care-followup': ['处理记录后', '刚才的处理有效吗？', '处理后的变化，记下来更清楚', '舒服一些', '效果不明显', '继续记录'],
  injury: ['发生后尽快', '刚刚有磕碰或受伤吗？', '受伤部位、时间和当时情况，先简单记下', '轻微磕碰', '需要留意', '记录意外受伤'],
  'vaccination-followup': ['接种后当天', '接种后有不舒服吗？', '体温、精神和局部变化，都可以记录', '暂时正常', '有些不舒服', '记录接种后反应'],
  'visit-followup': ['就医或检查后', '今天有新的就医资料吗？', '医生交代、检查结果和报告，一起收好', '记录就医', '上传报告', '补充就医记录']
} as const

const enCopy: Record<keyof typeof copy, readonly [string, string, string, string, string, string]> = {
  'sleep-late': ['Late night', 'Did bedtime go smoothly tonight?', 'Log when sleep started and how long settling took.', 'Already asleep', 'Still settling', "Log tonight's sleep"],
  'sleep-morning': ['Morning', "How was last night's sleep?", 'Log bedtime and night waking while it is fresh.', 'Slept well', 'Woke overnight', "Log last night's sleep"],
  'sleep-nap': ['Midday', 'Did they nap today?', 'Add how long they slept and when they woke.', 'Napping now', 'Already awake', 'Log this nap'],
  'sleep-evening': ['Evening', 'What time is bedtime tonight?', 'Start when they settle down, then stop after waking.', 'Ready for bed', 'Not sleepy yet', 'Start sleep log'],
  breakfast: ['Morning', 'How was breakfast today?', 'Log what they ate or drank and roughly how much.', 'Ate well', 'Ate a little', 'Log breakfast'],
  'new-food': ['Midday', 'Any new foods today?', 'First tastes and any changes are useful to remember.', 'Tried something new', 'Same as usual', 'Log feeding or food'],
  dinner: ['Evening', 'What was for dinner?', 'Meals, snacks and timing can all be recorded.', 'Ate well', 'Low appetite', 'Log dinner'],
  hydration: ['Record gap', 'Any water or snacks just now?', 'A small detail is enough; it does not need to be complete.', 'Had water', 'Had a snack', 'Log this'],
  'bowel-morning': ['Morning', 'A bowel movement today?', 'Add appearance, color and whether it was difficult.', 'Yes', 'Not yet', 'Log bowel movement'],
  'bowel-evening': ['Evening', "Remember today's bowel movements?", 'You can add the number and any discomfort.', 'Usual', 'Different', "Add today's record"],
  outdoor: ['Daytime', 'Any outdoor activity today?', 'Add where they went and how long they were active.', 'Went outside', 'Stayed home', 'Log outdoor activity'],
  'activity-followup': ['After activity', 'Any changes after being outside?', 'Cough, skin redness or no change can all be noted.', 'No change', 'Some discomfort', 'Log a body change'],
  'body-change': ['Record gap', 'Any new body changes?', 'Fever, cough or skin changes are worth noting.', 'None', 'Something new', 'Log a body change'],
  'symptom-followup': ['After a symptom', 'How is the discomfort now?', 'Continue with whether it improved, worsened or stayed.', 'Better', 'Not better', 'Add an update'],
  'food-followup': ['After a new food', 'Any changes after eating?', 'Add when and where a change appeared.', 'No change', 'A reaction', 'Log a symptom'],
  'contact-followup': ['After contact', 'Any body changes after contact?', 'Environment, animals and products may be worth noting.', 'No change', 'Something changed', 'Log a symptom'],
  'medication-followup': ['After medicine', 'How do they feel after the medicine?', 'Note any relief or new discomfort.', 'Better', 'No change', 'Log changes'],
  'care-followup': ['After care', 'Did the care help?', 'Record what changed after the treatment.', 'More comfortable', 'Little effect', 'Add an update'],
  injury: ['Soon after', 'Was there a bump or injury?', 'Start with where, when and what happened.', 'Minor bump', 'Needs attention', 'Log an injury'],
  'vaccination-followup': ['Vaccination day', 'Any discomfort after vaccination?', 'Temperature, energy and local changes can be recorded.', 'Doing well', 'Some discomfort', 'Log a reaction'],
  'visit-followup': ['After a visit', 'Any new visit information today?', 'Keep instructions, results and reports together.', 'Log visit', 'Upload report', 'Add visit details']
}

export type TriggerCopyKey = keyof typeof copy
export type TriggerCopy = { label: string; question: string; description: string; options: readonly [string, string]; action: string }

export function resolveTriggerLocale(language?: string): TriggerLocale {
  return (language ?? (typeof document === 'undefined' ? 'zh-CN' : document.documentElement.lang || navigator.language)).toLowerCase().startsWith('en') ? 'en' : 'zh-CN'
}

export function triggerCopy(key: TriggerCopyKey, locale: TriggerLocale): TriggerCopy {
  const [label, question, description, first, second, action] = locale === 'en' ? enCopy[key] : copy[key]
  return { label, question, description, options: [first, second], action }
}
