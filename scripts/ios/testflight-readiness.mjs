import { createPrivateKey, sign } from 'node:crypto'
import { pathToFileURL } from 'node:url'
const expected = { build: '1.4.1', marketing: '0.1.0', bundle: 'com.hoooho.records' }
const states = ['PROCESSING', 'PROCESSING_EXCEPTION', 'MISSING_EXPORT_COMPLIANCE', 'READY_FOR_BETA_TESTING', 'IN_BETA_TESTING', 'EXPIRED', 'IN_EXPORT_COMPLIANCE_REVIEW']
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
export function createReadToken(env, now = Math.floor(Date.now() / 1000)) {
  for (const name of ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_API_KEY_P8']) if (!env[name]) throw new Error('Missing Apple read credentials')
  const key = createPrivateKey(env.ASC_API_KEY_P8)
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw new Error('Invalid Apple signing key type')
  const data = encode({ alg: 'ES256', kid: env.ASC_KEY_ID, typ: 'JWT' }) + '.' + encode({ iss: env.ASC_ISSUER_ID, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' })
  return data + '.' + sign('sha256', Buffer.from(data), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')
}
export function safeReceipt(document) {
  if (!Array.isArray(document.data) || document.data.length !== 1) return { readOnly: true, matchedBuilds: document.data?.length ?? 0, readyForInternalTesting: false }
  const build = document.data[0], attributes = build.attributes ?? {}, included = document.included ?? []
  const related = name => included.find(item => item.id === build.relationships?.[name]?.data?.id && item.type === build.relationships?.[name]?.data?.type)
  const groupLinks = build.relationships?.betaGroups?.data
  const groups = Array.isArray(groupLinks) ? groupLinks.map(link => included.find(item => item.id === link.id && item.type === 'betaGroups')) : []
  const groupsComplete = Array.isArray(groupLinks) && groups.every(Boolean) && (build.relationships.betaGroups.meta?.paging?.total ?? groups.length) <= groups.length
  const internalGroups = groups.filter(group => group?.attributes?.isInternalGroup === true).length
  const betaState = related('buildBetaDetail')?.attributes?.internalBuildState
  const correctIdentity = attributes.version === expected.build && related('preReleaseVersion')?.attributes?.version === expected.marketing && related('app')?.attributes?.bundleId === expected.bundle
  return {
    readOnly: true, build: expected.build, marketing: expected.marketing, correctIdentity,
    processingState: ['PROCESSING', 'FAILED', 'INVALID', 'VALID'].includes(attributes.processingState) ? attributes.processingState : 'UNKNOWN',
    expired: typeof attributes.expired === 'boolean' ? attributes.expired : null,
    internalBetaState: states.includes(betaState) ? betaState : 'UNKNOWN',
    encryptionAnswerPresent: typeof attributes.usesNonExemptEncryption === 'boolean',
    internalGroups, groupsComplete,
    readyForInternalTesting: correctIdentity && attributes.processingState === 'VALID' && attributes.expired === false && betaState === 'IN_BETA_TESTING' && groupsComplete && internalGroups > 0,
  }
}
export async function readReadiness(env, request = fetch) {
  if (!/^\d+$/.test(env.ASC_APP_ID ?? '')) throw new Error('Missing configured Apple app')
  const url = new URL('https://api.appstoreconnect.apple.com/v1/builds')
  url.search = new URLSearchParams({
    'filter[app]': env.ASC_APP_ID, 'filter[version]': expected.build, limit: '10',
    include: 'app,preReleaseVersion,buildBetaDetail,betaGroups',
    'fields[builds]': 'version,processingState,expired,usesNonExemptEncryption,app,preReleaseVersion,buildBetaDetail,betaGroups',
    'fields[apps]': 'bundleId', 'fields[preReleaseVersions]': 'version',
    'fields[buildBetaDetails]': 'internalBuildState', 'fields[betaGroups]': 'isInternalGroup,hasAccessToAllBuilds',
  }).toString()
  const response = await request(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(30000), headers: { Authorization: 'Bearer ' + createReadToken(env), Accept: 'application/json' } })
  if (!response.ok) return { readOnly: true, httpStatus: response.status, readyForInternalTesting: false }
  return safeReceipt(await response.json())
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  readReadiness(process.env).then(result => console.log(JSON.stringify(result))).catch(() => {
    console.error('Read-only Apple verification failed; no credentials or response body are logged.')
    process.exitCode = 1
  })
}
