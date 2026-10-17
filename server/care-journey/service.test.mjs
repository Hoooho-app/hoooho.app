import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CareJourneyService } from './service.mjs';
async function setup(t, extra = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-care-'));
  t.after(() => rm(directory, {
    recursive: true,
    force: true
  }));
  let clock = new Date('2026-10-18T01:00:00Z');
  const s = new CareJourneyService({
    dataDirectory: directory,
    now: () => clock,
    ...extra
  });
  await s.users.createGuest('owner', clock);
  await s.users.createGuest('other', clock);
  const m = await s.members.create({
    accountId: 'owner',
    name: '小禾',
    birthday: '2024-01-01'
  }, clock);
  return {
    s,
    m,
    next: days => {
      clock = new Date(clock.getTime() + days * 86400000);
    },
    tick: ms => {
      clock = new Date(clock.getTime() + ms);
    },
    now: () => clock
  };
}
async function record(s, m, now, owner = 'owner') {
  const e = await s.events.create({
    accountId: owner,
    memberId: m.id,
    title: '早奶',
    category: 'other',
    status: 'observing',
    startTime: now.toISOString()
  }, now);
  return s.records.create({
    accountId: owner,
    eventId: e.id,
    type: 'note',
    content: '实际喂奶150mL',
    occurredAt: now.toISOString(),
    journal: {
      categories: ['feeding']
    }
  }, now);
}
async function earn(s, next, n) {
  for (let i = 0; i < n; i++) {
    await s.checkIn('owner');
    next(1);
  }
}
test('one account check-in survives concurrency and clock zone changes', async t => {
  const {
    s
  } = await setup(t);
  const states = await Promise.all(Array.from({
    length: 20
  }, () => s.checkIn('owner', {
    timeZone: 'Asia/Shanghai'
  })));
  assert.ok(states.every(x => x.balance === 1));
  const r = await s.checkIn('owner', {
    timeZone: 'America/Los_Angeles'
  });
  assert.equal(r.balance, 1);
  assert.equal(r.timeZone, 'Asia/Shanghai');
  assert.equal((await s.get('other')).balance, 0);
});
test('client cannot claim a task; only an owned formal record awards once', async t => {
  const {
    s,
    m,
    now
  } = await setup(t);
  await assert.rejects(s.verifyTask('owner', {
    completed: true
  }), e => e.status === 400);
  assert.equal((await s.get('owner')).today.task.completed, false);
  const wrong = await s.members.create({
    accountId: 'other',
    name: '另一个孩子'
  }, now());
  await record(s, wrong, now(), 'other');
  assert.equal((await s.get('owner')).balance, 0);
  await record(s, m, now());
  const r = await s.get('owner');
  assert.equal(r.balance, 3);
  assert.equal(r.today.task.completed, true);
  assert.equal(r.achievements[0].earned, true);
  assert.equal((await s.get('owner')).balance, 3);
});
test('future facts and cross-account event linkage never reward', async t => {
  const {
    s,
    m,
    now
  } = await setup(t);
  const future = new Date(now().getTime() + 3600000);
  await record(s, m, future);
  assert.equal((await s.get('owner')).balance, 0);
  const e = await s.events.create({
    accountId: 'other',
    memberId: m.id,
    title: '错链',
    category: 'other',
    status: 'observing',
    startTime: now().toISOString()
  }, now());
  await s.records.create({
    accountId: 'owner',
    eventId: e.id,
    type: 'note',
    content: '错链',
    occurredAt: now().toISOString()
  }, now());
  assert.equal((await s.get('owner')).balance, 0);
});
test('profile or knowledge review completes without manufacturing a health fact', async t => {
  const {
    s,
    m,
    tick
  } = await setup(t);
  const material = await s.openMaterial('owner', {
    memberId: m.id
  });
  await assert.rejects(s.confirmMaterial('other', {
    materialId: material.id
  }), e => e.status === 404);
  await assert.rejects(s.confirmMaterial('owner', {
    materialId: material.id
  }), e => e.code === 'READ_BEFORE_CONFIRM');
  tick(3100);
  const r = await s.confirmMaterial('owner', {
    materialId: material.id
  });
  assert.equal(r.balance, 2);
  assert.equal(r.today.task.completed, true);
  assert.equal((await s.records.findByAccountId('owner')).length, 0);
  assert.equal((await s.confirmMaterial('owner', {
    materialId: material.id
  })).balance, 2);
});
test('stale or previous-day material cannot claim today reward', async t => {
  const {
    s,
    m,
    tick,
    next,
    now
  } = await setup(t);
  const old = await s.openMaterial('owner', {
    memberId: m.id
  });
  await s.members.update(m.id, {
    name: '新名字'
  }, now());
  tick(3100);
  await assert.rejects(s.confirmMaterial('owner', {
    materialId: old.id
  }), e => e.code === 'MATERIAL_CHANGED');
  const current = await s.openMaterial('owner', {
    memberId: m.id
  });
  next(1);
  await assert.rejects(s.confirmMaterial('owner', {
    materialId: current.id
  }), e => e.code === 'MATERIAL_NOT_FOUND');
});
test('seven complete participation days yield 21 daily plus badges, no repeated grants', async t => {
  const {
    s,
    m,
    next,
    now
  } = await setup(t);
  for (let i = 0; i < 7; i++) {
    await record(s, m, now());
    await s.checkIn('owner');
    if (i < 6) next(1);
  }
  const r = await s.get('owner');
  assert.equal(r.lifetime, 28);
  assert.equal(r.achievements.find(a => a.id === 'seven-care').progress, 7);
  assert.equal(r.achievements.find(a => a.id === 'first-journey').earned, true);
  assert.equal((await s.get('owner')).lifetime, 28);
});
test('theme redemption is atomic, permanent, idempotent and does not lower level', async t => {
  const {
    s,
    next
  } = await setup(t);
  await earn(s, next, 31);
  const before = await s.get('owner');
  const req = {
    productId: 'theme-mist-blue',
    requestId: 'theme-request-0001'
  };
  const [a, b] = await Promise.all([s.redeem('owner', req), s.redeem('owner', req)]);
  assert.equal(a.redemption.id, b.redemption.id);
  assert.equal(a.balance, before.balance - 30);
  assert.equal(a.lifetime, before.lifetime);
  assert.equal((await s.setTheme('owner', {
    themeId: 'mist-blue'
  })).theme.active, 'mist-blue');
  await assert.rejects(s.setTheme('other', {
    themeId: 'mist-blue'
  }), e => e.status === 403);
  await assert.rejects(s.redeem('owner', {
    ...req,
    requestId: 'theme-request-0002'
  }), e => e.code === 'ALREADY_OWNED');
  const restarted = new CareJourneyService({
    dataDirectory: s.directory
  });
  assert.equal((await restarted.get('owner')).theme.active, 'mist-blue');
});
test('immature products and review migration do not create a pointless charge', async t => {
  const {
    s
  } = await setup(t);
  const c = await s.catalogue('owner');
  assert.equal(c.items.find(p => p.id === 'review-once').available, false);
  await assert.rejects(s.redeem('owner', {
    productId: 'growth-comparison',
    requestId: 'growth-request-001'
  }), e => e.code === 'PRODUCT_UNAVAILABLE');
  assert.ok(!c.items.some(p => /vaccine|subscription/.test(p.id)));
});
test('single service releases failures, reserves concurrently and charges only one success', async t => {
  const {
    s,
    next
  } = await setup(t, {
    enabledProducts: ['food-comparison']
  });
  await earn(s, next, 10);
  const before = (await s.get('owner')).balance;
  await assert.rejects(s.runService('owner', {
    productId: 'food-comparison',
    requestId: 'failed-service-001'
  }, async () => {
    throw Error('recognizer failed');
  }));
  assert.equal((await s.get('owner')).balance, before);
  let resolve;
  const blocked = new Promise(r => {
    resolve = r;
  });
  const request = {
    productId: 'food-comparison',
    requestId: 'working-service-001'
  };
  const operation = s.runService('owner', request, async () => {
    await blocked;
    return {
      valid: true,
      result: 'two readable labels'
    };
  });
  await new Promise(r => setImmediate(r));
  await assert.rejects(s.runService('owner', request, async () => ({
    valid: true
  })), e => e.code === 'SERVICE_IN_PROGRESS');
  resolve();
  const result = await operation;
  assert.equal((await s.get('owner')).balance, before - 5);
  assert.deepEqual(await s.runService('owner', request, async () => {
    throw Error('must not run');
  }), result);
  assert.equal((await s.get('owner')).balance, before - 5);
});
test('review voucher is unused without expiry, successful use starts rolling cooldown', async t => {
  const {
    s,
    m,
    next,
    now
  } = await setup(t, {
    reviewVoucherEnabled: true,
    commercializationReady: true,
    reviewBuilder: async () => ({
      valid: true,
      sources: {
        index: [{
          id: 'real'
        }]
      }
    })
  });
  await earn(s, next, 31);
  const a = await s.redeem('owner', {
    productId: 'review-once',
    requestId: 'voucher-request-001'
  });
  const voucher = a.vouchers[0];
  assert.equal(voucher.expiresAt, undefined);
  next(90);
  await assert.rejects(s.redeem('owner', {
    productId: 'review-once',
    requestId: 'voucher-request-002'
  }), e => e.code === 'UNUSED_VOUCHER');
  const end = now().toISOString().slice(0, 10),
    start = new Date(now().getTime() - 6 * 86400000).toISOString().slice(0, 10);
  const result = await s.createSnapshot('owner', {
    memberId: m.id,
    start,
    end,
    voucherId: voucher.id,
    requestId: 'snapshot-request-001'
  });
  assert.equal(result.memberId, m.id);
  assert.equal((await s.get('owner')).vouchers[0].status, 'used');
  await assert.rejects(s.redeem('owner', {
    productId: 'review-once',
    requestId: 'voucher-request-003'
  }), e => e.code === 'VOUCHER_COOLDOWN');
  next(30);
  await s.redeem('owner', {
    productId: 'review-once',
    requestId: 'voucher-request-004'
  });
});
test('invalid/empty snapshot preserves voucher and prevents foreign member or client data', async t => {
  const {
    s,
    m,
    next
  } = await setup(t, {
    reviewVoucherEnabled: true,
    reviewBuilder: async () => {
      throw Error('source unavailable');
    }
  });
  await earn(s, next, 25);
  const a = await s.redeem('owner', {
      productId: 'review-once',
      requestId: 'voucher-empty-001'
    }),
    v = a.vouchers[0];
  const input = {
    memberId: m.id,
    start: '2026-10-18',
    end: '2026-10-24',
    voucherId: v.id,
    requestId: 'snapshot-empty-001'
  };
  await assert.rejects(s.createSnapshot('owner', {
    ...input,
    model: {
      fake: true
    }
  }));
  await assert.rejects(s.createSnapshot('other', input), e => e.status === 404);
  await assert.rejects(s.createSnapshot('owner', input), /source unavailable/);
  assert.equal((await s.get('owner')).vouchers[0].status, 'unused');
});
test('uncommercialized review retains unused voucher and free snapshot access', async t => {
  const {
    s,
    m,
    next
  } = await setup(t, {
    reviewVoucherEnabled: true,
    reviewBuilder: async () => ({
      sources: {
        index: [{
          id: 'confirmed'
        }]
      }
    })
  });
  await earn(s, next, 25);
  const a = await s.redeem('owner', {
    productId: 'review-once',
    requestId: 'pre-migration-001'
  });
  const snapshot = await s.createSnapshot('owner', {
    memberId: m.id,
    start: '2026-10-18',
    end: '2026-10-24',
    voucherId: a.vouchers[0].id,
    requestId: 'free-snapshot-001'
  });
  assert.equal(snapshot.voucherConsumed, false);
  assert.equal((await s.get('owner')).vouchers[0].status, 'unused');
  assert.equal((await s.snapshots('owner', snapshot.id)).id, snapshot.id);
  await assert.rejects(s.snapshots('other', snapshot.id), e => e.status === 404);
});
test('lightweight theme read checks ownership and does not scan health records', async t => {
  const {
    s
  } = await setup(t);
  s.facts = () => {
    throw Error('health scan must not run');
  };
  assert.deepEqual(await s.getTheme('owner'), {
    active: 'paper',
    owned: ['paper']
  });
  await s.store.update(d => ({
    ...d,
    accounts: d.accounts.map(a => a.accountId === 'owner' ? {
      ...a,
      theme: 'mist-blue'
    } : a)
  }));
  assert.deepEqual(await s.getTheme('owner'), {
    active: 'paper',
    owned: ['paper']
  });
  await assert.rejects(s.getTheme('unknown'), e => e.status === 401);
});
test('unconfirmed external drafts never count as a real record or task',async t=>{const {s,m,now}=await setup(t);const row=await record(s,m,now());await s.records.update(row.id,{caseContext:{identity:'external_ai'}},now());const state=await s.get('owner');assert.equal(state.today.task.completed,false);assert.equal(state.achievements[0].earned,false);assert.equal(state.balance,0)})
test('growth purchase checks authoritative current age and cannot bypass catalogue gate',async t=>{const {s,m,next,now}=await setup(t,{enabledProducts:['growth-comparison']});await earn(s,next,31);await s.members.update(m.id,{birthday:'2025-01-01'},now());assert.equal((await s.catalogue('owner')).items.find(p=>p.id==='growth-comparison').available,false);const before=(await s.get('owner')).balance;await assert.rejects(s.redeem('owner',{productId:'growth-comparison',requestId:'too-young-growth'}),e=>e.code==='GROWTH_NOT_APPLICABLE');assert.equal((await s.get('owner')).balance,before);await s.members.update(m.id,{birthday:'2023-01-01'},now());assert.equal((await s.catalogue('owner')).items.find(p=>p.id==='growth-comparison').available,true);await s.redeem('owner',{productId:'growth-comparison',requestId:'valid-growth-age'});assert.equal((await s.get('owner')).owned.some(p=>p.productId==='growth-comparison'),true)})
test('child deleted during service or mismatched result releases reserve without storing result',async t=>{const {s,m,next}=await setup(t,{enabledProducts:['food-comparison']});await earn(s,next,10);const before=(await s.get('owner')).balance;await assert.rejects(s.runService('owner',{productId:'food-comparison',requestId:'mismatch-service',memberId:m.id},async()=>({valid:true,memberId:'foreign'})),e=>e.code==='SERVICE_MEMBER_MISMATCH');assert.equal((await s.get('owner')).balance,before);await assert.rejects(s.runService('owner',{productId:'food-comparison',requestId:'removed-child-service',memberId:m.id},async()=>{await s.members.delete(m.id);return {valid:true,memberId:m.id}}),e=>e.status===404);const account=(await s.store.read()).accounts.find(a=>a.accountId==='owner');assert.equal(account.reservations.some(r=>r.result),false);assert.equal((await s.get('owner')).balance,before)})
