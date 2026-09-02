import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8')

test('Operations routes use a dedicated server-verified guard', async () => {
  const [router, guard] = await Promise.all([read('../../app/router.tsx'), read('./RequireOpsAuth.tsx')])
  assert.match(router, /path: '\/ops\/login'/)
  assert.match(router, /element: <RequireOpsAuth \/>/)
  assert.doesNotMatch(router.match(/element: <RequireAuth \/>[\s\S]*?children: \[([\s\S]*?)\]\n  }/)?.[1] ?? '', /path: '\/ops'/)
  assert.match(guard, /getOpsSession\(token/)
  assert.match(guard, /state === 'authorized'.*<Outlet/s)
})

test('Operations session is isolated and auth failures remove protected data access', async () => {
  const [store, opsAuth, login] = await Promise.all([read('../../store/useAppStore.ts'), read('../../services/opsAuth.ts'), read('../../pages/Ops/Login.tsx')])
  assert.match(store, /opsAuthToken: string \| null/)
  assert.match(store, /clearOpsAuthSession/)
  assert.match(opsAuth, /error\.status === 401/)
  assert.match(opsAuth, /error\.status === 403/)
  assert.match(login, /loginOpsWithEmail/)
  assert.doesNotMatch(login, /familyMemberService|onboarding|currentMemberId/)
})
