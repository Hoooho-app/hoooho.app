import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { JsonStore } from '../auth/storage/json-store.mjs';
import { accountTransaction } from '../auth/storage/transaction.mjs';
const unique = (items, key) => [...new Map(items.map(item => [key(item), item])).values()];
/** Runs inside the account-data transaction when present. It never transfers
 * sprouts between unrelated users; only the existing guest-upgrade path calls it.
 * Daily/achievement grants describe one human action and must not double on merge.
 * Already spent funds and acquired assets remain, even if duplicate grants were
 * spent before merge: any resulting deficit is forgiven, never a negative wallet.
 */
export async function mergeCareJourneyAccounts(dataDirectory, guestAccountId, accountId, now = new Date()) {
  if (typeof guestAccountId !== 'string' || !guestAccountId.startsWith('guest:') || guestAccountId === accountId) return {
    merged: false,
    idempotent: true
  };
  if (typeof accountId !== 'string' || !accountId) throw new Error('Account merge target required');
  return accountTransaction(dataDirectory, async () => {
    const store = new JsonStore(path.join(dataDirectory, 'care-journey.json'), {
        accounts: []
      }),
      data = structuredClone(await store.read());
    const operationId = `${guestAccountId}->${accountId}`,
      merges = data.merges ?? [];
    if (merges.some(x => x.guestAccountId === guestAccountId && x.accountId !== accountId)) throw Object.assign(new Error('树芽积累已归入其他账号'), {
      status: 409,
      code: 'CARE_GUEST_ALREADY_MERGED'
    });
    if (merges.some(x => x.id === operationId)) return {
      merged: false,
      idempotent: true
    };
    const guest = data.accounts.find(x => x.accountId === guestAccountId);
    if (!guest) return {
      merged: false,
      idempotent: true
    };
    const target = data.accounts.find(x => x.accountId === accountId);
    if (!target) {
      guest.accountId = accountId;
      guest.materials = [];
      for (const r of guest.reservations ?? []) if (r.status === 'reserved') {
        r.status = 'released';
        r.releasedAt = now.toISOString();
      }
    } else {
      // Keep registered-account entries on duplicate reward keys; spend IDs remain
      // unique across both origins, and refunds/adjustments do not grow lifetime.
      const ledger = [],
        rewardKeys = new Set(),
        entryIds = new Set();
      for (const [origin, entries] of [[accountId, target.ledger ?? []], [guestAccountId, guest.ledger ?? []]]) for (const original of entries) {
        const entry = {
          ...original,
          originAccountId: original.originAccountId ?? origin
        };
        if (entry.kind === 'reward') {
          if (rewardKeys.has(entry.key)) continue;
          rewardKeys.add(entry.key);
        }
        if (entryIds.has(entry.id)) continue;
        entryIds.add(entry.id);
        ledger.push(entry);
      }
      const sum = ledger.reduce((n, r) => n + r.amount, 0);
      if (sum < 0) ledger.push({
        id: randomUUID(),
        key: 'merge-adjustment:' + operationId,
        kind: 'merge-adjustment',
        amount: -sum,
        label: '合并重复奖励结算',
        title: '合并重复奖励结算',
        createdAt: now.toISOString()
      });
      const days = new Map();
      for (const d of [...guest.days, ...target.days]) {
        const previous = days.get(d.date);
        days.set(d.date, previous ? {
          ...previous,
          ...d,
          checkedIn: previous.checkedIn || d.checkedIn,
          taskCompleted: previous.taskCompleted || d.taskCompleted,
          evidence: d.evidence ?? previous.evidence
        } : d);
      }
      target.days = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
      target.ledger = ledger.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
      target.wallet = Math.max(0, sum);
      target.lifetime = ledger.filter(x => x.kind === 'reward').reduce((n, r) => n + Math.max(0, r.amount), 0);
      target.achievements = unique([...(guest.achievements ?? []), ...(target.achievements ?? [])], x => x.id);
      target.owned = unique([...(guest.owned ?? []), ...(target.owned ?? [])], x => x.productId);
      for (const key of ['vouchers', 'redemptions', 'snapshots']) target[key] = unique([...(guest[key] ?? []), ...(target[key] ?? [])], x => x.id);
      target.reservations = unique([...(guest.reservations ?? []), ...(target.reservations ?? [])], x => x.id).map(r => r.status === 'reserved' ? {
        ...r,
        status: 'released',
        releasedAt: now.toISOString()
      } : r);
      target.materials = [];
      if (target.theme === 'paper' && guest.theme !== 'paper' && target.owned.some(x => x.productId === 'theme-mist-blue')) target.theme = guest.theme;
      data.accounts = data.accounts.filter(x => x.accountId !== guestAccountId);
    }
    data.merges = [...merges, {
      id: operationId,
      guestAccountId,
      accountId,
      completedAt: now.toISOString()
    }];
    await store.update(() => data);
    return {
      merged: true,
      idempotent: false
    };
  });
}
