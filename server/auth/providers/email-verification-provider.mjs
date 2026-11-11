export class EmailProviderError extends Error {
  constructor(message, code = 'EMAIL_SEND_FAILED') {
    super(message)
    this.code = code
  }
}

const cardsVerificationTitles = new Map([
  ['login', '电子证件登录'],
  ['bind', '电子证件绑定联系方式'],
  ['verify-current', '电子证件核验原有联系方式'],
  ['delete', '注销电子证件账号']
])

export class ResendEmailVerificationProvider {
  constructor(options = {}) {
    this.apiKey = options.apiKey ?? ''
    this.from = options.from ?? ''
    this.fetch = options.fetch ?? globalThis.fetch
    this.timeoutMs = options.timeoutMs ?? 10_000
  }

  get available() { return Boolean(this.apiKey && this.from) }

  async sendVerificationCode({ email, code, expiresIn, purpose }) {
    if (!this.apiKey || !this.from) {
      throw new EmailProviderError('邮箱验证码服务尚未配置', 'EMAIL_PROVIDER_NOT_CONFIGURED')
    }

    const title = cardsVerificationTitles.get(purpose) ?? 'Hoooho 登录'
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: this.from,
          to: [email],
          subject: `${title}验证码`,
          text: `你的 ${title}验证码是：\n\n${code}\n\n验证码 ${Math.floor(expiresIn / 60)} 分钟内有效。\n如果不是你本人操作，可以忽略这封邮件。`
        }),
        signal: controller.signal
      })
      if (!response.ok) {
        const category = response.status === 429
          ? 'EMAIL_PROVIDER_RATE_LIMITED'
          : response.status >= 500
            ? 'EMAIL_PROVIDER_UNAVAILABLE'
            : 'EMAIL_PROVIDER_REJECTED'
        throw new EmailProviderError('邮件服务暂时不可用，请稍后重试', category)
      }
    } catch (error) {
      if (error instanceof EmailProviderError) throw error
      const category = error?.name === 'AbortError' ? 'EMAIL_PROVIDER_TIMEOUT' : 'EMAIL_PROVIDER_NETWORK_ERROR'
      throw new EmailProviderError('邮件服务暂时不可用，请稍后重试', category)
    } finally {
      clearTimeout(timer)
    }
  }
}
