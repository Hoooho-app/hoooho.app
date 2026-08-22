import path from 'node:path'

export const authConfig = {
  codeTtlMs: 5 * 60 * 1000,
  resendIntervalMs: 60 * 1000,
  maxFailedAttempts: 5,
  tokenTtlMs: 7 * 24 * 60 * 60 * 1000,
  dataDirectory: path.resolve(process.env.DATA_DIRECTORY || path.join(process.cwd(), '.codex-tmp', 'auth')),
  tokenSecret: process.env.AUTH_TOKEN_SECRET || 'hoooho-local-development-secret',
  resendApiKey: process.env.RESEND_API_KEY || '',
  authEmailFrom: process.env.AUTH_EMAIL_FROM || ''
}

export const mainlandPhonePattern = /^1[3-9]\d{9}$/
export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
