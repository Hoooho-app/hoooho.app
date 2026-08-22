import path from 'node:path'

export const authConfig = {
  codeTtlMs: 5 * 60 * 1000,
  resendIntervalMs: 60 * 1000,
  tokenTtlMs: 7 * 24 * 60 * 60 * 1000,
  dataDirectory: path.resolve(process.env.DATA_DIRECTORY || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(process.cwd(), '.codex-tmp', 'auth')),
  tokenSecret: process.env.AUTH_TOKEN_SECRET || 'hoooho-local-development-secret'
}

export const mainlandPhonePattern = /^1[3-9]\d{9}$/
