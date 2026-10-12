const dietFields=new Set(['food','amount','unit'])
const sleepFields=new Set(['sleepAt','wakeAt','sleepKind','quality','durationMinutes'])
const duration=/^(?:(?:午睡|睡)(?:了)?\s*|slept\s+(?:for\s+)?)?(?:\d+(?:\.\d+)?|half|one|two|three|[零一二三四五六七八九十百两半]+)(?:个)?\s*(?:小时|分钟|hours?|minutes?)$/i

/** Reconcile metadata only. Never rewrite a quoted value or compute duration. */
export function reconcileFrontDeskFields(item){
 if(item.category==='symptom'&&item.categoryEditedBy!=='user'&&item.fields.length){
   const category=item.fields.every(f=>dietFields.has(f.name))&&item.fields.some(f=>f.name==='food')?'diet':item.fields.every(f=>sleepFields.has(f.name))?'sleep':null
   if(category){item.categoryResolution={original:item.category,source:'front_desk_field_contract'};item.category=category}
 }
 if(item.category==='sleep')item.fields=item.fields.map(f=>f.editedBy!=='user'&&['sleepAt','wakeAt'].includes(f.name)&&duration.test(f.value.trim())?{...f,name:'durationMinutes',nameResolution:{original:f.name,source:'duration_phrase'}}:f)
 return item
}
