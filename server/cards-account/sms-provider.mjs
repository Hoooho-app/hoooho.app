import { createHash, createHmac, randomUUID } from 'node:crypto'
import path from 'node:path'
import { JsonStore } from '../auth/storage/json-store.mjs'
import { AuthError } from '../auth/auth-service.mjs'

const host = 'dypnsapi.aliyuncs.com'
const algorithm = 'ACS3-HMAC-SHA256'
const sha256 = value => createHash('sha256').update(value).digest('hex')
const encode = value => encodeURIComponent(value).replace(/[!'()*]/g, letter => '%' + letter.charCodeAt(0).toString(16).toUpperCase())

export function createCardsSMSProvider(dataDirectory, env = process.env) {
  const accessKeyId = env.HOOOHO_CARDS_SMS_ACCESS_KEY_ID
  const accessKeySecret = env.HOOOHO_CARDS_SMS_ACCESS_KEY_SECRET
  const signName = env.HOOOHO_CARDS_SMS_SIGN_NAME
  const templateCode = env.HOOOHO_CARDS_SMS_TEMPLATE_CODE
  const dailyLimit = Number(env.HOOOHO_CARDS_SMS_DAILY_LIMIT || 100)
  if (!accessKeyId || !accessKeySecret || !signName || !templateCode || !Number.isSafeInteger(dailyLimit) || dailyLimit <= 0) return null
  return new CardsSMSProvider({ dataDirectory, accessKeyId, accessKeySecret, signName, templateCode, dailyLimit })
}

export class CardsSMSProvider {
  constructor({ dataDirectory, accessKeyId, accessKeySecret, signName, templateCode, dailyLimit, fetch = globalThis.fetch }) {
    this.accessKeyId = accessKeyId
    this.accessKeySecret = accessKeySecret
    this.signName = signName
    this.templateCode = templateCode
    this.dailyLimit = dailyLimit
    this.fetch = fetch
    this.usage = new JsonStore(path.join(dataDirectory, 'cards-sms-usage.json'), { day: '', sends: 0 })
  }

  async sendVerificationCode({ phone, code, expiresIn }, now = new Date()) {
    // Reserve a daily slot before attempting delivery, including uncertain
    // outcomes, so a network retry cannot bypass the paid-send ceiling.
    const day = now.toISOString().slice(0, 10)
    await this.usage.update(usage => {
      const sends = usage.day === day ? usage.sends : 0
      if (sends >= this.dailyLimit) {
        const nextDay = Date.parse(day + 'T00:00:00Z') + 86_400_000
        throw new AuthError('今天的短信发送额度已用完，请改用其他已绑定方式或明天再试',
          429, 'SMS_DAILY_LIMIT', { retryAfter: Math.ceil((nextDay - now.getTime()) / 1000) })
      }
      return { day, sends: sends + 1 }
    })

    const parameters = {
      CountryCode: '86',
      PhoneNumber: phone,
      SignName: this.signName,
      TemplateCode: this.templateCode,
      TemplateParam: JSON.stringify({ code, min: String(Math.ceil(expiresIn / 60)) }),
      ValidTime: String(expiresIn)
    }
    const query = Object.keys(parameters).sort().map(key => `${key}=${encode(parameters[key])}`).join('&')
    const headers = {
      host,
      'x-acs-action': 'SendSmsVerifyCode',
      'x-acs-content-sha256': sha256(''),
      'x-acs-date': now.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      'x-acs-signature-nonce': randomUUID(),
      'x-acs-version': '2017-05-25'
    }
    const names = Object.keys(headers).sort()
    const signedHeaders = names.join(';')
    const canonicalHeaders = names.map(key => `${key}:${headers[key]}\n`).join('')
    const request = ['POST', '/', query, canonicalHeaders, signedHeaders, headers['x-acs-content-sha256']].join('\n')
    const signature = createHmac('sha256', this.accessKeySecret).update(`${algorithm}\n${sha256(request)}`).digest('hex')
    const response = await this.fetch(`https://${host}/?${query}`, {
      method: 'POST',
      headers: {
        ...headers,
        Authorization: `${algorithm} Credential=${this.accessKeyId},SignedHeaders=${signedHeaders},Signature=${signature}`
      },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000)
    })
    const result = await response.json().catch(() => null)
    if (!response.ok || result?.Code !== 'OK' || result.Success !== true) throw new Error('SMS delivery rejected')
  }
}
