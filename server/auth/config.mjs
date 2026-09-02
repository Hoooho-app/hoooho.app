import path from 'node:path'

const configuredTokenSecret = process.env.AUTH_TOKEN_SECRET || ''
export function assertAuthRuntimeConfig(environment = process.env) {
  const deployedRuntime = environment.NODE_ENV === 'production' || Boolean(environment.RAILWAY_ENVIRONMENT_ID)
  if (deployedRuntime && !environment.AUTH_TOKEN_SECRET) {
    throw new Error('AUTH_TOKEN_SECRET is required in production')
  }
}

export const authConfig = {
  codeTtlMs: 5 * 60 * 1000,
  resendIntervalMs: 60 * 1000,
  maxFailedAttempts: 5,
  tokenTtlMs: 7 * 24 * 60 * 60 * 1000,
  dataDirectory: path.resolve(process.env.DATA_DIRECTORY || path.join(process.cwd(), '.codex-tmp', 'auth')),
  tokenSecret: configuredTokenSecret || 'hoooho-local-development-secret',
  opsOwnerEmail: process.env.OPS_OWNER_EMAIL || '',
  resendApiKey: process.env.RESEND_API_KEY || '',
  authEmailFrom: process.env.AUTH_EMAIL_FROM || ''
}

export const mainlandPhonePattern = /^1[3-9]\d{9}$/
export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
