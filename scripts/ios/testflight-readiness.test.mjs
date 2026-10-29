import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, verify } from 'node:crypto'
import { createReadToken, readReadiness, safeReceipt } from './testflight-readiness.mjs'
const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const env = { ASC_APP_ID: '123', ASC_KEY_ID: 'synthetic', ASC_ISSUER_ID: 'synthetic-issuer', ASC_API_KEY_P8: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }) }
function fixture(state = 'IN_BETA_TESTING') {
  return { data: [{ id: 'private-build', attributes: { version: '1.5.1', processingState: 'VALID', expired: false, usesNonExemptEncryption: false }, relationships: { app: { data: { type: 'apps', id: 'private-app' } }, preReleaseVersion: { data: { type: 'preReleaseVersions', id: 'private-version' } }, buildBetaDetail: { data: { type: 'buildBetaDetails', id: 'private-detail' } }, betaGroups: { data: [{ type: 'betaGroups', id: 'private-group' }] } } }], included: [{ type: 'apps', id: 'private-app', attributes: { bundleId: 'com.hoooho.records' } }, { type: 'preReleaseVersions', id: 'private-version', attributes: { version: '0.1.0' } }, { type: 'buildBetaDetails', id: 'private-detail', attributes: { internalBuildState: state } }, { type: 'betaGroups', id: 'private-group', attributes: { isInternalGroup: true, name: 'PRIVATE GROUP', betaTesters: 'private@example.test' } }] }
}
test('short-lived Apple token signs valid ES256', () => {
  const [header, payload, signature] = createReadToken(env, 1000).split('.')
  assert.equal(verify('sha256', Buffer.from(header + '.' + payload), { key: pair.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')), true)
  const claims = JSON.parse(Buffer.from(payload, 'base64url'))
  assert.equal(claims.exp - claims.iat, 600)
  assert.equal(claims.aud, 'appstoreconnect-v1')
})
test('only a unique matching active build in an internal group is ready; output omits identities', () => {
  assert.equal(safeReceipt(fixture()).readyForInternalTesting, true)
  for (const state of ['READY_FOR_BETA_TESTING', 'MISSING_EXPORT_COMPLIANCE', 'PROCESSING', 'EXPIRED']) assert.equal(safeReceipt(fixture(state)).readyForInternalTesting, false)
  const noGroup = fixture(); noGroup.data[0].relationships.betaGroups.data = []
  assert.equal(safeReceipt(noGroup).readyForInternalTesting, false)
  const wrong = fixture(); wrong.data[0].attributes.version = '1.3.1'
  assert.equal(safeReceipt(wrong).readyForInternalTesting, false)
  assert.equal(safeReceipt({ data: [] }).readyForInternalTesting, false)
  assert.doesNotMatch(JSON.stringify(safeReceipt(fixture())), /private|PRIVATE|@/)
})
test('one GET request to fixed Apple endpoint; denial emits no raw body', async () => {
  let calls = 0
  const result = await readReadiness(env, async (url, options) => {
    calls++; assert.equal(url.origin, 'https://api.appstoreconnect.apple.com')
    assert.equal(url.pathname, '/v1/builds')
    assert.equal(url.searchParams.get('filter[app]'), '123')
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error')
    return { ok: false, status: 403, json: () => { throw new Error('must not expose denied body') } }
  })
  assert.equal(calls, 1)
  assert.deepEqual(result, { readOnly: true, httpStatus: 403, readyForInternalTesting: false })
})
