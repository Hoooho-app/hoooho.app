import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { AuthService } from '../auth/auth-service.mjs'
import { AccountService } from './account-service.mjs'
async function setup(t) {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), 'hoooho-account-input-'))
  t.after(() => rm(dataDirectory, { recursive: true, force: true }))
  const auth = new AuthService({ dataDirectory, tokenSecret: 'synthetic-secret', emailProvider: { sendVerificationCode: async () => { throw new Error('must not send') } }, logger() {} })
  const user = await auth.users.findOrCreateByEmail('synthetic@example.test')
  return { account: new AccountService({ dataDirectory, auth, users: auth.users }), user }
}
test('valid GIF PNG JPEG and WebP account avatars roundtrip without rewriting bytes', async t => {
  const { account, user } = await setup(t)
  for (const format of ['gif', 'png', 'jpeg', 'webp']) {
    const bytes = await sharp({ create: { width: 12, height: 8, channels: 3, background: '#aabbcc' } })[format]().toBuffer()
    const avatar = `data:image/${format};base64,${bytes.toString('base64')}`
    assert.equal((await account.updateProfile(user.id, { avatar })).avatar, avatar)
    assert.equal((await account.get(user.id)).avatar, avatar)
  }
  assert.equal((await account.updateProfile(user.id, { avatar: '' })).avatar, '')
  assert.equal((await account.updateProfile(user.id, { avatar: null })).avatar, null)
})
test('invalid avatar and malformed input never replace existing profile data', async t => {
  const { account, user } = await setup(t), before = await account.updateProfile(user.id, { nickname: '保持原资料', avatar: null })
  for (const avatar of ['data:image/png;base64,not-image', 'data:image/png;base64,iVBORw0KGgo=', 'data:image/svg+xml;base64,PHN2Zy8+', { image: 'object' }, false]) {
    await assert.rejects(account.updateProfile(user.id, { nickname: '不应保存', avatar }), error => error.code === 'INVALID_AVATAR')
    assert.deepEqual(await account.get(user.id), before)
  }
  for (const input of [null, [], false, 'value']) await assert.rejects(account.updateProfile(user.id, input), error => error.status === 400)
})
