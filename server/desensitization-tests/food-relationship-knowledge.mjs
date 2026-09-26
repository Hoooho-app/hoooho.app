export const FOOD_KNOWLEDGE_VERSION = 'hoooho-food-relations-2026-09-26-v2'

const sources = [
  { id:'source:wheat', label:'小麦', categoryLabel:'小麦来源', aliases:['小麦','小麦粉'], components:[['component:gluten','麸质相关蛋白'],['component:wheat-other','其他相关蛋白']], foods:[['馒头','confirmed'],['小麦面条','confirmed'],['面条','pending'],['面包','pending'],['蛋糕','pending']] },
  { id:'source:barley', label:'大麦', categoryLabel:'大麦来源', aliases:['大麦'], components:[['component:gluten','麸质相关蛋白']], foods:[['大麦粥','confirmed'],['麦芽制品','pending']] },
  { id:'source:rye', label:'黑麦', categoryLabel:'黑麦来源', aliases:['黑麦'], components:[['component:gluten','麸质相关蛋白']], foods:[['黑麦面包','pending']] },
  { id:'source:cow-milk', label:'牛乳', categoryLabel:'牛乳来源', aliases:['牛乳','牛奶','纯牛奶','全脂牛奶'], components:[['component:cow-milk-casein','牛乳酪蛋白'],['component:cow-milk-whey','乳清相关蛋白']], foods:[['酸奶','confirmed'],['奶酪','confirmed'],['乳粉','confirmed'],['面包','pending'],['奶油蛋糕','pending']] },
  { id:'source:egg', label:'鸡蛋', categoryLabel:'鸡蛋来源', aliases:['鸡蛋','蛋黄','蛋白','鸡蛋黄','鸡蛋白'], components:[['component:egg-white','蛋清相关蛋白'],['component:egg-yolk','蛋黄相关蛋白']], foods:[['蛋羹','confirmed'],['蛋糕','pending'],['面包','pending']] },
  { id:'source:beef', label:'牛肉', categoryLabel:'牛肉来源', aliases:['牛肉','牛肉泥','炖牛肉'], components:[], foods:[['纯牛肉泥','confirmed'],['清蒸牛肉','confirmed'],['牛肉丸','pending'],['牛肉饼','pending'],['牛肉肠','pending']] },
  { id:'source:peanut', label:'花生', categoryLabel:'花生来源', aliases:['花生','花生酱'], components:[], foods:[['花生酱','confirmed'],['混合坚果','pending']] },
  { id:'source:soy', label:'大豆', categoryLabel:'大豆来源', aliases:['大豆','黄豆'], components:[], foods:[['豆浆','confirmed'],['豆腐','confirmed'],['酱料','pending']] }
]

const components = [
  { id:'component:gluten', label:'麸质', aliases:['麸质'], sourceIds:['source:wheat','source:barley','source:rye'], description:'跨越小麦、大麦和黑麦等来源，来源身份仍分别保留。' },
  { id:'component:cow-milk-casein', label:'牛乳酪蛋白', aliases:['牛乳酪蛋白'], sourceIds:['source:cow-milk'], description:'牛乳来源中的成分关注，不等同于其他乳源，也不构成诊断。' },
  { id:'component:cow-milk-whey', label:'乳清相关蛋白', aliases:['牛乳清蛋白','乳清蛋白'], sourceIds:['source:cow-milk'], description:'具体食品是否适用仍依赖配料或医疗依据。' },
  { id:'component:wheat-other', label:'其他小麦相关蛋白', aliases:['小麦其他蛋白'], sourceIds:['source:wheat'], description:'包括经审核的其他小麦相关蛋白分组，不以麸质代表全部小麦蛋白。' },
  { id:'component:egg-white', label:'蛋清相关蛋白', aliases:['蛋清蛋白'], sourceIds:['source:egg'], description:'保留蛋清与蛋黄部位差异。' },
  { id:'component:egg-yolk', label:'蛋黄相关蛋白', aliases:['蛋黄蛋白'], sourceIds:['source:egg'], description:'保留蛋清与蛋黄部位差异。' }
]

