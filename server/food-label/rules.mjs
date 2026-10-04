import { additionalAllergens, possibleAssociations, evidenceSources, constituentMatching, exactIngredientSynonyms } from './knowledge.mjs'
// Exact names and documented derivatives, not substring keyword matching.
const groups={
  milk:['牛奶','牛乳','生牛乳','乳','奶','乳及乳制品','乳制品','dairy products','milk','cream','奶油','乳清','乳清粉','脱盐乳清粉','乳清蛋白粉','whey','whey powder','casein','酪蛋白','酪蛋白酸钠','sodium caseinate','butter','黄油','cheese','奶酪','奶粉','milk powder','skimmed milk powder','dried whole milk','全脂奶粉','脱脂奶粉','脱脂乳粉','乳糖','lactose','乳蛋白','milk protein'],
  egg:['鸡蛋','蛋','egg','eggs','egg white','egg yolk','蛋清','蛋黄','全蛋粉','egg powder','ovalbumin','卵白蛋白'],
  soy:['大豆','黄豆','soy','soya','soybean','soybeans','soy flour','soy protein','soy lecithin','soya lecithin','soy lecithins','soya lecithins','大豆卵磷脂','大豆蛋白','豆腐','tofu','soybean oil','soy oil','soya oil','大豆油'],
  wheat:['小麦','wheat','wheat flour','小麦粉','小麦面粉','semolina','粗粒小麦粉','小麦蛋白','wheat protein','wheat gluten'],
  peanut:['花生','peanut','peanuts','groundnut','花生油','peanut oil'],
  nuts:['坚果','tree nuts','almond','almonds','杏仁','扁桃仁','cashew','腰果','walnut','核桃','hazelnut','榛子','pistachio','开心果','pecan','碧根果','macadamia','夏威夷果'],
  fish:['鱼类','fish','鱼','cod','鳕鱼','salmon','三文鱼','tuna','金枪鱼','anchovy','鳀鱼','鱼露','fish sauce'],
  shellfish:['甲壳类','crustaceans','shrimp','prawn','虾','crab','蟹','lobster','龙虾'],
  sesame:['芝麻','sesame','sesame seeds','tahini','芝麻酱'],
  ...additionalAllergens,
}
const quantityPattern='[<>≤≥=~约不少于不低于至多至少]*\\s*\\d+(?:\\.\\d+)?\\s*(?:%|mg|kg|g|ml|l|°C|°F|℃|℉|克|千克|毫克|毫升)'
const quantityOnly=new RegExp('^'+quantityPattern+'$','i')
export const ingredientIdentity=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/(\d)['’′]/g,'$1′').replace(new RegExp('\\s*[（(]?'+quantityPattern+'[）)]?','gi'),'').replace(/\s+/g,' ').replace(/[.。]$/,'').trim()
const clean=ingredientIdentity
// Non-text circle/info glyphs at a word boundary are annotations, not part of
// a material's identity. Preserve raw OCR separately. Never strip characters
// inside words, numeric degree units, chemical primes or percentage notation.
const ingredientTypography=value=>value.replace(/([\p{L}\p{M}])\s*[°○◦ⓘ]+(?=\s*[,，、;；)\]）]|$)/gu,'$1')
const aliases=new Map(Object.entries(groups).flatMap(([group,names])=>names.map(name=>[clean(name),group])))
const substanceAliases=new Map(exactIngredientSynonyms.flatMap(entry=>entry.names.map(name=>[clean(name),entry])))
const specificAliases=[['almond','almonds','杏仁','扁桃仁'],['cashew','cashews','腰果'],['walnut','walnuts','核桃'],['hazelnut','hazelnuts','榛子'],['pistachio','pistachios','开心果'],['pecan','pecans','碧根果'],['macadamia','夏威夷果'],['cod','鳕鱼'],['salmon','三文鱼'],['tuna','金枪鱼'],['anchovy','鳀鱼'],['shrimp','prawn','虾'],['crab','蟹'],['lobster','龙虾'],['squid','鱿鱼'],['oyster','牡蛎'],['mussel','贻贝'],['scallop','扇贝'],['clam','蛤蜊']]
const species=new Map(specificAliases.flatMap((names,index)=>names.map(name=>[clean(name),index])))
for(const names of specificAliases){const group=names.map(n=>aliases.get(clean(n))).find(Boolean);if(group)for(const name of names)aliases.set(clean(name),group)}
const genericSpecies=new Set(['坚果','tree nuts','鱼类','fish','鱼','甲壳类','crustaceans','软体动物','molluscs','mollusks'])
// Lactose is a different substance; its absence does not negate declared milk.
// Reviewed source: evidenceSources.milkQualifier (NHS milk-allergy guidance).
for(const name of ['lactose-free milk','lactose free milk','无乳糖牛奶','无乳糖牛乳'])aliases.set(clean(name),'milk')
// Some printed Contains declarations omit punctuation, e.g. "WHEAT SOY".
// Split only if the entire declaration consists of exact dictionary names.
export function splitDeclaredAllergens(value){
  if(negated(value))return [value]
  const patterns=[...aliases.keys()].sort((a,b)=>b.length-a.length).map(name=>new RegExp('^'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/ /g,'\\s+')+'(?=$|[\\s,、;])','i'))
  let rest=value.trim();const result=[]
  while(rest){const match=patterns.map(pattern=>pattern.exec(rest)).find(Boolean);if(!match)return [value];result.push(match[0]);rest=rest.slice(match[0].length).replace(/^[\s,、;]+/,'')}
  return result.length>1?result:[value]
}
const negated=value=>/(?:\b(?:free[- ]from|without|no|may contain|traces of)\b|\b[a-z]+[- ]free\b|不含|无乳|无奶|无蛋|可能含|共线|同一.*生产)/i.test(value)
function namesFor(row){return [clean(row.name??flattenIngredients(row.original)[0]?.name??row.original)].filter(Boolean)}
function matching(row,records){
  const names=namesFor(row),codes=names.map(name=>aliases.get(name)).filter(Boolean)
  if(names.some(name=>negated(name)&&!aliases.has(name)))return []
  return records.filter(record=>{
    const name=clean(record.name),code=aliases.get(name)
    if(names.includes(name))return true
    const substance=substanceAliases.get(name)
    if(substance&&names.some(n=>substanceAliases.get(n)===substance))return true
    if(!code||!codes.includes(code))return false
    const constituent=constituentMatching[code]
    if(constituent){
      if(constituent.generic.some(n=>clean(n)===name))return true
      const equivalent=constituent.components.find(group=>group.some(n=>clean(n)===name))
      return Boolean(equivalent&&names.some(n=>equivalent.some(alias=>clean(alias)===n)||constituent.whole.some(alias=>clean(alias)===n)))
    }
    return !['nuts','fish','shellfish','molluscs'].includes(code)||genericSpecies.has(name)||species.has(name)&&names.some(n=>species.get(n)===species.get(name))
  })
}

