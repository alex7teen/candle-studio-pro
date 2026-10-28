import { describe, it, expect, vi } from 'vitest';
import { pbkdf2Sync } from 'node:crypto';
import { hashPassword, equalPasswordHash } from '../src/password';
import worker from '../src/worker';

// Synthetic credentials only. Never read production D1 in tests.
const password = 'synthetic test password';
const salt = '0123456789abcdef0123456789abcdef';
const reference = () => pbkdf2Sync(password, salt, 210_000, 32, 'sha256').toString('hex');

describe('Worker password compatibility', () => {
  it('matches existing 210k UTF-8 salt records without native PBKDF2', async () => {
    const native = vi.spyOn(crypto.subtle, 'deriveBits').mockRejectedValue(new DOMException('Native iteration limit', 'NotSupportedError'));
    try {
      expect(equalPasswordHash(await hashPassword(password, salt), reference())).toBe(true);
      expect(native).not.toHaveBeenCalled();
    } finally { native.mockRestore(); }
  });

  it('preserves unicode and long password encoding', async () => {
    const input = 'șț🔒'.repeat(40);
    const expected = pbkdf2Sync(input, salt, 210_000, 32, 'sha256').toString('hex');
    expect(equalPasswordHash(await hashPassword(input, salt), expected)).toBe(true);
  });

  it('rejects incorrect and malformed hashes', async () => {
    const actual = await hashPassword('wrong password', salt);
    expect(equalPasswordHash(actual, reference())).toBe(false);
    expect(equalPasswordHash(actual, '')).toBe(false);
    expect(equalPasswordHash(actual, 'x'.repeat(64))).toBe(false);
  });

  it.each([true, false])('login accepts only the correct password (%s)', async correct => {
    const writes: string[] = [];
    const account = { id: 'test', email: 'alex@accounts.cozyalco.invalid', display_name: 'Test', role: 'admin', salt, password_hash: reference() };
    const env = {
      DB: { prepare(sql: string) { return { bind() { return this; }, async first() { return account; }, async run() { writes.push(sql); return {}; } }; } },
      ASSETS: { fetch: async () => new Response('') },
    };
    const response = await worker.fetch(new Request('https://test.invalid/api/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'alex', password: correct ? password : 'wrong' }),
    }), env);
    expect(response.status).toBe(correct ? 200 : 401);
    expect(writes.length).toBe(correct ? 1 : 0);
    expect(writes.every(sql => sql.startsWith('INSERT INTO sessions'))).toBe(true);
    expect(Boolean(response.headers.get('set-cookie'))).toBe(correct);
    const body = await response.text();
    expect(body.includes('password_hash')).toBe(false);
    expect(body.includes(account.password_hash)).toBe(false);
    expect(body.includes(password)).toBe(false);
  });
});
