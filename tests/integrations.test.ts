import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash, createHmac } from 'node:crypto';
import { handleIntegrations, seal, unseal, shopDomain, shopifyHmac } from '../src/integrations';

const origin = 'https://studio.test';
const admin = { id: 'admin', role: 'admin' };
const sessionToken = 'synthetic-session';
const token = 'synthetic-provider-access';
const secret = 'synthetic-client-secret';
let db: DatabaseSync;
let env: any;
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
function adapter(database: DatabaseSync) {
  return { prepare(sql: string) {
    let args: any[] = [];
    return {
      bind(...values: any[]) { args = values; return this; },
      async first() { return database.prepare(sql).get(...args) || null; },
      async all() { return { results: database.prepare(sql).all(...args) }; },
      async run() { const result = database.prepare(sql).run(...args); return { meta: { changes: Number(result.changes) } }; },
    };
  } };
}
const handle = (req: Request, user: any = admin) => handleIntegrations(req, env, async () => user) as Promise<Response>;
function post(path: string, body = {}, requestOrigin = origin) {
  return new Request(`${origin}/api/integrations/${path}`, { method: 'POST', headers: { origin: requestOrigin, 'content-type': 'application/json', cookie: `cs_session=${sessionToken}` }, body: JSON.stringify(body) });
}
async function begin(provider: string, shop?: string) {
  const response = await handle(post(`${provider}/connect`, { shop }));
  expect(response.status).toBe(200);
  const url = new URL((await response.json()).url);
  const cookie = response.headers.get('set-cookie')!.split(';')[0];
  return { url, cookie, state: url.searchParams.get('state')! };
}
function returnRequest(provider: string, state: string, cookie: string, additions: Record<string, string> = {}) {
  const url = new URL(`${origin}/api/integrations/callback/${provider}`);
  url.search = new URLSearchParams({ code: 'synthetic-code', state, ...additions }).toString();
  if (provider === 'shopify') {
    const message = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('&');
    url.searchParams.set('hmac', createHmac('sha256', secret).update(message).digest('hex'));
  }
  return new Request(url, { headers: { cookie } });
}
function reply(data: any) { return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } }); }
beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec(readFileSync('migrations/0001_init.sql', 'utf8'));
  db.exec(readFileSync('migrations/0002_integrations.sql', 'utf8'));
  db.prepare('INSERT INTO users(id,email,display_name,password_hash,salt,role) VALUES(?,?,?,?,?,?)').run(admin.id, 'synthetic@example.invalid', 'Test', 'not-a-real-hash', 'test', 'admin');
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(hash(sessionToken), admin.id, Date.now() + 600000);
  db.prepare('INSERT INTO workspace(id,data,revision) VALUES(1,?,7)').run('{"keep":"existing workspace"}');
  env = { DB: adapter(db), INTEGRATION_ORIGIN: origin, INTEGRATION_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    SHOPIFY_CLIENT_ID: 'synthetic', SHOPIFY_CLIENT_SECRET: secret, META_APP_ID: 'synthetic', META_APP_SECRET: secret,
    TIKTOK_CLIENT_KEY: 'synthetic', TIKTOK_CLIENT_SECRET: secret, ETSY_CLIENT_ID: 'synthetic', ETSY_SHARED_SECRET: secret };
});
afterEach(() => { vi.restoreAllMocks(); db.close(); });

