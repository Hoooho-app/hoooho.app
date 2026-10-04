// Exact names and documented derivatives, not substring keyword matching.
const groups={
  milk:['牛奶','牛乳','生牛乳','乳','奶','乳及乳制品','乳制品','dairy products','milk','cream','奶油','乳清','乳清粉','脱盐乳清粉','乳清蛋白粉','whey','whey powder','casein','酪蛋白','酪蛋白酸钠','sodium caseinate','butter','黄油','cheese','奶酪','奶粉','milk powder','skimmed milk powder','dried whole milk','全脂奶粉','脱脂奶粉','脱脂乳粉','乳糖','lactose','乳蛋白','milk protein'],
  egg:['鸡蛋','蛋','egg','eggs','egg white','egg yolk','蛋清','蛋黄','全蛋粉','egg powder','ovalbumin','卵白蛋白'],
  soy:['大豆','黄豆','soy','soya','soybean','soybeans','soy flour','soy protein','soy lecithin','大豆卵磷脂','大豆蛋白','豆腐','tofu'],
  wheat:['小麦','wheat','wheat flour','小麦粉','小麦面粉','semolina','粗粒小麦粉','小麦蛋白','wheat protein','wheat gluten'],
  peanut:['花生','peanut','peanuts','groundnut','花生油','peanut oil'],
  nuts:['坚果','tree nuts','almond','almonds','杏仁','扁桃仁','cashew','腰果','walnut','核桃','hazelnut','榛子','pistachio','开心果','pecan','碧根果','macadamia','夏威夷果'],
  fish:['鱼类','fish','鱼','cod','鳕鱼','salmon','三文鱼','tuna','金枪鱼','anchovy','鳀鱼','鱼露','fish sauce'],
  shellfish:['甲壳类','crustaceans','shrimp','prawn','虾','crab','蟹','lobster','龙虾'],
  sesame:['芝麻','sesame','sesame seeds','tahini','芝麻酱'],
}
const clean=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').replace(/\s*\d+(?:\.\d+)?\s*%/g,'').replace(/[.。]$/,'').trim()
const aliases=new Map(Object.entries(groups).flatMap(([group,names])=>names.map(name=>[clean(name),group])))
const neutral=new Set(['water','水','饮用水','purified water','salt','食盐','盐','sugar','白砂糖','糖','citric acid','柠檬酸','xanthan gum','黄原胶','sodium bicarbonate','碳酸氢钠','baking soda','小苏打'])
const uncertainNames=/^(?:spices?|flavou?rs?|natural flavou?rs?|vegetable oil|hydroly[sz]ed vegetable protein|lecithin|modified starch|香料|香精|天然香料|植物油|水解植物蛋白|卵磷脂|变性淀粉)$/i
const negated=value=>/(?:\b(?:free[- ]from|without|no|may contain|traces of)\b|\b[a-z]+[- ]free\b|不含|无乳|无奶|无蛋|可能含|共线|同一.*生产)/i.test(value)
function namesFor(row){return [clean(row.original),clean(row.chinese)].filter(Boolean)}
function matching(row,records){
  if(negated(row.original)||negated(row.chinese))return []
  const names=namesFor(row),codes=names.map(name=>aliases.get(name)).filter(Boolean)
  return records.filter(record=>{const name=clean(record.name),code=aliases.get(name);return names.includes(name)||(codes.includes(code)&&(!['nuts','fish','shellfish'].includes(code)||['坚果','tree nuts','鱼类','fish','甲壳类','crustaceans'].includes(name)))})
}

// Deterministic flattening prevents the model from dropping uncommon ingredients.
// Parentheses with no separator remain source annotations, e.g. whey (milk).
export function flattenIngredients(text){
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
      let name='',children=[],level=0,open=0
      for(let i=0;i<part.length;i++){
        if('([（'.includes(part[i])){if(level===0)open=i;level++}
        else if(')]）'.includes(part[i])&&level){level--;if(level===0){const inner=part.slice(open+1,i).trim();if(/^(?:\d+(?:\.\d+)?\s*%|ARA|DHA|VITAMIN\s+[A-Z]\d*|PROCESSED WITH ALKALI)$/i.test(inner))name+=part.slice(open,i+1);else children.push(inner)}}
        else if(level===0)name+=part[i]
      }
      if(children.length&&name.trim()&&level===0){const index=result.length;result.push({original:name.trim(),parent});for(const child of children)parse(child,index)}
      else result.push({original:part,parent})
    }
  }
  parse(text)
  return result
}

