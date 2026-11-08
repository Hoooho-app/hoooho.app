import { AsyncLocalStorage } from 'node:async_hooks'
import { configurationError } from './provider-config.mjs'

const scope = new AsyncLocalStorage()
export const seedHomeStatusPath = '/api/seed-testflight-home/status'
export const seedHomeRoute = 'seed-testflight-home-v1'
export const currentSeedHome = () => scope.getStore()
export const withSeedHome = (route, operation) => scope.run(route, operation)

export function seedHomeEnabled(env) {
  return env.HOOOHO_SEED_HOME_TESTFLIGHT === 'true' &&
    Boolean(env.HOOOHO_SEED_TRIAL_HOOOHO_ID?.trim()) &&
    !env.RAILWAY_ENVIRONMENT_ID && !env.RAILWAY_SERVICE_ID
}

export function assertSeedHomeEnabled(env) {
  if (!seedHomeEnabled(env)) {
    throw configurationError('杭州的 Seed TestFlight 服务尚未启用', 'AI_SEED_HOME_UNAVAILABLE')
  }
}

export function seedHomeStatus(env) {
  return {
    route: seedHomeRoute,
    ready: seedHomeEnabled(env) && Boolean(env.HOOOHO_SEED_TRIAL_API_KEY?.trim() && env.DOUBAO_ASR_API_KEY?.trim()),
  }
}

export function seedHomeRequest(request, pathname) {
  return isSeedHomeBuild(request) &&
    (/^\/api\/ai\/audio\/(?:live(?:\/|$)|transcriptions$|capabilities$)/.test(pathname) ||
     /^\/api\/members\/[^/]+\/(?:recognition-jobs|front-desk-record|ai-drafts)(?:\/|$)/.test(pathname))
}

export function isSeedHomeBuild(request) {
  return /(?:^|\s)HooohoSeedTestFlight\/1(?:\s|$)/.test(request.headers['user-agent'] ?? '')
}

export function createSeedHomeScope({ env, findUser, models }) {
  return async (accountId, operation) => {
    assertSeedHomeEnabled(env)
    const user = await findUser(accountId)
    if (!user || user.id !== accountId || user.guest || user.mergedInto ||
      user.hooohoId !== env.HOOOHO_SEED_TRIAL_HOOOHO_ID.trim()) {
      throw Object.assign(new Error('该账号未开放 Seed TestFlight，请使用已开通的护护账号'), {
        status: 403, code: 'AI_SEED_HOME_ACCOUNT_REQUIRED',
      })
    }
    return withSeedHome({ accountId, models }, operation)
  }
}
