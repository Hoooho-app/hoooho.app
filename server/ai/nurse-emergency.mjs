// This is a veto/provenance gate on the model's semantic assessment, not a diagnosis
// or an exhaustive keyword triage. It cannot promote a quoted denial into danger.
export function confirmedCurrentEmergency(assessment, latestUser) {
  if (assessment?.currentChild !== true || typeof assessment.quote !== 'string' || !assessment.quote.trim() || !latestUser?.text?.includes(assessment.quote)) return false
  const quote = assessment.quote.trim()
  if (/(?:没(?:有)?|未|不|无)(?:出现|发生|见到|发现|明显|再|任何|一点)?(?:呼吸困难|喘|发紫|发绀|意识异常|叫不醒|反应异常)|(?:呼吸|意识|反应)(?:正常|没有异常|还好)|担心|害怕|会不会|如果|假如|万一/.test(quote)) return false
  if (/昨天|前天|上周|以前|曾经|已经(?:缓解|好了|恢复)|妈妈|爸爸|邻居|朋友家的/.test(quote) && !/现在|此刻|刚刚|又|再次/.test(quote)) return false
  return true
}
