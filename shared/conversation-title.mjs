import { recordReading } from './front-desk-record-format.mjs'
import { clinicalAssertions, clinicalContext } from './clinical-evidence.mjs'

const generic = /^(?:你好|您好|谢谢|好的|好吧|好|嗯|哦|是的|没有|不是|不确定|不清楚|不知道|确定|什么|还什么|怎么|怎么样|怎么办|帮我|帮忙|看看|看一下|请问|问一下|记录|保存|整理|记录一下|对话记录|情况|这些|这个|那个|一个|一下|现在|今天|昨天|刚才|目前|还有|然后|就是|孩子|宝宝|我家|我的|有点|有些|已经|持续|开始|真的|可能|好像|还是|是否|能不能)$/u
const uncertainty = /不确定|不清楚|不知道(?:是|是不是)|是不是|会不会|疑似|怀疑|可能是|好像是/u
const strip = /^(?:我(?:家|觉得|发现|感觉|想问|想记录)?|孩子|宝宝|今天|昨天|刚才|然后|就是|那个|这个|请问|帮我(?:看看|记录|整理)?|我想记录一下|记录一下|发现|感觉|出现了?)+/u

/** Read-only labels, shared by the server history and retained device drafts.
 * Prefer the existing record's supported keywords. Unstructured fallbacks keep
 * source phrases and qualifiers; they never ask a model or rewrite a fact.
 */
export function conversationTitle({ recordText = '', texts = [], fallback = '对话记录', excludeNames = [] } = {}) {
  const reading = recordText.trim() ? recordReading(recordText) : null
  let source = (reading ? [reading.overview, ...reading.details.filter(s => s.title !== '原始资料').map(s => s.text)] : texts).filter(Boolean).join('\n').slice(-24000)
  for (const name of excludeNames) if (name) source = source.split(name).join(' ')
  if (!source.trim()) return { title: fallback, keywords: [] }
  const candidates = [], seen = new Set()
  const add = (word, contextSource = source, at = contextSource.indexOf(word)) => {
    word = word.trim().replace(/^[：:\s]+|[：:\s]+$/gu, '')
    if (/还没(?:量|测)|尚未(?:量|测)|未测|家长观察|当前精神|精神(?:尚可|好|正常)/u.test(word)) return
    if (!word || generic.test(word) || word.length > 18 || /^[\d\s]+$/u.test(word)) return
    const context = at >= 0 ? clinicalContext(contextSource, at, at + word.length) : null
    let label = word
    if (context?.polarity === 'negated' && !/^(?:不|无|未|没|否认)/u.test(word)) label = `无${word}`
    else if (context?.polarity === 'uncertain' && !uncertainty.test(word)) label = `${word}（待确认）`
    if (context?.temporality === 'historical') label += '（既往）'
    else if (context?.temporality === 'future') label += '（计划）'
    else if (context?.temporality === 'conditional') label += '（假设）'
    if (!seen.has(label)) { seen.add(label); candidates.push(label) }
  }
  // Existing assertion parsing supplies whole clinical phrases and preserves
  // their polarity; generic source phrases also cover nonclinical topics.
  for (const finding of clinicalAssertions(source)) add(finding.text, source, finding.start)
  if (reading) for (const word of reading.keywords) if (source.includes(word)) add(word)
  for (const original of source.split(/[，,。；;！!？?\n]|但是|不过|而是/u)) {
    const clause = original.replace(/^[^：:\n]{1,12}[：:]/u, '').trim()
    if (!clause || generic.test(clause)) continue
    const clean = clause.replace(strip, '').replace(/(?:不确定|不清楚|不知道|可能|好像)(?:是不是|是否|是)?/gu, '；')
    for (const word of clean.split(/；|还是|是不是|是否|有(?:一[个片颗]|个|点|些)?|(?:是|的|了)(?![\d])|还(?:有|什么)|(?:跟|以及|并且|和)/u)) {
      add(word.replace(/^(?:不|没)$/u, ''), clause)
    }
  }
  const selected = []
  for (const word of candidates) {
    if (selected.some(existing => existing.includes(word) || word.includes(existing))) continue
    if (selected.length && [...selected, word].join(' · ').length > 24) continue
    selected.push(word)
    if (selected.length === 2) break
  }
  if (selected.length && uncertainty.test(source) && !selected.some(word => /待确认|疑似|不确定/u.test(word))) selected.push('待确认')
  return { title: selected.join(' · ') || fallback, keywords: selected }
}
