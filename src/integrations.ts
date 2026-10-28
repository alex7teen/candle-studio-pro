// Provider tokens never enter the browser or the workspace JSON/export.
export interface IntegrationEnv {
  DB: any;
  INTEGRATION_ORIGIN?: string;
  INTEGRATION_ENCRYPTION_KEY?: string;
  SHOPIFY_CLIENT_ID?: string;
  SHOPIFY_CLIENT_SECRET?: string;
  META_APP_ID?: string;
  META_APP_SECRET?: string;
  META_GRAPH_VERSION?: string;
  TIKTOK_CLIENT_KEY?: string;
  TIKTOK_CLIENT_SECRET?: string;
  ETSY_CLIENT_ID?: string;
  ETSY_SHARED_SECRET?: string;
}
type Provider = 'shopify' | 'meta' | 'tiktok' | 'etsy';
type AccountProvider = Exclude<Provider, 'meta'> | 'facebook' | 'instagram';
type Admin = { id: string; role: string };
type Token = { access_token: string; refresh_token?: string; expires_at?: number; scope?: string };
type Account = { provider: AccountProvider; account_id: string; name: string; metadata: string; token_ciphertext: string; updated_at: number };
type State = { user_id: string; session_hash: string; browser_hash: string; payload_ciphertext: string };
const enc = new TextEncoder();
const ids: Provider[] = ['shopify', 'meta', 'tiktok', 'etsy'];
const accountProviders: AccountProvider[] = ['shopify', 'facebook', 'instagram', 'tiktok', 'etsy'];
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});
class IntegrationError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
const fail = (code: string, status = 400): never => { throw new IntegrationError(code, status); };
const hex = (value: Uint8Array) => Array.from(value, b => b.toString(16).padStart(2, '0')).join('');
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const digest = async (value: string) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(value))));
function b64(value: Uint8Array) { return btoa(String.fromCharCode(...value)); }
function unb64(value: string) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
async function cipherKey(env: IntegrationEnv) {
  let bytes = new Uint8Array(0);
  try { bytes = unb64(env.INTEGRATION_ENCRYPTION_KEY || ''); } catch { return fail('setup_required', 503); }
  if (bytes.length !== 32) return fail('setup_required', 503);
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function seal(env: IntegrationEnv, context: string, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(context) }, await cipherKey(env), enc.encode(JSON.stringify(value)));
  return `v1.${b64(iv)}.${b64(new Uint8Array(data))}`;
}
export async function unseal<T>(env: IntegrationEnv, context: string, value: string): Promise<T> {
  const [version, iv, data] = value.split('.');
  if (version !== 'v1' || !iv || !data) return fail('stored_connection_invalid', 503);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv), additionalData: enc.encode(context) }, await cipherKey(env), unb64(data));
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}
export function shopDomain(value: unknown): string {
  const shop = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop) || shop.length > 253) return fail('shop_domain_required');
  return shop;
}
function origin(env: IntegrationEnv): string {
  try {
    const url = new URL(env.INTEGRATION_ORIGIN || '');
    if (url.protocol !== 'https:' || url.origin !== env.INTEGRATION_ORIGIN) return fail('setup_required', 503);
    return url.origin;
  } catch { return fail('setup_required', 503); }
}
function metaVersion(env: IntegrationEnv) {
  // Pin a supported version rather than letting provider changes alter behavior.
  const version = env.META_GRAPH_VERSION || 'v24.0';
  if (!/^v\d{2}\.0$/.test(version)) return fail('setup_required', 503);
  return version;
}
const callback = (env: IntegrationEnv, p: Provider) => `${origin(env)}/api/integrations/callback/${p}`;
function configured(env: IntegrationEnv, p: Provider) {
  const common = Boolean(env.INTEGRATION_ORIGIN && env.INTEGRATION_ENCRYPTION_KEY);
  return common && (p === 'shopify' ? Boolean(env.SHOPIFY_CLIENT_ID && env.SHOPIFY_CLIENT_SECRET)
    : p === 'meta' ? Boolean(env.META_APP_ID && env.META_APP_SECRET)
    : p === 'tiktok' ? Boolean(env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET)
    : Boolean(env.ETSY_CLIENT_ID && env.ETSY_SHARED_SECRET));
}
function browserCookie(p: Provider, value: string, age = 600) {
  return `cs_oauth_${p}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/api/integrations/callback/${p}; Max-Age=${age}`;
}
function readCookie(req: Request, name: string) {
  return req.headers.get('cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith(name + '='))?.slice(name.length + 1) || '';
}
async function remote(url: string, init: RequestInit = {}): Promise<any> {
  // Fixed provider hosts only; do not follow redirects carrying credentials.
  const res = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(15000) });
  let data: any;
  try { data = await res.json(); } catch { return fail('provider_unavailable', 502); }
  if (!res.ok || data.errors || data.error && data.error.code !== 'ok') {
    if (res.status === 429) return fail('provider_rate_limited', 429);
    if (res.status === 401 || res.status === 403 || data.error?.code === 190) return fail('reconnect_required', 409);
    return fail('provider_request_failed', 502);
  }
  return data;
}
const form = (data: Record<string, string>): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(data) });
async function metaToken(base: string, parameters: Record<string, string>) {
  // Meta documents GET for this endpoint. Never log this credential-bearing URL.
  return tokenData(await remote(`${base}/oauth/access_token?${new URLSearchParams(parameters)}`));
}
function tokenData(data: any): Token {
  if (typeof data.access_token !== 'string' || !data.access_token) return fail('provider_request_failed', 502);
  return { access_token: data.access_token, refresh_token: typeof data.refresh_token === 'string' ? data.refresh_token : undefined,
    expires_at: Number(data.expires_in) > 0 ? Date.now() + Number(data.expires_in) * 1000 : undefined,
    scope: typeof data.scope === 'string' ? data.scope : undefined };
}
async function storeAccount(env: IntegrationEnv, user: string, provider: AccountProvider, id: string, name: string, token: Token, metadata: object = {}) {
  if (!id || !name) return fail('provider_request_failed', 502);
  const context = `${provider}:${id}`;
  const cipher = await seal(env, context, token);
  await env.DB.prepare(`INSERT INTO integration_accounts(provider,account_id,name,metadata,token_ciphertext,connected_by,connected_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(provider,account_id) DO UPDATE SET name=excluded.name,metadata=excluded.metadata,
    token_ciphertext=excluded.token_ciphertext,connected_by=excluded.connected_by,updated_at=excluded.updated_at`)
    .bind(provider, id, name.slice(0, 200), JSON.stringify(metadata), cipher, user, Date.now(), Date.now()).run();
}
export async function shopifyHmac(params: URLSearchParams, secret: string): Promise<boolean> {
  const actual = params.get('hmac') || '';
  if (!/^[a-f0-9]{64}$/.test(actual)) return false;
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length) return false;
  const message = [...params.entries()].filter(([k]) => k !== 'hmac').sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${k}=${v}`).join('&');
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, Uint8Array.from(actual.match(/../g)!, x => parseInt(x, 16)), enc.encode(message));
}
async function start(req: Request, env: IntegrationEnv, user: Admin, provider: Provider) {
  if (!configured(env, provider)) return fail('setup_required', 503);
  if (req.headers.get('origin') !== origin(env)) return fail('invalid_origin', 403);
  const body = await req.json() as { shop?: string };
  const shop = provider === 'shopify' ? shopDomain(body.shop) : '';
  const state = random(), browser = random(), verifier = random();
  const stateHash = await digest(state);
  const sessionToken = readCookie(req, 'cs_session');
  if (!sessionToken) return fail('not_signed_in', 401);
  await cipherKey(env);
  await env.DB.prepare('DELETE FROM integration_oauth_states WHERE expires_at<?').bind(Date.now()).run();
  await env.DB.prepare('INSERT INTO integration_oauth_states(state_hash,provider,user_id,session_hash,browser_hash,payload_ciphertext,expires_at) VALUES(?,?,?,?,?,?,?)')
    .bind(stateHash, provider, user.id, await digest(sessionToken), await digest(browser), await seal(env, `state:${stateHash}`, { shop, verifier }), Date.now() + 600000).run();
  let url: URL;
  const redirect = callback(env, provider);
  if (provider === 'shopify') {
    url = new URL(`https://${shop}/admin/oauth/authorize`);
    url.search = new URLSearchParams({ client_id: env.SHOPIFY_CLIENT_ID!, scope: 'read_products', redirect_uri: redirect, state }).toString();
  } else if (provider === 'meta') {
    url = new URL(`https://www.facebook.com/${metaVersion(env)}/dialog/oauth`);
    url.search = new URLSearchParams({ client_id: env.META_APP_ID!, redirect_uri: redirect, state, response_type: 'code', scope: 'pages_show_list,pages_read_engagement,instagram_basic' }).toString();
  } else if (provider === 'tiktok') {
    url = new URL('https://www.tiktok.com/v2/auth/authorize/');
    url.search = new URLSearchParams({ client_key: env.TIKTOK_CLIENT_KEY!, redirect_uri: redirect, state, response_type: 'code', scope: 'user.info.basic,video.list' }).toString();
  } else {
    url = new URL('https://www.etsy.com/oauth/connect');
    const challenge = b64(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(verifier)))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    url.search = new URLSearchParams({ client_id: env.ETSY_CLIENT_ID!, redirect_uri: redirect, state, response_type: 'code', scope: 'shops_r listings_r', code_challenge: challenge, code_challenge_method: 'S256' }).toString();
  }
  const response = json({ url: url.toString() });
  response.headers.set('set-cookie', browserCookie(provider, browser));
  return response;
}
async function complete(req: Request, env: IntegrationEnv, provider: Provider) {
  if (!configured(env, provider)) return fail('setup_required', 503);
  const url = new URL(req.url), params = url.searchParams;
  if (params.getAll('state').length !== 1 || params.getAll('code').length > 1) return fail('invalid_authorization', 400);
  const raw = params.get('state') || '', browser = readCookie(req, `cs_oauth_${provider}`);
  if (!/^[a-f0-9]{64}$/.test(raw) || !browser) return fail('invalid_authorization', 400);
  const stateHash = await digest(raw);
  // Atomic consumption prevents replay. The initiating session must still exist,
  // even when its Strict cookie is omitted on the provider's cross-site return.
  const state = await env.DB.prepare(`DELETE FROM integration_oauth_states WHERE state_hash=? AND provider=? AND browser_hash=? AND expires_at>?
    AND EXISTS (SELECT 1 FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=integration_oauth_states.session_hash
      AND users.id=integration_oauth_states.user_id AND users.role='admin' AND sessions.expires_at>?) RETURNING *`)
    .bind(stateHash, provider, await digest(browser), Date.now(), Date.now()).first() as State | null;
  if (!state) return fail('invalid_authorization', 400);
  if (params.has('error')) return fail('authorization_cancelled');
  const code = params.get('code');
  if (!code || code.length > 4096) return fail('invalid_authorization');
  const saved = await unseal<{ shop: string; verifier: string }>(env, `state:${stateHash}`, state.payload_ciphertext);
  const redirect = callback(env, provider);
  if (provider === 'shopify') {
    const shop = shopDomain(params.get('shop'));
    if (shop !== saved.shop || !await shopifyHmac(params, env.SHOPIFY_CLIENT_SECRET!)) return fail('invalid_authorization');
    const timestamp = Number(params.get('timestamp')) * 1000;
    if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 600000) return fail('invalid_authorization');
    const token = tokenData(await remote(`https://${shop}/admin/oauth/access_token`, form({ client_id: env.SHOPIFY_CLIENT_ID!, client_secret: env.SHOPIFY_CLIENT_SECRET!, code })));
    if (!token.scope?.split(',').includes('read_products')) return fail('permissions_required', 403);
    const info = await shopify(env, shop, token, '{shop{name myshopifyDomain primaryDomain{url}}}');
    await storeAccount(env, state.user_id, 'shopify', shop, info.shop.name, token, { domain: info.shop.primaryDomain?.url });
  } else if (provider === 'meta') {
    const base = `https://graph.facebook.com/${metaVersion(env)}`;
    const initial = await metaToken(base, { client_id: env.META_APP_ID!, client_secret: env.META_APP_SECRET!, redirect_uri: redirect, code });
    const token = await metaToken(base, { client_id: env.META_APP_ID!, client_secret: env.META_APP_SECRET!, grant_type: 'fb_exchange_token', fb_exchange_token: initial.access_token });
    const pages = await remote(`${base}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&limit=100`, { headers: { authorization: `Bearer ${token.access_token}` } });
    if (!pages.data?.length) return fail('no_eligible_accounts', 409);
    // Discover Pages explicitly granted by the user. No arbitrary account IDs.
    for (const page of pages.data) {
      if (typeof page.id !== 'string' || typeof page.access_token !== 'string') continue;
      const pageToken = { ...token, access_token: page.access_token, refresh_token: undefined };
      await storeAccount(env, state.user_id, 'facebook', page.id, page.name, pageToken);
      if (page.instagram_business_account?.id) await storeAccount(env, state.user_id, 'instagram', page.instagram_business_account.id,
        page.instagram_business_account.username || page.name, pageToken, { pageId: page.id });
    }
  } else if (provider === 'tiktok') {
    const token = tokenData(await remote('https://open.tiktokapis.com/v2/oauth/token/', form({ client_key: env.TIKTOK_CLIENT_KEY!, client_secret: env.TIKTOK_CLIENT_SECRET!, grant_type: 'authorization_code', code, redirect_uri: redirect })));
    const granted = token.scope?.split(',') || [];
    if (!['user.info.basic', 'video.list'].every(scope => granted.includes(scope))) return fail('permissions_required', 403);
    const info = await remote('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name', { headers: { authorization: `Bearer ${token.access_token}` } });
    if (!info.data?.user?.open_id) return fail('provider_request_failed', 502);
    await storeAccount(env, state.user_id, 'tiktok', info.data.user.open_id, info.data.user.display_name, token);
  } else {
    const token = tokenData(await remote('https://api.etsy.com/v3/public/oauth/token', form({ client_id: env.ETSY_CLIENT_ID!, grant_type: 'authorization_code', code, redirect_uri: redirect, code_verifier: saved.verifier })));
    const userId = token.access_token.split('.')[0];
    if (!/^\d+$/.test(userId)) return fail('provider_request_failed', 502);
    const shop = await etsy(env, token, `users/${userId}/shops`);
    if (!shop.shop_id) return fail('no_eligible_accounts', 409);
    await storeAccount(env, state.user_id, 'etsy', String(shop.shop_id), shop.shop_name, token);
  }
  return redirectResult(env, provider, 'connected');
}
function redirectResult(env: IntegrationEnv, p: Provider, result: string) {
  const url = new URL('/settings', origin(env));
  url.search = new URLSearchParams({ provider: p, connection: result }).toString();
  return new Response(null, { status: 303, headers: { location: url.toString(), 'set-cookie': browserCookie(p, '', 0), 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
}
async function shopify(_env: IntegrationEnv, shop: string, token: Token, query: string) {
  const response = await remote(`https://${shopDomain(shop)}/admin/api/2026-10/graphql.json`, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Shopify-Access-Token': token.access_token }, body: JSON.stringify({ query }) });
  if (!response.data) return fail('provider_request_failed', 502);
  return response.data;
}
async function etsy(env: IntegrationEnv, token: Token, path: string) {
  return remote(`https://openapi.etsy.com/v3/application/${path}`, { headers: { authorization: `Bearer ${token.access_token}`, 'x-api-key': `${env.ETSY_CLIENT_ID}:${env.ETSY_SHARED_SECRET}` } });
}
async function activeToken(env: IntegrationEnv, account: Account): Promise<Token> {
  const context = `${account.provider}:${account.account_id}`;
  const token = await unseal<Token>(env, context, account.token_ciphertext);
  if (!token.expires_at || token.expires_at > Date.now() + 120000) return token;
  if (!token.refresh_token) return fail('reconnect_required', 409);
  let refreshed: any;
  if (account.provider === 'tiktok') refreshed = await remote('https://open.tiktokapis.com/v2/oauth/token/', form({ client_key: env.TIKTOK_CLIENT_KEY!, client_secret: env.TIKTOK_CLIENT_SECRET!, grant_type: 'refresh_token', refresh_token: token.refresh_token }));
  else if (account.provider === 'etsy') refreshed = await remote('https://api.etsy.com/v3/public/oauth/token', form({ client_id: env.ETSY_CLIENT_ID!, grant_type: 'refresh_token', refresh_token: token.refresh_token }));
  else if (account.provider === 'shopify') refreshed = await remote(`https://${shopDomain(account.account_id)}/admin/oauth/access_token`, form({ client_id: env.SHOPIFY_CLIENT_ID!, client_secret: env.SHOPIFY_CLIENT_SECRET!, grant_type: 'refresh_token', refresh_token: token.refresh_token }));
  else return fail('reconnect_required', 409);
  const next = tokenData(refreshed);
  next.refresh_token ||= token.refresh_token;
  next.scope ||= token.scope;
  // A concurrent disconnect must not be undone by token refresh.
  const result = await env.DB.prepare('UPDATE integration_accounts SET token_ciphertext=?,updated_at=? WHERE provider=? AND account_id=? AND token_ciphertext=?')
    .bind(await seal(env, context, next), Date.now(), account.provider, account.account_id, account.token_ciphertext).run();
  if (!result.meta?.changes) return fail('connection_changed', 409);
  return next;
}
async function preview(env: IntegrationEnv, account: Account) {
  const token = await activeToken(env, account);
  if (account.provider === 'shopify') {
    const data = await shopify(env, account.account_id, token, '{products(first:20,sortKey:UPDATED_AT,reverse:true){nodes{id title status totalInventory} pageInfo{hasNextPage}}}');
    return { kind: 'products', hasMore: data.products.pageInfo.hasNextPage, items: data.products.nodes.map((p: any) => ({ id: p.id, title: p.title, detail: `${p.status} · ${p.totalInventory ?? '—'} in stock` })) };
  }
  if (account.provider === 'etsy') {
    const data = await etsy(env, token, `shops/${encodeURIComponent(account.account_id)}/listings/active?limit=20`);
    return { kind: 'listings', hasMore: data.count > 20, items: (data.results || []).map((p: any) => ({ id: String(p.listing_id), title: p.title, detail: `${p.quantity} available` })) };
  }
  if (account.provider === 'tiktok') {
    const data = await remote('https://open.tiktokapis.com/v2/video/list/?fields=id,title,view_count,like_count,comment_count,share_count', { method: 'POST', headers: { authorization: `Bearer ${token.access_token}`, 'content-type': 'application/json' }, body: JSON.stringify({ max_count: 20 }) });
    return { kind: 'videos', hasMore: Boolean(data.data?.has_more), items: (data.data?.videos || []).map((v: any) => ({ id: v.id, title: v.title || 'Video', detail: `${v.view_count ?? '—'} views · ${v.like_count ?? '—'} likes · ${v.comment_count ?? '—'} comments · ${v.share_count ?? '—'} shares` })) };
  }
  const base = `https://graph.facebook.com/${metaVersion(env)}/${encodeURIComponent(account.account_id)}`;
  if (account.provider === 'instagram') {
    const data = await remote(`${base}/media?fields=id,caption,like_count,comments_count&limit=20`, { headers: { authorization: `Bearer ${token.access_token}` } });
    return { kind: 'posts', hasMore: Boolean(data.paging?.next), items: (data.data || []).map((p: any) => ({ id: p.id, title: p.caption || 'Instagram post', detail: `${p.like_count ?? '—'} likes · ${p.comments_count ?? '—'} comments` })) };
  }
  const data = await remote(`${base}/posts?fields=id,message,created_time&limit=20`, { headers: { authorization: `Bearer ${token.access_token}` } });
  return { kind: 'posts', hasMore: Boolean(data.paging?.next), items: (data.data || []).map((p: any) => ({ id: p.id, title: p.message || 'Facebook post', detail: p.created_time })) };
}
export async function handleIntegrations(req: Request, env: IntegrationEnv, getUser: () => Promise<Admin | null>): Promise<Response | null> {
  const url = new URL(req.url);
  if (!url.pathname.startsWith('/api/integrations')) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  const provider = parts[3] as Provider;
  try {
    if (parts[2] === 'callback' && ids.includes(provider) && req.method === 'GET') {
      if (url.origin !== origin(env)) return fail('invalid_origin', 403);
      try { return await complete(req, env, provider); }
      catch (error) { return redirectResult(env, provider, error instanceof IntegrationError ? error.code : 'connection_failed'); }
    }
    const user = await getUser();
    if (!user) return json({ error: 'Not signed in', code: 'not_signed_in' }, 401);
    if (user.role !== 'admin') return json({ error: 'Administrator access required', code: 'admin_required' }, 403);
    if (req.method === 'POST' && req.headers.get('origin') !== origin(env)) return fail('invalid_origin', 403);
    if (parts.length === 2 && req.method === 'GET') {
      let accounts: any[] = [];
      let schemaReady = true;
      try { accounts = (await env.DB.prepare('SELECT provider,account_id,name,connected_at,updated_at FROM integration_accounts ORDER BY provider,name').all()).results || []; }
      catch { schemaReady = false; }
      return json({ schemaReady, providers: ids.map(id => ({ id, ready: schemaReady && configured(env, id) })), accounts });
    }
    if (parts.length === 4 && parts[3] === 'connect' && ids.includes(parts[2] as Provider) && req.method === 'POST') return await start(req, env, user, parts[2] as Provider);
    if (parts.length === 5 && accountProviders.includes(parts[2] as AccountProvider) && req.method === 'POST') {
      const p = parts[2] as AccountProvider, id = decodeURIComponent(parts[3]);
      if (parts[4] === 'disconnect') {
        await env.DB.prepare('DELETE FROM integration_accounts WHERE provider=? AND account_id=?').bind(p, id).run();
        return json({ ok: true });
      }
      if (parts[4] === 'preview') {
        const account = await env.DB.prepare('SELECT * FROM integration_accounts WHERE provider=? AND account_id=?').bind(p, id).first() as Account | null;
        if (!account) return fail('connection_not_found', 404);
        return json(await preview(env, account));
      }
    }
    return json({ error: 'Not found' }, 404);
  } catch (error) {
    // Never log provider responses, request URLs, auth codes or token objects.
    const code = error instanceof IntegrationError ? error.code : 'connection_failed';
    return json({ error: 'Connection request could not be completed', code }, error instanceof IntegrationError ? error.status : 503);
  }
}
