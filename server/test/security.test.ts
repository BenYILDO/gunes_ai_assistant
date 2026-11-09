import './env.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Request, Response } from 'express';
import { hostGuard, originGuard } from '../src/security.js';

function run(mw: (req: Request, res: Response, next: () => void) => void, req: Partial<Request>) {
  let status = 200;
  let nexted = false;
  const res = {
    status(c: number) {
      status = c;
      return this;
    },
    send() {
      return this;
    },
    json() {
      return this;
    },
  } as unknown as Response;
  mw({ method: 'GET', headers: {}, ...req } as Request, res, () => (nexted = true));
  return { status, nexted };
}

const origin = originGuard(4317);
const host = hostGuard(4317);

test('host: yalnızca localhost adları geçer (DNS rebinding)', () => {
  assert.equal(run(host, { headers: { host: 'localhost:4317' } }).nexted, true);
  assert.equal(run(host, { headers: { host: '127.0.0.1:4317' } }).nexted, true);
  const evil = run(host, { headers: { host: 'evil.example.com:4317' } });
  assert.equal(evil.nexted, false);
  assert.equal(evil.status, 403);
});

test('origin: bilinmeyen siteden yazma isteği reddedilir', () => {
  for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
    const r = run(origin, { method, headers: { origin: 'https://evil.example.com' } });
    assert.equal(r.nexted, false, method);
    assert.equal(r.status, 403, method);
  }
});

test('origin: Güneş arayüzü (4317 ve Vite 5317) geçer', () => {
  for (const o of ['http://localhost:4317', 'http://127.0.0.1:4317', 'http://localhost:5317']) {
    assert.equal(run(origin, { method: 'POST', headers: { origin: o } }).nexted, true, o);
  }
});

test('origin: okuma istekleri ve Origin\'siz istekler (MCP, curl) geçer', () => {
  assert.equal(run(origin, { method: 'GET', headers: { origin: 'https://evil.example.com' } }).nexted, true);
  assert.equal(run(origin, { method: 'POST', headers: {} }).nexted, true);
});

test('origin: Origin yok ama tarayıcı cross-site diyorsa reddedilir', () => {
  const r = run(origin, { method: 'POST', headers: { 'sec-fetch-site': 'cross-site' } });
  assert.equal(r.nexted, false);
  assert.equal(r.status, 403);
});