// Deterministic flattening prevents the model from dropping uncommon ingredients.
// Parentheses with no separator remain source annotations, e.g. whey (milk).
export function flattenIngredients(text){
  // Printed wrapping carries no list semantics. Explicit bullets/ordinals do.
  text=text.replace(/\r?\n(?=\s*(?:\d+[.)、]|[①-⑳•]))/g,', ').replace(/\r?\n/g,' ').replace(/([\p{Script=Han}])\s+(?=[\p{Script=Han}])/gu,'$1').replace(/(\d)\s+(?=[′’'])/g,'$1')
  const result=[]
  function parse(value,parent=null){
    let start=0,depth=0
    const parts=[]
    for(let i=0;i<value.length;i++){
      if('([（'.includes(value[i]))depth++
      if(')]）'.includes(value[i]))depth=Math.max(0,depth-1)
      if(depth===0&&',;，；、\n'.includes(value[i])){parts.push(value.slice(start,i));start=i+1}
    }
    parts.push(value.slice(start))
    for(let part of parts){part=part.trim().replace(/[。.]$/,'').trim();if(!part)continue
      if(quantityOnly.test(part.normalize('NFKC'))){const previous=result.findLast(r=>r.parent===parent);if(previous){previous.original+=' '+part;previous.fullOriginal+=' '+part;previous.rawOriginal+=' '+part}continue}
      if(/^[\p{Number}\p{Punctuation}\p{Symbol}\s]+$/u.test(part.normalize('NFKC'))||/^(?:mg|kg|g|ml|l|克|千克|毫克|毫升)$/i.test(part))continue
      part=part.replace(/^(?:[\u2190-\u21ff\u27a0-\u27bf•·]+\s*|[①-⑳]\s*|\d+[.)、]\s*|\d+\s+(?=[^\d\s]))/u,'')
      let name='',children=[],level=0,open=0
      for(let i=0;i<part.length;i++){
        if('([（'.includes(part[i])){if(level===0)open=i;level++}
        else if(')]）'.includes(part[i])&&level){level--;if(level===0){const inner=part.slice(open+1,i).trim();if(quantityOnly.test(inner.normalize('NFKC'))||/^(?:ARA|DHA|VITAMIN\s+[A-Z]\d*|PROCESSED WITH ALKALI)$/i.test(inner))name+=part.slice(open,i+1);else children.push(inner)}}
        else if(level===0)name+=part[i]
      }
      const original=ingredientTypography(children.length&&name.trim()&&level===0?name.trim():part).trim()
      const index=result.length
      result.push({original,fullOriginal:ingredientTypography(part),rawOriginal:part,name:original.replace(parent===null?/^$/:/^(?:含(?:有)?|contains?\s+)/i,''),parent})
      if(children.length&&name.trim()&&level===0)for(const child of children)parse(child,index)
    }
  }
  parse(text)
  return result
}

// Label facts, reviewed ingredient knowledge and personal records remain
// separate evidence. Model translations never establish an allergen identity.
export function checkLabel(label,records=[]){
  const food=records.filter(r=>r.category==='food'&&r.name&&['confirmed','suspected','investigating'].includes(r.currentStatus)&&!/(?:intolerance|restriction|celiac|不耐受|乳糜泻|忌口)/i.test([r.conditionType,r.reactionType,r.name].filter(Boolean).join(' '))).flatMap(r=>[r,...(r.ingredientRelations??[]).filter(v=>v.name).map(v=>({...r,name:v.name,currentStatus:v.relation==='confirmed'?r.currentStatus:'investigating',ingredientRelations:[]}))])
  const hit=(row,record,status,kind,source)=>({status,ingredient:row.name??row.original,personalRecordId:record?.id??null,personalName:record?.name??null,personalStatus:record?.currentStatus??null,kind,source})
  const reasonFor=hits=>{
    if(hits.length&&hits.every(h=>h.status==='known')){
      const ingredients=[...new Set(hits.map(h=>h.ingredient))],records=[...new Set(hits.map(h=>h.personalName))]
      return {zh:`${ingredients.join('、')}匹配已记录的${records.join('、')}过敏。`,en:`${ingredients.join(', ')} match the recorded ${records.join(', ')} allergies.`}
    }
    const reasons=hits.map(h=>{
      const name=h.personalName,ingredient=h.ingredient
      if(h.kind==='suspected')return {zh:`${ingredient}与${name}疑似过敏记录相关，尚未确诊。`,en:`${ingredient} relates to a suspected ${name} allergy, not a confirmed diagnosis.`}
      if(h.kind==='unexpanded')return {zh:`${ingredient}配料未展开，需核实是否含${name}。`,en:`${ingredient} has no listed sub-ingredients; whether it contains ${name} is unknown.`}
      if(h.kind==='source')return {zh:`${ingredient}未注明具体原料，需核实是否来自${name}。`,en:`The source of ${ingredient} is not specified; whether it derives from ${name} is unknown.`}
      if(h.kind==='cross-contact')return {zh:`包装提示可能接触${name}，并非确定加入的配料。`,en:`The label warns of possible contact with ${name}, not a declared ingredient.`}
      if(h.kind==='processing')return {zh:`${ingredient}来自${name}，但精炼方式及过敏蛋白残留未注明。`,en:`${ingredient} derives from ${name}, but its refining process and residual allergenic protein are not specified.`}
      if(h.kind==='protein')return {zh:`${ingredient}属于${name}来源的原料，但包装未说明是否仍含${name}蛋白。`,en:`${ingredient} is derived from ${name}, but the label does not establish whether its protein remains.`}
      return {zh:`${ingredient}匹配已记录的${name}过敏。`,en:`${ingredient} matches the recorded ${name} allergy.`}
    })
    return {zh:[...new Set(reasons.map(r=>r.zh))].join(' '),en:[...new Set(reasons.map(r=>r.en))].join(' ')}
  }
  const contactHits=row=>{
    if(!row.reliable)return []
    // Parse the stated materials, not substring-match milk inside coconut milk
    // or milk-free chocolate. Printed cross-contact grammar is distinct from
    // affirmative ingredient facts and model translations are not evidence.
    const marker=/(?:\b(?:may|might) contain\b|可能含(?:有)?|\b(?:processes|handles)\b|加工)\s*[:：]?\s*([\s\S]+)/i.exec(row.original)
    const shared=/与(.+?)(?:共线生产|同一生产线)/.exec(row.original)
    if(!marker&&!shared)return []
    const value=(marker?.[1]??shared?.[1]??'').replace(/\band\s*\/\s*or\b|\band\b|\bor\b|以及|和|及|或/gi,',').replace(/^(?:traces? of|微量的?)\s*/i,'')
    const related=[...new Set(flattenIngredients(value).flatMap(r=>matching(r,food)))]
    return related.map(record=>hit(row,record,'possible','cross-contact',evidenceSources.fda))
  }
  const classify=(row,hasChildren=false)=>{
    const name=row.name??flattenIngredients(row.original)[0]?.name??row.original,base={...row,name,status:'clear',reason:'',reasonTranslations:{zh:'',en:''},hits:[]}
    if(!row.reliable)return base
    if(/(?:\b(?:may|might) contain\b|可能含(?:有)?|共线生产|同一.*生产)/i.test(name)){
      const hits=contactHits(row),reasonTranslations=reasonFor(hits)
      return {...base,factKind:'cross-contact',status:hits.length?'possible':'clear',hits,reason:reasonTranslations.zh,reasonTranslations}
    }
    if(negated(name)&&!aliases.has(clean(name)))return base
    const related=matching({...row,name},food)
    const uncertainOil=['peanut oil','花生油','soybean oil','soy oil','soya oil','大豆油'].includes(clean(name))
    const uncertainProtein=['lactose','乳糖'].includes(clean(name))
    const declared=record=>(label.contains??[]).some(c=>c.reliable&&matching(c,[record]).length)
    const direct=related.map(record=>{
      const processing=(uncertainOil||uncertainProtein)&&clean(record.name)!==clean(name)&&!declared(record)
      return hit(base,record,record.currentStatus==='confirmed'&&!processing?'known':'possible',processing?(uncertainProtein?'protein':'processing'):record.currentStatus==='confirmed'?'explicit':'suspected',aliases.has(clean(name))?evidenceSources.derivatives:substanceAliases.get(clean(name))?.source??'exact-personal-record')
    })
    const candidates=possibleAssociations.filter(k=>k.names.some(n=>clean(n)===clean(name))&&(k.kind!=='unexpanded'||!hasChildren)).flatMap(k=>food.filter(r=>k.allergens.includes(aliases.get(clean(r.name)))||(k.personalNames??[]).some(n=>clean(n)===clean(r.name))).map(r=>hit(base,r,'possible',k.kind,k.source)))
    const hits=[...direct,...candidates]
    const definition=aliases.get(clean(name)),declaredSource=definition&&declared({name:groups[definition][0]})
    const status=hits.some(h=>h.status==='known')?'known':hits.some(h=>h.status==='possible')?'possible':definition&&(!(uncertainOil||uncertainProtein)||declaredSource)?'common':'clear'
    if(status==='common')hits.push(hit(base,null,'common','declared-allergen',additionalAllergens[aliases.get(clean(name))]?evidenceSources.fsa:evidenceSources.fda))
    const reasonTranslations=status==='possible'?reasonFor(hits.filter(h=>h.status==='possible')):{zh:'',en:''}
    return {...base,status,hits,reason:reasonTranslations.zh,reasonTranslations}
  }
  const sourceRows=label.ingredients??[]
  const ingredients=sourceRows.map((row,index)=>classify(row,sourceRows.some(child=>child.parent===index&&!/(?:\b(?:may|might) contain\b|可能含(?:有)?|共线生产)/i.test(child.name??child.original))))
  function tree(index){
    const row=ingredients[index],children=ingredients.flatMap((child,i)=>child.parent===index?[tree(i)]:[])
    const hits=[...row.hits,...children.flatMap(c=>c.hits)]
    const status=hits.some(h=>h.status==='known')?'known':hits.some(h=>h.status==='possible')?'possible':hits.some(h=>h.status==='common')?'common':'clear'
    const principal=hits.filter(h=>h.status===status)
    const reasonTranslations=status==='possible'||status==='known'&&principal.some(h=>h.ingredient!==row.name)?reasonFor(principal):{zh:'',en:''}
    return {...row,original:row.fullOriginal??row.original,children,hits,status,reason:reasonTranslations.zh,reasonTranslations}
  }
  const displayIngredients=ingredients.flatMap((row,index)=>row.parent==null?[tree(index)]:[])
  const contains=(label.contains??[]).filter(r=>!negated(r.original)&&!ingredients.some(i=>matching(i,matching(r,food)).length)).map(r=>({...classify(r),kind:'contains'}))
  const advisory=(label.advisory??[]).map(row=>{
    const hits=contactHits(row)
    const reasonTranslations=reasonFor(hits)
    return {...row,status:hits.length?'possible':'clear',hits,reason:reasonTranslations.zh,reasonTranslations}
  })
  const conflictCount=displayIngredients.filter(r=>r.status==='known').length
  return {ingredients,displayIngredients,contains,advisory,conflictCount,assessmentComplete:true,complete:label.complete,profileAvailable:food.length>0,title:'',tone:'neutral',counts:`已识别${displayIngredients.length}项 · ${conflictCount}项已知冲突`,scope:'',pendingCount:0}
}
