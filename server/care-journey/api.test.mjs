import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { careJourneyApiPlugin, careJourneyRoute } from './api.mjs';
import { CareJourneyService } from './service.mjs';
import { SessionRepository } from '../auth/session-repository.mjs';
import { TokenService } from '../auth/token-service.mjs';
test('authenticated API enforces object JSON, method and account boundary', async t => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'care-api-'));
  t.after(() => rm(dataDirectory, {
    recursive: true,
    force: true
  }));
  const config = {
    dataDirectory,
    tokenSecret: 'test-care-journey-secret',
    tokenTtlMs: 3600000
  };
  const service = new CareJourneyService(config);
  await service.users.createGuest('a');
  await service.users.createGuest('b');
  await service.users.update('a', {
    guest: false
  });
  await service.users.update('b', {
    guest: false
  });
  let handler;
  careJourneyApiPlugin({
    ...config,
    service
  }).configureServer({
    middlewares: {
      use(fn) {
        handler = fn;
      }
    }
  });
  const server = http.createServer((req, res) => handler(req, res, () => {
    res.writeHead(404);
    res.end();
  }));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`,
    tokens = new TokenService(config.tokenSecret, config.tokenTtlMs);
  const auth = tokens.create({
    id: 'a'
  });
  const request = (suffix = '', options = {}) => fetch(base + '/api/care-journey' + suffix, {
    ...options,
    headers: {
      Authorization: 'Bearer ' + auth,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  let response = await request('', {
    headers: {
      Authorization: 'Bearer ' + tokens.create({
        id: 'a',
        purpose: 'password-reset'
      })
    }
  });
  assert.equal(response.status, 401);
  response = await request('', {
    headers: {
      Authorization: 'Bearer ' + tokens.create({
        id: 'a',
        browserSession: true
      })
    }
  });
  assert.equal(response.status, 401);
  const sessions = new SessionRepository(dataDirectory),
    session = await sessions.create('a');
  const browserToken = tokens.create({
    id: 'a',
    browserSession: true
  });
  response = await request('', {
    headers: {
      Authorization: 'Bearer ' + browserToken,
      Cookie: 'hoooho_session=' + session.token
    }
  });
  assert.equal(response.status, 200);
  await sessions.revoke(session.token);
  response = await request('', {
    headers: {
      Authorization: 'Bearer ' + browserToken,
      Cookie: 'hoooho_session=' + session.token
    }
  });
  assert.equal(response.status, 401);
  response = await request('', {
    headers: {
      Origin: 'https://cross-site.example'
    }
  });
  assert.equal(response.status, 403);
  response = await fetch(base + '/api/care-journey');
  assert.equal(response.status, 401);
  response = await request('/check-in', {
    method: 'POST',
    body: '[]'
  });
  assert.equal(response.status, 400);
  response = await request('/check-in', {
    method: 'POST',
    body: '{}'
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).balance, 1);
  response = await request('/overview');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).balance, 1);
  response = await request('/redeem', {
    method: 'POST',
    body: JSON.stringify({
      productId: 'theme-mist-blue',
      requestId: 'valid-id-123'
    })
  });
  assert.equal(response.status, 410);
  assert.equal((await response.json()).error.code, 'EXCHANGE_RETIRED');
  assert.equal((await service.get('a')).balance, 1);
  for (const [suffix, method] of [['/task/verify', 'POST'], ['/tasks/verify', 'POST'], ['/task-material', 'GET'], ['/task-material/confirm', 'POST']]) {
    response = await request(suffix, { method, ...(method === 'POST' ? { body: '{}' } : {}) });
    assert.equal(response.status, 410);
    assert.equal((await response.json()).error.code, 'DAILY_TASK_RETIRED');
  }
  response = await request('/catalogue');
  assert.deepEqual(await response.json(), { items: [] });
  response = await request('/check-in', {
    method: 'DELETE'
  });
  assert.equal(response.status, 405);
  response = await request('/review-snapshots');
  assert.deepEqual(await response.json(), {
    snapshots: []
  });
  assert.equal((await service.get('b')).balance, 0);
  assert.equal(careJourneyRoute('/api/care-journey-attacker'), null);
});