describe('integration security', () => {
  it('encrypts tokens with account-bound authenticated encryption', async () => {
    const cipher = await seal(env, 'shopify:a', { access_token: token });
    expect(cipher.includes(token)).toBe(false);
    expect(await unseal(env, 'shopify:a', cipher)).toEqual({ access_token: token });
    await expect(unseal(env, 'shopify:b', cipher)).rejects.toThrow();
    await expect(unseal(env, 'shopify:a', cipher.slice(0, -4) + 'AAAA')).rejects.toThrow();
  });
  it('rejects arbitrary hosts, URLs and credential-bearing domains', () => {
    for (const value of ['cozyalco.co.uk', 'https://a.myshopify.com', 'a.myshopify.com/evil', 'a.myshopify.com.evil.test', 'user@a.myshopify.com', 'localhost']) expect(() => shopDomain(value)).toThrow();
    expect(shopDomain('EXAMPLE.myshopify.com')).toBe('example.myshopify.com');
  });
  it('requires administrator access and same-origin mutations', async () => {
    expect((await handle(post('etsy/connect'), null)).status).toBe(401);
    expect((await handle(post('etsy/connect'), { ...admin, role: 'member' })).status).toBe(403);
    expect((await handle(post('etsy/connect', {}, 'https://attacker.invalid'))).status).toBe(403);
    expect(db.prepare('SELECT count(*) AS n FROM integration_oauth_states').get()!.n).toBe(0);
  });
  it('handles missing setup without pretending a connection exists', async () => {
    delete env.ETSY_CLIENT_ID;
    const status = await (await handle(new Request(`${origin}/api/integrations`))).json();
    expect(status.providers.find((p: any) => p.id === 'etsy').ready).toBe(false);
    expect(status.accounts).toEqual([]);
    expect((await handle(post('etsy/connect'))).status).toBe(503);
  });
  it('prefills the configured store and prevents connecting a different shop', async () => {
    env.SHOPIFY_SHOP = 'configured.myshopify.com';
    const status = await (await handle(new Request(`${origin}/api/integrations`))).json();
    expect(status.shopifyShop).toBe('configured.myshopify.com');
    const flow = await begin('shopify');
    expect(flow.url.hostname).toBe('configured.myshopify.com');
    const response = await handle(post('shopify/connect', { shop: 'other.myshopify.com' }));
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('shop_not_allowed');
    expect(db.prepare('SELECT count(*) AS n FROM integration_oauth_states').get()!.n).toBe(1);
  });
  it('rejects callbacks from a different browser and after logout or expiry', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch');
    const flow = await begin('etsy');
    const mismatch = await handle(returnRequest('etsy', flow.state, 'cs_oauth_etsy=wrong'));
    expect(mismatch.headers.get('location')).toContain('invalid_authorization');
    db.prepare('DELETE FROM sessions').run();
    const loggedOut = await handle(returnRequest('etsy', flow.state, flow.cookie));
    expect(loggedOut.headers.get('location')).toContain('invalid_authorization');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not exchange cancelled authorizations', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch');
    const flow = await begin('etsy');
    const response = await handle(returnRequest('etsy', flow.state, flow.cookie, { error: 'access_denied' }));
    expect(response.headers.get('location')).toContain('authorization_cancelled');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects expired states and administrators whose role was removed', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch');
    const expired = await begin('etsy');
    db.prepare('UPDATE integration_oauth_states SET expires_at=?').run(Date.now() - 1);
    expect((await handle(returnRequest('etsy', expired.state, expired.cookie))).headers.get('location')).toContain('invalid_authorization');
    const demoted = await begin('etsy');
    db.prepare("UPDATE users SET role='member'").run();
    expect((await handle(returnRequest('etsy', demoted.state, demoted.cookie))).headers.get('location')).toContain('invalid_authorization');
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('provider connections with synthetic responses', () => {
  it('reports only a fixed callback stage when the runtime throws', async () => {
    const flow = await begin('etsy');
    const prepare = env.DB.prepare;
    env.DB.prepare = (sql: string) => {
      if (sql.startsWith('DELETE FROM integration_oauth_states')) throw new Error('Synthetic confidential details must not escape');
      return prepare(sql);
    };
    const result = await handle(returnRequest('etsy', flow.state, flow.cookie));
    expect(result.headers.get('location')).toContain('connection_failed_consume_state');
    expect(result.headers.get('location')).not.toContain('confidential');
  });
  it('connects Shopify, reads products and prevents callback replay without changing workspace', async () => {
    const flow = await begin('shopify', 'synthetic.myshopify.com');
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(reply({ access_token: token, scope: 'read_products' }))
      .mockResolvedValueOnce(reply({ data: { shop: { name: 'Synthetic shop', myshopifyDomain: 'synthetic.myshopify.com', primaryDomain: { url: 'https://example.invalid' } } } }))
      .mockResolvedValueOnce(reply({ data: { products: { nodes: [{ id: 'product-1', title: 'Candle', status: 'ACTIVE', totalInventory: 4 }], pageInfo: { hasNextPage: true } } } }));
    const callback = returnRequest('shopify', flow.state, flow.cookie, { shop: 'synthetic.myshopify.com', timestamp: String(Math.floor(Date.now() / 1000)) });
    const result = await handle(callback);
    expect(result.headers.get('location')).toContain('connection=connected');
    expect(result.headers.get('referrer-policy')).toBe('no-referrer');
    const row = db.prepare('SELECT * FROM integration_accounts').get()!;
    expect(row.token_ciphertext).not.toContain(token);
    const statusText = await (await handle(new Request(`${origin}/api/integrations`))).text();
    expect(statusText).not.toContain(token);
    expect(statusText).not.toContain('token_ciphertext');
    const data = await (await handle(post('shopify/synthetic.myshopify.com/preview'))).json();
    expect(data.items[0].title).toBe('Candle');
    expect(data.hasMore).toBe(true);
    expect(db.prepare('SELECT revision,data FROM workspace').get()).toMatchObject({ revision: 7, data: '{"keep":"existing workspace"}' });
    const replay = await handle(new Request(callback));
    expect(replay.headers.get('location')).toContain('invalid_authorization');
    expect(fetcher).toHaveBeenCalledTimes(3);
    await handle(post('shopify/synthetic.myshopify.com/disconnect'));
    expect(db.prepare('SELECT count(*) AS n FROM integration_accounts').get()!.n).toBe(0);
  });
  it('rejects modified Shopify HMAC and duplicate parameters', async () => {
    const flow = await begin('shopify', 'synthetic.myshopify.com');
    const callback = returnRequest('shopify', flow.state, flow.cookie, { shop: 'synthetic.myshopify.com', timestamp: String(Math.floor(Date.now() / 1000)) });
    const url = new URL(callback.url); url.searchParams.set('code', 'tampered');
    expect(await shopifyHmac(url.searchParams, secret)).toBe(false);
    url.searchParams.append('shop', 'another.myshopify.com');
    expect(await shopifyHmac(url.searchParams, secret)).toBe(false);
    const fetcher = vi.spyOn(globalThis, 'fetch');
    expect((await handle(new Request(url, { headers: { cookie: flow.cookie } }))).headers.get('location')).toContain('invalid_authorization');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('uses Etsy PKCE and renews expiring tokens server-side', async () => {
    const flow = await begin('etsy');
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(reply({ access_token: '123.synthetic', refresh_token: 'synthetic-refresh', expires_in: 1 }))
      .mockResolvedValueOnce(reply({ shop_id: 55, shop_name: 'Synthetic Etsy' }))
      .mockResolvedValueOnce(reply({ access_token: '123.refreshed', refresh_token: 'rotated-refresh', expires_in: 3600 }))
      .mockResolvedValueOnce(reply({ count: 1, results: [{ listing_id: 1, title: 'Candle', quantity: 3 }] }));
    const response = await handle(returnRequest('etsy', flow.state, flow.cookie));
    expect(response.headers.get('location')).toContain('connection=connected');
    const sent = fetcher.mock.calls[0][1]!.body as URLSearchParams;
    const verifier = sent.get('code_verifier')!;
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(flow.url.searchParams.get('code_challenge'));
    const preview = await (await handle(post('etsy/55/preview'))).json();
    expect(preview.items[0].title).toBe('Candle');
    expect((fetcher.mock.calls[2][1]!.body as URLSearchParams).get('grant_type')).toBe('refresh_token');
    expect((await unseal<any>(env, 'etsy:55', db.prepare('SELECT token_ciphertext FROM integration_accounts').get()!.token_ciphertext as string)).access_token).toBe('123.refreshed');
  });
  it('connects TikTok and returns only selected display fields', async () => {
    const flow = await begin('tiktok');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(reply({ access_token: token, expires_in: 3600, scope: 'user.info.basic,video.list' }))
      .mockResolvedValueOnce(reply({ data: { user: { open_id: 'creator1', display_name: 'Creator' } }, error: { code: 'ok' } }))
      .mockResolvedValueOnce(reply({ data: { has_more: false, videos: [{ id: 'v1', title: 'Pouring', view_count: 10, like_count: 2, comment_count: 1, share_count: 0, access_token: 'must-not-leak' }] }, error: { code: 'ok' } }));
    expect((await handle(returnRequest('tiktok', flow.state, flow.cookie))).headers.get('location')).toContain('connection=connected');
    const data = await (await handle(post('tiktok/creator1/preview'))).json();
    expect(data.items[0].detail).toContain('10 views');
    expect(JSON.stringify(data)).not.toContain('must-not-leak');
  });
  it('does not mark TikTok connected when the user denies video access', async () => {
    const flow = await begin('tiktok');
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(reply({ access_token: token, expires_in: 3600, scope: 'user.info.basic' }));
    expect((await handle(returnRequest('tiktok', flow.state, flow.cookie))).headers.get('location')).toContain('permissions_required');
    expect(db.prepare('SELECT count(*) AS n FROM integration_accounts').get()!.n).toBe(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('discovers Facebook Pages and linked professional Instagram accounts', async () => {
    const flow = await begin('meta');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(reply({ access_token: 'short-lived', expires_in: 3600 }))
      .mockResolvedValueOnce(reply({ access_token: 'long-lived', expires_in: 5184000 }))
      .mockResolvedValueOnce(reply({ data: [{ id: 'page1', name: 'Studio', access_token: token, instagram_business_account: { id: 'ig1', username: 'studio' } }] }));
    expect((await handle(returnRequest('meta', flow.state, flow.cookie))).headers.get('location')).toContain('connection=connected');
    const rows = db.prepare('SELECT provider,account_id FROM integration_accounts ORDER BY provider').all();
    expect(rows).toEqual([{ provider: 'facebook', account_id: 'page1' }, { provider: 'instagram', account_id: 'ig1' }]);
  });
  it('redacts upstream errors and request credentials', async () => {
    const flow = await begin('etsy');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: token } }), { status: 500 }));
    const result = await handle(returnRequest('etsy', flow.state, flow.cookie));
    expect(result.headers.get('location')).toContain('provider_request_failed');
    expect(result.headers.get('location')).not.toContain(token);
  });
});
