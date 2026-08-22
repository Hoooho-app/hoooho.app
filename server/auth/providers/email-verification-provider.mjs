export class EmailProviderError extends Error {
  constructor(message, code = 'EMAIL_SEND_FAILED') {
    super(message)
    this.code = code
  }
}

export class ResendEmailVerificationProvider {
  constructor(options = {}) {
    this.apiKey = options.apiKey ?? ''
    this.from = options.from ?? ''
    this.fetch = options.fetch ?? globalThis.fetch
    this.timeoutMs = options.timeoutMs ?? 10_000
  }

  async sendVerificationCode({ email, code, expiresIn }) {
    if (!this.apiKey || !this.from) {
      throw new EmailProviderError('邮箱验证码服务尚未配置', 'EMAIL_PROVIDER_NOT_CONFIGURED')
    }

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
          subject: 'Hoho 登录验证码',
          text: `你的 Hoho 登录验证码是：\n\n${code}\n\n验证码 ${Math.floor(expiresIn / 60)} 分钟内有效。\n如果不是你本人操作，可以忽略这封邮件。`
        }),
        signal: controller.signal
      })
      if (!response.ok) throw new EmailProviderError('验证码发送失败，请稍后重试')
    } catch (error) {
      if (error instanceof EmailProviderError) throw error
      throw new EmailProviderError('验证码发送失败，请稍后重试')
    } finally {
      clearTimeout(timer)
    }
  }
}