const foods = [
  { id:'food:bread', label:'面包', aliases:['面包'], relations:[['source:wheat','pending'],['source:cow-milk','pending'],['source:egg','pending']], note:'配料依品牌和配方变化，需要核对实际配料。' },
  { id:'food:steamed-bun', label:'馒头', aliases:['馒头'], relations:[['source:wheat','confirmed']], note:'标准小麦馒头可作为明确小麦来源；不同配方仍以实际记录为准。' },
  { id:'food:wheat-noodle', label:'小麦面条', aliases:['小麦面条'], relations:[['source:wheat','confirmed']], note:'名称已明确小麦来源。' },
  { id:'food:noodle', label:'面条', aliases:['面条'], relations:[['source:wheat','pending']], note:'需核对实际原料。' },
  { id:'food:beef-ball', label:'牛肉丸', aliases:['牛肉丸'], relations:[['source:beef','pending']], note:'加工食品需核对实际配料。' },
  { id:'food:yogurt', label:'酸奶', aliases:['酸奶'], relations:[['source:cow-milk','confirmed']], note:'保留具体配方与时间。' },
  { id:'food:cheese', label:'奶酪', aliases:['奶酪'], relations:[['source:cow-milk','confirmed']], note:'保留具体配方与时间。' },
  { id:'food:egg-cake', label:'蛋糕', aliases:['蛋糕'], relations:[['source:egg','pending'],['source:wheat','pending'],['source:cow-milk','pending']], note:'复合食品需要核对实际配料。' }
]

const ambiguity = {
  牛:[['source:beef','牛肉'],['source:cow-milk','牛乳']],
  麸:[['component:gluten','麸质'],['custom:麸皮','麸皮（按原名待核实）']],
  麦芽:[['custom:大麦麦芽','大麦麦芽'],['custom:小麦麦芽','小麦麦芽'],['custom:麦芽','按“麦芽”待核实']],
  酪蛋白:[['component:cow-milk-casein','牛乳中的酪蛋白'],['custom:酪蛋白','按“酪蛋白”待核实']]
}

export const normalizeFoodInput = (value) => String(value ?? '').trim().replace(/\s+/g,'').slice(0,30)
export const sourceById = (id) => sources.find((item)=>item.id===id) ?? null
export const componentById = (id) => components.find((item)=>item.id===id) ?? null
export const foodById = (id) => foods.find((item)=>item.id===id) ?? null

function customEntity(name, id=`custom:${name.toLocaleLowerCase('zh-CN')}`) {
  return { id, type:'unknown', label:name, categoryLabel:`${name}（待核实）`, confidence:'custom', sourceIds:[], relations:[], description:'知识关系尚未覆盖，保留原名并由个人记录继续核实。' }
}

export function resolveEntity(rawInput, focusId='') {
  const originalInput = normalizeFoodInput(rawInput)
  if (!originalInput) return { originalInput, entity:null, ambiguity:[], knowledgeVersion:FOOD_KNOWLEDGE_VERSION }
  const choices = (ambiguity[originalInput] ?? []).map(([id,label])=>({id,label}))
  if (focusId) {
    const focused = entityById(focusId, originalInput)
    if (focused) return { originalInput, entity:focused, ambiguity:choices, knowledgeVersion:FOOD_KNOWLEDGE_VERSION }
  }
  if (choices.length) return { originalInput, entity:customEntity(originalInput), ambiguity:choices, knowledgeVersion:FOOD_KNOWLEDGE_VERSION }
  const source = sources.find((item)=>item.aliases.includes(originalInput))
  if (source) return { originalInput, entity:sourceEntity(source), ambiguity:[], knowledgeVersion:FOOD_KNOWLEDGE_VERSION }
  const component = components.find((item)=>item.aliases.includes(originalInput))
  if (component) return { originalInput, entity:componentEntity(component), ambiguity:[], knowledgeVersion:FOOD_KNOWLEDGE_VERSION }
  const food = foods.find((item)=>item.aliases.includes(originalInput))
  if (food) return { originalInput, entity:foodEntity(food), ambiguity:[], knowledgeVersion:FOOD_KNOWLEDGE_VERSION }
  return { originalInput, entity:customEntity(originalInput), ambiguity:[], knowledgeVersion:FOOD_KNOWLEDGE_VERSION }
}

export function entityById(id, fallback='') {
  const source=sourceById(id); if(source)return sourceEntity(source)
  const component=componentById(id); if(component)return componentEntity(component)
  const food=foodById(id); if(food)return foodEntity(food)
  if(String(id).startsWith('custom:'))return customEntity(fallback || String(id).slice(7),id)
  return null
}

function sourceEntity(source) {
  return { id:source.id, type:'source', label:source.label, categoryLabel:source.categoryLabel, confidence:'confirmed', sourceIds:[source.id], description:'原料来源与相关食品、成分分别保留。', relations:[
    ...source.components.map(([id,label])=>({id,label,type:'component',relation:'contains',relationLabel:'相关成分',certainty:'known'})),
    ...source.foods.map(([label,certainty])=>({id:foods.find((item)=>item.label===label)?.id??`food:${label}`,label,type:'food',relation:'related_food',relationLabel:certainty==='confirmed'?'明确来源食品':'相关食品',certainty}))
  ] }
}

