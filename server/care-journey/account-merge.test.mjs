import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { JsonStore } from '../auth/storage/json-store.mjs';
import { mergeCareJourneyAccounts } from './account-merge.mjs';
const account = (id, extra = {}) => ({
  accountId: id,
  timeZone: 'Asia/Shanghai',
  wallet: 0,
  lifetime: 0,
  theme: 'paper',
  ledger: [],
  days: [],
  achievements: [],
  owned: [],
  vouchers: [],
  redemptions: [],
  reservations: [],
  snapshots: [],
  materials: [],
  ...extra
});
async function setup(t, accounts) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'care-merge-'));
  t.after(() => rm(dir, {
    recursive: true,
    force: true
  }));
  const store = new JsonStore(path.join(dir, 'care-journey.json'), {
    accounts: []
  });
  await store.update(() => ({
    accounts
  }));
  return {
    dir,
    store
  };
}
const entry = (id, key, amount, kind = 'reward') => ({
  id,
  key,
  amount,
  kind,
  createdAt: '2026-10-18T00:00:00Z'
});
test('guest merge deduplicates daily and badge grants, preserves assets and spends, and replays once', async t => {
  const {
    dir,
    store
  } = await setup(t, [account('guest:1', {
    wallet: 2,
    lifetime: 32,
    theme: 'mist-blue',
    ledger: [entry('g1', 'check-in:2026-10-18', 1), entry('g2', 'badge:first-record', 1), entry('g3', 'task:2026-10-18', 2), entry('g4', 'check-in:old-day', 28), entry('spend', 'redeem:g-theme', -30, 'spend')],
    owned: [{
      id: 'own-theme',
      productId: 'theme-mist-blue'
    }],
    days: [{
      date: '2026-10-18',
      checkedIn: true
    }],
    vouchers: [{
      id: 'voucher',
      status: 'unused'
    }]
  }), account('registered', {
    wallet: 2,
    lifetime: 2,
    ledger: [entry('t1', 'check-in:2026-10-18', 1), entry('t2', 'badge:first-record', 1)],
    days: [{
      date: '2026-10-18',
      taskCompleted: true
    }],
    snapshots: [{
      id: 'snapshot'
    }]
  })]);
  await mergeCareJourneyAccounts(dir, 'guest:1', 'registered');
  const a = (await store.read()).accounts;
  assert.equal(a.length, 1);
  assert.equal(a[0].wallet, 2);
  assert.equal(a[0].lifetime, 32);
  assert.equal(a[0].owned[0].productId, 'theme-mist-blue');
  assert.equal(a[0].theme, 'mist-blue');
  assert.equal(a[0].days[0].checkedIn, true);
  assert.equal(a[0].days[0].taskCompleted, true);
  assert.equal(a[0].vouchers.length, 1);
  assert.equal(a[0].snapshots.length, 1);
  const before = JSON.stringify(await store.read());
  assert.deepEqual(await mergeCareJourneyAccounts(dir, 'guest:1', 'registered'), {
    merged: false,
    idempotent: true
  });
  assert.equal(JSON.stringify(await store.read()), before);
  await assert.rejects(mergeCareJourneyAccounts(dir, 'guest:1', 'other'), e => e.code === 'CARE_GUEST_ALREADY_MERGED');
});
test('previously spent duplicate rewards never produce negative wallet or revoke owned items', async t => {
  const duplicate = Array.from({
    length: 30
  }, (_, i) => entry('g' + i, 'check-in:day' + i, 1));
  const {
    dir,
    store
  } = await setup(t, [account('guest:2', {
    wallet: 0,
    lifetime: 30,
    ledger: [...duplicate, entry('gs', 'redeem:guest', -30, 'spend')],
    owned: [{
      id: 'gown',
      productId: 'theme-mist-blue'
    }]
  }), account('registered', {
    wallet: 0,
    lifetime: 30,
    ledger: [...duplicate.map(x => ({
      ...x,
      id: 't' + x.id
    })), entry('ts', 'redeem:target', -30, 'spend')],
    owned: [{
      id: 'town',
      productId: 'growth-comparison'
    }]
  })]);
  await mergeCareJourneyAccounts(dir, 'guest:2', 'registered');
  const a = (await store.read()).accounts[0];
  assert.equal(a.wallet, 0);
  assert.equal(a.lifetime, 30);
  assert.equal(a.owned.length, 2);
  assert.equal(a.ledger.reduce((n, r) => n + r.amount, 0), 0);
  assert.equal(a.ledger.filter(r => r.kind === 'merge-adjustment').length, 1);
});
test('only guest upgrade may merge and pending source reservations release', async t => {
  const {
    dir,
    store
  } = await setup(t, [account('guest:3', {
    wallet: 10,
    lifetime: 10,
    reservations: [{
      id: 'pending',
      status: 'reserved',
      cost: 5
    }],
    materials: [{
      id: 'receipt'
    }]
  })]);
  assert.equal((await mergeCareJourneyAccounts(dir, 'private-a', 'target')).merged, false);
  await mergeCareJourneyAccounts(dir, 'guest:3', 'target');
  const a = (await store.read()).accounts[0];
  assert.equal(a.accountId, 'target');
  assert.equal(a.wallet, 10);
  assert.equal(a.reservations[0].status, 'released');
  assert.equal(a.materials.length, 0);
});
