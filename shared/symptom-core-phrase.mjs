// Presentation only: original observations, time, severity and provenance remain intact.
const aliases = new Map([
  ['红疹', '皮疹'], ['发痒', '瘙痒'], ['痒', '瘙痒'], ['头疼', '头痛'],
  ['肚子疼', '腹痛'], ['肚子痛', '腹痛'], ['嗓子疼', '咽痛'], ['喉咙痛', '咽痛'],
  ['发烧', '发热'], ['吐了', '呕吐'], ['吐', '呕吐'], ['拉肚子', '腹泻'], ['红屁股', '臀部发红']
])
const terms = /呼吸困难|呼吸急促|呼吸不适|胸闷|喘息|喘鸣|鼻塞|流鼻涕|流涕|打喷嚏|咳嗽|咽痛|嗓子疼|喉咙痛|皮疹|红疹|红肿|发红|瘙痒|发痒|红屁股|抓挠|脱皮|水疱|斑块|湿疹|过敏|恶心|呕吐|吐奶|吐了|腹泻|拉肚子|便秘|腹痛|肚子疼|肚子痛|头晕|头痛|头疼|发热|发烧|疼痛|肿胀|出血|乏力|不舒服|痒|吐(?!槽|字|气|露)/gu
const locations = /左(?:眼|耳|手|脚|腿|臂)|右(?:眼|耳|手|脚|腿|臂)|颈部|脖子|脸颊|面部|脸上|臀部|屁股|腹部|肚子|胸部|背部|后背|头皮|手臂|腿部|膝盖|眼睛|眼部|耳朵|耳部|全身/gu
const locationAliases = new Map([['脖子','颈部'],['脸上','面部'],['屁股','臀部'],['肚子','腹部'],['后背','背部'],['眼睛','眼部'],['耳朵','耳部']])
const negative = /(?:没有|未见|未出现|未发现|否认|排除|不是|不伴|并无|无|不|没)(?:出现|发现|明显|持续|任何|再|了|有)*$/u
const uncertain = /(?:怀疑|疑似|可能|不确定|不清楚|是不是|会不会)/u
const filler = /(?:其实|就是|然后|我想记录一下|记录一下|早上起来的时候|今天|昨天|昨晚|夜间|晚上|白天|有点|一点点|轻微|非常|特别|很|更加|更|明显|严重|一直|反复|持续|开始|出现了|出现|有了|表现为|伴有|伴随|伴|这个|那个)/gu

/** Select supported symptom concepts, rather than cutting a sentence at an arbitrary character. */
export function symptomCorePhrase(value, { location = '' } = {}) {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return '症状记录'
  const segments = raw.split(/[，,。；;！!？?\n]|但是|不过|只是|但|而是/u).filter(Boolean)
  const observed = [], absent = [], usedBodies = new Set()
  for (const source of segments) {
    const segment = source.replace(/有点红|有些红/gu, '发红')
    let previousEnd = 0, negativeScope = false, uncertainScope = false
    const localLocation = [...segment.matchAll(locations)][0]?.[0] || [...location.matchAll(locations)][0]?.[0] || (location.length <= 6 ? location : '')
    const body = locationAliases.get(localLocation) || localLocation
    let bodyUsed = false
    for (const match of segment.matchAll(terms)) {
      const prefix = segment.slice(previousEnd, match.index).trim()
      previousEnd = match.index + match[0].length
      const term = aliases.get(match[0]) || match[0]
      // Negation is clause-local, and never spills over a contrast such as “只是”.
      if (negative.test(prefix.replace(/\s/g, ''))) negativeScope = true
      else if (prefix && !/^[、和及也与]*$/u.test(prefix)) negativeScope = false
      if (negativeScope) { absent.push(`无${term}`); continue }
      // A directly attached status is part of the observation, not a positive diagnosis.
      const suffix = /^\s*((?:(?:已(?:经)?(?:被|明确)?|被|明确)?排除|尚未确诊|未确诊|未(?:被)?证实|未出现|待确认|待排(?:查|除)))(?=$|[，。；、,.;!?！？\s（）()]|但是|但|且|而|并|后|了)/u.exec(segment.slice(previousEnd))?.[1]
      if (suffix) {
        const phrase = `${term}${suffix}`
        if (/排除$|未出现$/u.test(suffix)) absent.push(phrase)
        else observed.push(phrase)
        continue
      }
      if (uncertain.test(prefix)) uncertainScope = true
      else if (prefix && !/^[、和及也与]*$/u.test(prefix)) uncertainScope = false
      const qualifier = uncertainScope ? '疑似' : ''
      const bodyPrefix = body && !bodyUsed && !usedBodies.has(body) && !term.startsWith(body) && !/^(?:头|腹|咽|臀)/u.test(term) ? body : ''
      observed.push(`${qualifier}${bodyPrefix}${term}`)
      if (bodyPrefix) { bodyUsed = true; usedBodies.add(body) }
    }
  }
  const concepts = [...new Set(observed.length ? observed : absent)]
  if (concepts.length) {
    // Prefer whole concepts. Remaining details are available in the original record.
    const selected = []
    for (const concept of concepts) {
      if (selected.length && [...selected, concept].join('、').length > 18) break
      selected.push(concept)
      if (selected.length === 3) break
    }
    return selected.join('、')
  }
  // Unknown terms stay source-derived; do not invent a diagnosis to fill a title.
  const phrase = segments[0]?.replace(filler, '').replace(/[：:“”"'（）()]/gu, '').replace(/\s+/gu, '').trim()
  return phrase && phrase.length <= 18 ? phrase : '症状记录'
}

export function symptomItemCorePhrase(item) {
  const symptoms = item.fields?.filter(field => ['symptom', 'reaction'].includes(field.name)).map(field => field.value).join('、') || item.title || ''
  return symptomCorePhrase(symptoms, { location: item.fields?.find(field => field.name === 'location')?.value || '' })
}