export function checkLabel(label,records=[]){
  const food=records.filter(r=>r.category==='food'&&r.name&&['confirmed','suspected','investigating','excluded','tolerated'].includes(r.currentStatus)).flatMap(r=>[r,...(['confirmed','suspected','investigating'].includes(r.currentStatus)?(r.ingredientRelations??[]).filter(v=>v.name).map(v=>({...r,name:v.name,currentStatus:v.relation==='confirmed'?r.currentStatus:'investigating',ingredientRelations:[]})):[])])
  const profileAvailable=food.length>0
  const unhandled=food.some(r=>['confirmed','suspected','investigating'].includes(r.currentStatus)&&!aliases.has(clean(r.name)))
  function classify(row){
    const related=matching(row,food),known=related.find(r=>r.currentStatus==='confirmed'),suspected=related.find(r=>['suspected','investigating'].includes(r.currentStatus))
    // Reliable original evidence is sufficient even when the rest is incomplete.
    const explicitSource=!row.sourceUnknown||aliases.has(clean(row.original))
    if(row.reliable&&explicitSource&&known)return {...row,status:'known',reason:`与已记录${known.name}过敏匹配`}
    if(row.reliable&&explicitSource&&suspected)return {...row,status:'possible',reason:`已有${suspected.name}待排查记录，尚未确认`}
    const reliable=Boolean(row.reliable&&row.chinese)&&!negated(row.original)&&!negated(row.chinese)
    if(!reliable)return {...row,status:'pending',reason:'识别或翻译未可靠确认，请补拍'}
    if(row.sourceUnknown||uncertainNames.test(clean(row.original))||uncertainNames.test(clean(row.chinese)))return {...row,status:'pending',reason:'原料来源未明确'}
    if(!profileAvailable)return {...row,status:'pending',reason:'缺少可对照的过敏记录'}
    if(unhandled)return {...row,status:'pending',reason:'部分个人过敏对象尚无法可靠对照'}
    if(!label.complete)return {...row,status:'pending',reason:'标签未完整，暂不能排除遗漏'}
    if(!related.some(r=>['tolerated','excluded'].includes(r.currentStatus))&&!namesFor(row).some(n=>neutral.has(n)))return {...row,status:'pending',reason:'暂无明确摄入或耐受记录'}
    return {...row,status:'clear',reason:''}
  }
  const ingredients=label.ingredients.map(classify)
  const contains=[]
  for(const statement of label.contains){
    const normalized={...statement,sourceUnknown:false},related=matching(normalized,food)
    // An explicit Contains declaration is separate evidence, not invented recipe.
    if(!ingredients.some(i=>matching(i,related).length))contains.push({...classify(normalized),kind:'contains'})
  }
  const rows=[...ingredients,...contains]
  const advisory=label.advisory.map(row=>{
    // Multi-allergen warning sentences are evidence, never ingredient rows.
    const mentioned=[...aliases.keys()].filter(name=>[row.original,row.chinese].some(value=>{
      const text=clean(value),start=text.indexOf(name)
      return start>=0&&(/[^a-z]/.test(name)||(!/[a-z]/.test(text[start-1]??'')&&!/[a-z]/.test(text[start+name.length]??'')))
    }))
    const related=[...new Set(mentioned.flatMap(name=>matching({original:name,chinese:name},food)))]
    return {...row,status:row.reliable&&related.some(r=>['confirmed','suspected','investigating'].includes(r.currentStatus))?'possible':'pending',reason:related.length?'包装交叉接触提示与个人记录相关，不是明确加入的配料':'包装交叉接触提示，相关情况待确认'}
  })
  const conflictCount=ingredients.filter(i=>i.status==='known').length
  const pendingCount=ingredients.filter(i=>['pending','possible'].includes(i.status)).length
  const green=profileAvailable&&label.complete&&!unhandled&&rows.length>0&&rows.every(i=>i.status==='clear')&&!advisory.length
  const title=rows.some(i=>i.status==='known')?'发现需注意成分':!profileAvailable?'缺少可对照的过敏记录':!label.complete?'标签未读完整，请补拍':green?'未发现已知冲突':'部分成分仍待确认'
  return {ingredients,contains,advisory,conflictCount,pendingCount,complete:label.complete,profileAvailable,
    title,tone:rows.some(i=>i.status==='known')?'error':green?'success':'warning',
    counts:`已识别${ingredients.length}项 · ${conflictCount}项已知冲突 · ${pendingCount}项待确认`,
    scope:!label.complete?`本次未完整核对：${label.issues.join('；')||'需补拍完整配料表和包装过敏提示'}`:!profileAvailable?'已识别标签，缺少可对照的过敏记录':green?'本次识别完整，没有需确认的成分':'配料表与可见包装过敏提示已核对'}
}
