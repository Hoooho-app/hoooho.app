const correctionPatterns = [
  /(?:把|将|请|帮我).{0,30}(?:改成|改为|修改|删除|删掉|撤销|取消记录)/u,
  /(?:这条|刚才那条|上一条).{0,16}(?:不要记录|删除|删掉|撤销|修改)/u,
  /(?:来源|来源类型|记录类型|标签|按钮|界面|页面|颜色).{0,20}(?:改|修改|不对|调整)/u,
  /(?:不是|不要)(?:用户记录|语音记录|文字记录)/u,
  /(?:用户记录|语音记录|文字记录).{0,12}(?:改成|改为|修改)/u
]

const irrelevantPatterns = [
  /你(?:听到|听见)了吗/u,
  /(?:随便)?测试(?:一下|语句)?/u,
  /听得到吗/u,
  /麦克风(?:好用|能用|测试)/u
]

const healthLanguagePattern = /(?:体温|发热|发烧|咳嗽|头痛|疼|痒|皮疹|出汗|呕吐|腹泻|不舒服|好转|加重|服用|吃了|用了|检查|就医|看医生|毫升|℃|度)/u

export function classifyHealthInputBeforeExtraction(rawInput) {
  const text = typeof rawInput === 'string' ? rawInput.trim() : ''
  if (correctionPatterns.some((pattern) => pattern.test(text))) return 'correction_or_command'
  if (irrelevantPatterns.some((pattern) => pattern.test(text))) return 'irrelevant_or_chat'
  return null
}

export function eligibleHealthFacts(healthAIOutput) {
  const facts = Array.isArray(healthAIOutput?.facts) ? healthAIOutput.facts : []
  return facts.filter((fact) => (
    fact
    && ['event_subject', 'family_member'].includes(fact.subject)
    && !['quoted_text', 'internet_information'].includes(fact.source)
    && !['future', 'conditional'].includes(fact.temporality)
    && fact.status !== 'not_applicable'
    && ['affirmed', 'uncertain'].includes(fact.polarity)
  ))
}

export function classifyExtractedHealthInput(rawInput, healthAIOutput) {
  const facts = eligibleHealthFacts(healthAIOutput)
  if (!facts.length) return healthLanguagePattern.test(String(rawInput ?? ''))
    ? 'uncertain_health_fact'
    : 'irrelevant_or_chat'
  return facts.every((fact) => fact.polarity === 'uncertain' || Number(fact.confidence) < 0.65)
    ? 'uncertain_health_fact'
    : 'health_fact'
}