function componentEntity(component) {
  return { id:component.id, type:'component', label:component.label, categoryLabel:`${component.label}关注`, confidence:'confirmed', sourceIds:[...component.sourceIds], description:component.description, relations:component.sourceIds.flatMap((sourceId)=>{const source=sourceById(sourceId);return source?[{id:source.id,label:source.label,type:'source',relation:'source',relationLabel:'来源',certainty:'known'},...source.foods.slice(0,3).map(([label,certainty])=>({id:foods.find((item)=>item.label===label)?.id??`food:${label}`,label,type:'food',relation:'related_food',relationLabel:'相关食品',certainty}))]:[]}) }
}

function foodEntity(food) {
  return { id:food.id, type:'food', label:food.label, categoryLabel:`${food.label}观察`, confidence:'confirmed', sourceIds:food.relations.map(([sourceId])=>sourceId), description:food.note, relations:food.relations.flatMap(([sourceId,certainty])=>{const source=sourceById(sourceId);return source?[{id:source.id,label:source.label,type:'source',relation:certainty==='confirmed'?'contains':'possible',relationLabel:certainty==='confirmed'?'明确来源':'可能含有',certainty},...source.components.map(([id,label])=>({id,label,type:'component',relation:'component',relationLabel:'相关成分',certainty:certainty==='confirmed'?'known':'pending'}))]:[]}) }
}

export function legacyScope(task) {
  if(task.scope?.entityId)return entityById(task.scope.entityId,task.scope.label||task.displayName) ?? customEntity(task.displayName)
  const mapping={wheat:'source:wheat',cow_milk:'source:cow-milk',beef:'source:beef',egg:'source:egg',peanut:'source:peanut',soy:'source:soy'}
  return entityById(mapping[task.categoryKey],task.displayName) ?? customEntity(task.displayName,task.categoryKey?.startsWith('custom:')?task.categoryKey:`custom:${normalizeFoodInput(task.displayName)}`)
}

export function relationBetween(entity, task) {
  const target=legacyScope(task)
  if(entity.id===target.id)return {kind:'same',certainty:'known',reason:'观察范围完全相同'}
  if(entity.type==='food') {
    const relation=entity.relations.find((item)=>item.type==='source'&&item.id===target.id)
    if(relation)return {kind:relation.certainty==='confirmed'?'shared_source':'possible',certainty:relation.certainty,reason:relation.certainty==='confirmed'?'已有明确共同来源':'配料仍需核实'}
  }
  if(entity.type==='source'&&target.type==='food') {
    const relation=target.relations.find((item)=>item.type==='source'&&item.id===entity.id)
    if(relation)return {kind:relation.certainty==='confirmed'?'shared_source':'possible',certainty:relation.certainty,reason:relation.certainty==='confirmed'?'已有明确共同来源':'配料仍需核实'}
  }
  if(entity.type==='component'&&entity.sourceIds.includes(target.id))return {kind:entity.sourceIds.length===1?'component_focus':'partial_overlap',certainty:'known',reason:entity.sourceIds.length===1?'可在来源观察中加入成分关注':'只复用适用记录，保留来源差异'}
  if(entity.type==='source'&&target.type==='component'&&target.sourceIds.includes(entity.id))return {kind:'partial_overlap',certainty:'known',reason:'来源与成分范围部分重叠'}
  if(entity.type==='source'&&target.type==='source'&&entity.id===target.id)return {kind:'same',certainty:'known',reason:'观察范围完全相同'}
  return null
}

export function relationForFoodName(foodName, entity) {
  const normalized=normalizeFoodInput(foodName)
  if(!normalized||!entity)return null
  const directSource=sources.find((source)=>source.aliases.includes(normalized))
  const knownFood=foods.find((food)=>food.aliases.includes(normalized))
  if(entity.type==='source') {
    if(directSource?.id===entity.id)return 'confirmed'
    const relation=knownFood?.relations.find(([sourceId])=>sourceId===entity.id)
    const catalogRelation=sourceById(entity.id)?.foods.find(([label])=>normalizeFoodInput(label)===normalized)
    return relation?.[1] ?? catalogRelation?.[1] ?? null
  }
  if(entity.type==='food')return knownFood?.id===entity.id?'confirmed':null
  if(entity.type==='component') {
    if(components.find((item)=>item.id===entity.id)?.aliases.includes(normalized))return 'confirmed'
    const sourceIds=knownFood?.relations.filter(([,certainty])=>certainty==='confirmed').map(([id])=>id)??(directSource?[directSource.id]:[])
    return sourceIds.some((id)=>entity.sourceIds.includes(id))?'pending':null
  }
  return normalized===normalizeFoodInput(entity.label)?'confirmed':null
}

export function displayNameForEntity(entity) {
  return entity.type==='source'?`${entity.label}来源`:entity.label
}
