import { currentAIAccount } from '../ai/providers/call-control.mjs'

let meter = null
export const installUsageMeter = value => { meter = value }
export const activeUsageMeter = () => meter
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null

// Record only supplier receipts, never prompts, transcripts, credentials or URLs.
// Instrument the original json reader so streaming/body semantics are unchanged.
export function meteredFetch(transport, provider, model) {
  return async (...args) => {
    const ledger = meter, owner = currentAIAccount()
    let actualModel = model
    try { if (typeof args[1]?.body === 'string') actualModel = JSON.parse(args[1].body).model ?? model } catch { /* No request contents are retained. */ }
    const call = ledger?.begin(owner, provider, actualModel)
    let response
    try { response = await transport(...args) }
    catch (error) { ledger?.failed(call); throw error }
    if (!response.ok) { ledger?.failed(call); return response }
    const json = response.json.bind(response)
    let recorded = false
    response.json = async () => {
      const result = await json()
      if (!recorded) {
        recorded = true
        const usage = result?.usage
        ledger?.receipt(call, {
          inputTokens: number(usage?.input_tokens ?? usage?.prompt_tokens),
          outputTokens: number(usage?.output_tokens ?? usage?.completion_tokens),
          audioSeconds: number(usage?.seconds),
        })
      }
      return result
    }
    return response
  }
}
