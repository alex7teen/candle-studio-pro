import { useEffect, useState } from 'react';
import { api } from './cloud';
import './integrations.css';

type Provider = 'shopify' | 'meta' | 'tiktok' | 'etsy';
type Account = { provider: string; account_id: string; name: string; connected_at: number };
type Status = { schemaReady: boolean; shopifyShop?: string | null; providers: { id: Provider; ready: boolean }[]; accounts: Account[] };
type Preview = { kind: string; hasMore: boolean; items: { id: string; title: string; detail: string }[] };
const channels: { id: string; auth: Provider; name: string; mark: string; description: string }[] = [
  { id: 'shopify', auth: 'shopify', name: 'Shopify', mark: 'S', description: 'View your products and finished product stock from cozyalco.co.uk.' },
  { id: 'instagram', auth: 'meta', name: 'Instagram', mark: '◎', description: 'View posts, likes and comments from a professional account linked to your Facebook Page.' },
  { id: 'facebook', auth: 'meta', name: 'Facebook', mark: 'f', description: 'Connect your business Pages and view their published posts.' },
  { id: 'tiktok', auth: 'tiktok', name: 'TikTok', mark: '♪', description: 'View your public videos, views, likes, comments and shares.' },
  { id: 'etsy', auth: 'etsy', name: 'Etsy', mark: 'E', description: 'Connect your seller account and view active listings and available quantities.' },
];
const messages: Record<string, string> = {
  connection_failed_consume_state: 'The authorization could not be finalized in the database. Reference: consume_state.',
  connection_failed_decrypt_state: 'The authorization could not be decrypted. Please reconnect. Reference: decrypt_state.',
  connection_failed_verify_shopify: 'The Shopify authorization could not be verified. Reference: verify_shopify.',
  connection_failed_exchange_token: 'Shopify could not complete the authorization exchange. Reference: exchange_token.',
  connection_failed_read_shop: 'Shopify authorized access, but store details could not be loaded. Reference: read_shop.',
  connection_failed_save_connection: 'The authorized connection could not be saved. Reference: save_connection.',
  connected: 'Your account is connected. You can now load its latest data.',
  setup_required: 'Account setup is needed before this service can be connected.',
  shop_domain_required: 'Enter the original store address ending in .myshopify.com. Find it in Shopify → Settings → Domains.',
  shop_not_allowed: 'This workspace is configured for a different Shopify store. Use the store shown in Settings.',
  invalid_authorization: 'This authorization expired or could not be verified. Please connect again.',
  authorization_cancelled: 'Authorization was cancelled. Your existing connections have not changed.',
  no_eligible_accounts: 'No eligible business account was found. Check the accounts and permissions selected during authorization.',
  permissions_required: 'The required permissions were not granted. Please connect again and approve access.',
  reconnect_required: 'Access has expired or was revoked. Please reconnect this account.',
  provider_rate_limited: 'This service is busy. Wait a moment and try again.',
  provider_request_failed: 'The service could not provide this data. Check your permissions or reconnect.',
  provider_unavailable: 'The service is temporarily unavailable. Please try again.',
  connection_changed: 'This connection changed in another session. Refresh the page and try again.',
};
async function request(path: string, body: unknown = {}) {
  const response = await fetch('/api/integrations/' + path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(messages[result.code] || 'The connection could not be completed. Please try again.');
  return result;
}
export function IntegrationsPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [shop, setShop] = useState('');
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState('');
  const [previews, setPreviews] = useState<Record<string, Preview>>({});
  const load = async () => {
    const result = await api('integrations') as Status;
    setStatus(result);
    if (result.shopifyShop) setShop(result.shopifyShop);
  };
  useEffect(() => {
    load().catch(() => setError('Connections could not be loaded. Refresh the page or sign in again.'));
    const params = new URLSearchParams(window.location.search);
    const result = params.get('connection');
    if (result) {
      if (result === 'connected') setFeedback(messages.connected);
      else setError(messages[result] || 'The connection could not be completed. Please connect again.');
      params.delete('connection'); params.delete('provider');
      window.history.replaceState(null, '', window.location.pathname + (params.size ? '?' + params : ''));
    }
  }, []);
  async function connect(provider: Provider) {
    setError(''); setFeedback(''); setBusy(provider);
    try {
      const data = await request(`${provider}/connect`, provider === 'shopify' ? { shop } : {});
      // Only our server constructs authorization URLs.
      window.location.assign(data.url);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not connect.'); setBusy(''); }
  }
  async function read(account: Account) {
    const key = `${account.provider}/${encodeURIComponent(account.account_id)}`;
    setBusy(key); setError('');
    try { const data = await request(`${key}/preview`); setPreviews(previous => ({ ...previous, [key]: data })); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load data.'); }
    finally { setBusy(''); }
  }
  async function disconnect(account: Account) {
    if (!window.confirm(`Disconnect ${account.name} from Candle Studio? You can reconnect later. To remove permissions at the service too, revoke Candle Studio in that account's settings.`)) return;
    const key = `${account.provider}/${encodeURIComponent(account.account_id)}`;
    setBusy(key); setError('');
    try {
      await request(`${key}/disconnect`); await load();
      setPreviews(previous => { const next = { ...previous }; delete next[key]; return next; });
      setFeedback(`${account.name} was disconnected from Candle Studio.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not disconnect.'); }
    finally { setBusy(''); }
  }
  return <section className="integrations-section" aria-labelledby="connections-heading">
    <div className="card-title"><div><span className="eyebrow">YOUR CONNECTED BUSINESS</span><h2 id="connections-heading">Shops & social accounts</h2></div><span className="pill">{status ? `${status.accounts.length} connected` : 'Loading…'}</span></div>
    <p className="muted">Connect your accounts, then load their latest products or posts here. Your production records and material stock stay in your shared workspace.</p>
    {error && <p role="alert" className="connection-message connection-error">{error}</p>}
    {feedback && <p role="status" className="connection-message">{feedback}</p>}
    <div className="connection-grid">{channels.map(channel => {
      const ready = status?.providers.find(p => p.id === channel.auth)?.ready;
      const accounts = status?.accounts.filter(a => a.provider === channel.id) || [];
      return <section className="card connection-card" key={channel.id} aria-label={channel.name}>
        <div className="card-title"><div className="connection-brand"><span className={`channel-mark channel-${channel.id}`} aria-hidden="true">{channel.mark}</span><h3>{channel.name}</h3></div><span className="pill">{accounts.length ? 'Connected' : ready ? 'Not connected' : status ? 'Setup needed' : 'Loading…'}</span></div>
        <p className="muted">{channel.description}</p>
        {channel.id === 'shopify' && <label className="form-stack">Shopify store address<input aria-label="Shopify store address" placeholder="your-store.myshopify.com" value={shop} readOnly={Boolean(status?.shopifyShop)} onChange={e => setShop(e.target.value)} autoComplete="off"/><small>{status?.shopifyShop ? 'Your configured Shopify store. Connect below when account setup is complete.' : 'Find your original address in Shopify → Settings → Domains.'} Your public website is cozyalco.co.uk.</small></label>}
        {accounts.map(account => {
          const key = `${account.provider}/${encodeURIComponent(account.account_id)}`, data = previews[key];
          return <div className="connected-account" key={key}>
            <b>{account.name}</b><small>Connected {new Date(account.connected_at).toLocaleDateString('en-GB')}</small>
            <div className="connection-actions"><button className="btn btn-secondary" disabled={Boolean(busy)} onClick={() => read(account)}>{busy === key ? 'Working…' : 'Load latest data'}</button><button className="textlink" disabled={Boolean(busy)} onClick={() => disconnect(account)}>Disconnect</button></div>
            {data && <div className="connection-preview"><p className="hint">Latest {data.items.length} {data.kind}{data.hasMore ? ' · More available at the service' : ''} · Read only</p>{data.items.length ? data.items.map(item => <div className="connection-item" key={item.id}><b>{item.title}</b><small>{item.detail}</small></div>) : <p>No {data.kind} found for this account.</p>}</div>}
          </div>;
        })}
        <button className="btn btn-primary" disabled={!ready || Boolean(busy)} onClick={() => connect(channel.auth)}>{busy === channel.auth ? 'Opening…' : accounts.length ? 'Reconnect / add account' : channel.auth === 'meta' ? 'Connect with Facebook' : `Connect ${channel.name}`}</button>
        {!ready && status && <p className="hint">Candle Studio needs to be registered with this service first. See account setup below.</p>}
      </section>;
    })}</div>
    <details className="card connection-setup"><summary>Account setup & available features</summary><p>Each service needs a registered Candle Studio app before the Connect button can work. Its credentials are configured securely on the server. You will approve access directly on the service’s own website.</p><p>Instagram requires a Business or Creator account linked to a Facebook Page. Select your business Pages during Facebook authorization. TikTok needs Login Kit and Display API approval; Etsy needs an approved API application.</p><p>This first connection supports viewing products, listings and posts. It does not publish content, import orders, or change stock at your shops. Those actions need additional permissions and product matching.</p><p>Account access stays on the server and is excluded from workspace backups. Disconnect removes the saved connection here; revoke the app in the service’s settings to withdraw its permissions too.</p></details>
  </section>;
}
