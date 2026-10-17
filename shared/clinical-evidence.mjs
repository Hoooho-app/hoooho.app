// Source-derived assertion scope shared by evidence validation and short titles.
// These ranges describe literal wording; they never diagnose or create facts.
const boundary = /[，,。；;！!？?\n]|但是|不过|只是|而是|可是|随后|然后|接着|但(?=[^丁])/gu
const conceptPattern = /呼吸困难|呼吸急促|呼吸不适|胸闷|喘息|喘鸣|鼻塞|流鼻涕|流涕|打喷嚏|咳嗽|咽痛|嗓子疼|喉咙痛|皮疹|红疹|红肿|发红|瘙痒|发痒|红屁股|抓挠|脱皮|水疱|斑块|湿疹|过敏|哮喘|恶心|呕吐|吐奶|吐了|腹泻|拉肚子|便秘|腹痛|肚子疼|肚子痛|头晕|头痛|头疼|发热|发烧|疼痛|肿胀|出血|乏力|不舒服|痒|吐(?!槽|字|气|露)/gu
const coordinatedPrefix=new RegExp(`(?:(?:${conceptPattern.source})[、和及也与\\s]*)+$`,'u')
const canonical = new Map([['红疹','皮疹'],['发痒','瘙痒'],['痒','瘙痒'],['发烧','发热'],['头疼','头痛'],['肚子疼','腹痛'],['肚子痛','腹痛']])
const historical = /小时候|几年前|[一二两三四五六七八九十\d]+年前|以前|从前|去年|上个月|上次|前几个月|前两天/gu
const subject = /妈妈|爸爸|母亲|父亲|姐姐|哥哥|弟弟|妹妹|爷爷|奶奶|外公|外婆|祖父|祖母|同事|朋友|配偶|孩子|宝宝|婴儿|患儿|本人/gu
const currentSubject = /^(?:孩子|宝宝|婴儿|患儿|本人)$/u
const suffixEnd = '(?=$|[\\s，。；、,.;!?！？（）()]|但是|但|且|而|并|后)'
const negativeSuffix = new RegExp('^\\s*((?:已经|已)?(?:被[^，。；、,.;!?！？\\s]{0,16})?排除(?:了)?|(?:并|尚|还)?未(?:曾|有)?(?:出现|发生)|(?:已经|已)?(?:没有|没|不再)(?:出现|发生)?(?:了)?)'+suffixEnd,'u')
const uncertainSuffix = new RegExp('^\\s*((?:尚|还)?未(?:被)?(?:确诊|证实|排除)|(?:尚|还)?(?:不能|无法)(?:完全)?(?:确定|确认|证实|排除)|(?:完全)?排除不了|待(?:确认|排查|排除))'+suffixEnd,'u')
const uncertainPrefix = /(?:不能|无法|不|尚不能|尚无法|还不能)(?:完全)?排除(?:有|出现|发生|为|是|明显|这次|本次|的|颈部|脸颊|面部|手臂|全身)*$|(?:怀疑|疑似|可能|不确定|尚未确认|待排查|未确诊|是不是|会不会)(?:有|出现|发生|为|是|明显|这次|本次|的|颈部|脸颊|面部|手臂|全身)*$/u
const doublePrefix = /(?:并不是|不是|并非|并未|没有)(?:明确)?(?:没有|否认|不伴)(?:出现|发生|明显|任何|的|有)*$/u
const negativePrefix = /(?:没有|未见|否认|并不是|不是|并非|未发生|未出现|不伴|并无|无|未|没|排除|不再|不)(?:出现|发生|发现|观察到|表现出|喝|吃|进食|摄入|服用|使用|用|涂抹|注射|接种|服|喂|做|明显|持续|任何|再|了|有|这次|本次|目前|现在|的|颈部|脸颊|面部|手臂|全身)*$/u
const expansion = /(?:并不是|不是|并非)(?:只有|只是|只|仅有|仅仅|仅|光有|光是|光|单单)(?:会|有|出现|发生)?$|没少(?:有|出现|发生)?$/u

export function evidenceClause(text, start, end = start) {
 let left=0,right=text.length
 for(const match of text.matchAll(boundary)){
  if(match.index+match[0].length<=start)left=match.index+match[0].length
  else if(match.index>=end){right=match.index;break}
 }
 return {start:left,end:right,text:text.slice(left,right)}
}

export function clinicalContext(text, start, end) {
 const clause=evidenceClause(text,start,end),before=text.slice(clause.start,start),after=text.slice(end,clause.end)
 const listing=coordinatedPrefix.exec(before),qualifierPrefix=listing?before.slice(0,listing.index):before
 let polarity='affirmed',qualifier=null,literal=false
 const set=(match,kind,side,retain=false)=>{
  if(!match)return false
  const a=side==='before'?clause.start+match.index:end+match.index
  const word=match[1]??match[0],offset=match[0].indexOf(word)
  qualifier={start:a+offset,end:a+offset+word.length,text:word};polarity=kind;literal=retain;return true
 }
 // Double negation and inability to exclude must be checked before “排除/没有”.
 const uncertainty=qualifierPrefix.match(uncertainPrefix),double=qualifierPrefix.match(doublePrefix)
 if(!set(double,double?.[0].includes('否认')?'uncertain':'affirmed','before',true)&&!set(uncertainty,'uncertain','before',Boolean(uncertainty?.[0].includes('排除')))&&!expansion.test(before))set(qualifierPrefix.match(negativePrefix),'negated','before')
 if(!qualifier&&!set(after.match(uncertainSuffix),'uncertain','after',true))set(after.match(negativeSuffix),'negated','after',true)
 if(listing)literal=false
 const family=[...before.matchAll(subject)].at(-1)
 const past=[...before.matchAll(historical)].at(-1)
 const conditional=/(?:如果|假如|假设|万一|以防|若是|若出现|若发生)/u.test(clause.text)
 const future=/(?:明天|后天|下周|将来|计划|准备|预约)/u.test(before)
 return {clause,polarity,qualifier,literal,subject:family&&!currentSubject.test(family[0])?'other':'current',temporality:conditional?'conditional':future?'future':past?'historical':'current',historicalTime:past?.[0]??null}
}

export function clinicalAssertions(text) {
 return [...text.matchAll(conceptPattern)].map(m=>({start:m.index,end:m.index+m[0].length,text:m[0],concept:canonical.get(m[0])??m[0],...clinicalContext(text,m.index,m.index+m[0].length)}))
}

export function literalBodyObservations(text) {
 const body=/(?:脸颊|面部|脸上|脸|颈部|脖子|手臂|胳膊|腿部|小腿|大腿|背部|腹部|肚子|臀部|屁股|全身)(?:上|有|出现|变得|变|泛|有点|有些|稍微|一点|一片|了|的|很|明显|又|开始){0,5}(?:发红|红肿|泛红|红(?!色|薯|枣|豆)|肿胀|瘙痒|发痒|疼痛)/gu
 return [...text.matchAll(body)].map(m=>({start:m.index,end:m.index+m[0].length,text:m[0],concept:/红/u.test(m[0])?(/肿/u.test(m[0])?'红肿':'发红'):/痒/u.test(m[0])?'瘙痒':/肿/u.test(m[0])?'肿胀':'疼痛',...clinicalContext(text,m.index,m.index+m[0].length)}))
}
