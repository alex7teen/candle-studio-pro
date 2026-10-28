# Shops and social account connections

Settings now contains connection cards for Shopify, Instagram, Facebook, TikTok and Etsy. A card becomes available only after its server configuration and the additive D1 migration are present. A successful provider callback, not a saved profile URL, marks an account connected.

## Supported in this release

| Service | Read access | Authorization |
| --- | --- | --- |
| Shopify | Latest 20 products, product status and total finished product stock | Shopify authorization code grant, `read_products` |
| Instagram | Latest 20 posts, likes and comments | Meta Facebook Login; professional Instagram account linked to a granted Page |
| Facebook | Latest 20 Page posts | Meta Facebook Login, business Pages only |
| TikTok | Latest 20 public videos and their views, likes, comments and shares | Login Kit + Display API, `user.info.basic,video.list` |
| Etsy | Latest 20 active shop listings and available quantities | OAuth with S256 PKCE, `shops_r listings_r` |

Data is fetched on **Load latest data** and shown in a separate read-only preview. If more records exist, the UI says so; these are bounded previews, not full catalog imports. No orders or customer records are requested. No posts are published and no remote inventory is changed. Material stock and finished product stock must not be conflated. Product mapping, order deduplication, inventory write policy and publishing approval must be designed before enabling those operations.

Facebook authorization discovers up to 100 granted Pages and their linked professional Instagram accounts. Personal Facebook profiles and consumer Instagram accounts are not supported. Reconnect with the desired Pages selected if an account is missing.

## Production setup

1. Register developer applications for the four authorization providers below. Keep credentials out of chat, Git, workspace JSON, screenshots and browser storage. App IDs may be public, but configure them server-side alongside the corresponding secrets.
2. Generate a cryptographically random **32-byte** key encoded in standard base64 and save it as the Worker secret `INTEGRATION_ENCRYPTION_KEY`, using `wrangler secret put` or the Cloudflare dashboard's secret input. Do not print it or commit it. Back it up securely: changing it without a re-encryption procedure makes saved connections unusable and requires reconnecting accounts.
3. Set the following Worker secrets for each desired provider:

   | Provider | Worker secrets |
   | --- | --- |
   | Shopify | `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` |
   | Facebook and Instagram | `META_APP_ID`, `META_APP_SECRET` |
   | TikTok | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` |
   | Etsy | `ETSY_CLIENT_ID` (keystring), `ETSY_SHARED_SECRET` |

4. `INTEGRATION_ORIGIN` is set to `https://candle-studio-pro.algonlinesrl.workers.dev` in `wrangler.jsonc`. It must be exactly the HTTPS origin serving the application, with no trailing slash. Update this and provider redirect allowlists together if the app's domain changes. Meta Graph API is pinned to `v24.0` and Shopify GraphQL to `2026-10`; review supported versions before upgrading.
5. Back up D1 through Cloudflare's existing backup facilities, then apply the **additive** migration: `npx wrangler d1 migrations apply candle-studio-pro-db --remote`. Migration 0002 only creates two integration tables and an expiry index. It does not delete or update existing users, sessions, workspace or activity. Do not reset the database, replay initialization scripts destructively, or use a temporary Wrangler account.
6. Run `npm test` and `npm run deploy:check`, then deploy normally. Cloudflare Workers Builds may deploy automatically when this reaches main. Until server setup and migration are complete the cards will say **Setup needed**; the rest of the application continues to work.
7. Sign in as an administrator, open Settings, and authorize each service. For Shopify enter the original `*.myshopify.com` hostname, without `https://`. `cozyalco.co.uk` is the public site address supplied by the owner; its internal Shopify hostname has not been verified. Find it under Shopify → Settings → Domains.

### Redirect allowlists and provider approvals

Register these exact redirect URLs in the corresponding developer app:

| Provider | Redirect URL |
| --- | --- |
| Shopify | `https://candle-studio-pro.algonlinesrl.workers.dev/api/integrations/callback/shopify` |
| Meta | `https://candle-studio-pro.algonlinesrl.workers.dev/api/integrations/callback/meta` |
| TikTok | `https://candle-studio-pro.algonlinesrl.workers.dev/api/integrations/callback/tiktok` |
| Etsy | `https://candle-studio-pro.algonlinesrl.workers.dev/api/integrations/callback/etsy` |

Shopify: create a standalone/non-embedded app with an appropriate installation/distribution method, configure the redirect, and grant `read_products`. The app must be installable on the owner's store. Do not request write or customer-data scopes for this release.

Meta: configure Facebook Login for the app and the three scopes `pages_show_list`, `pages_read_engagement`, `instagram_basic`. Select the business Pages during authorization. The Instagram account must be Business or Creator and linked to a selected Page. App roles/test users may work in development mode; non-role users need Meta's relevant review/advanced access and live mode. Configure the required privacy policy, data deletion instructions and domains before submitting for review. Do not claim app approval until Meta confirms it.

TikTok: enable Login Kit and Display API, register the redirect, request `user.info.basic` and `video.list`, and complete required provider review/domain verification. Content Posting API approval is not requested in this release.

Etsy: register an Open API application, configure the redirect and obtain approval appropriate to its personal/commercial usage. Configure both keystring and shared secret. Grant `shops_r listings_r`. The authorized account must own an Etsy shop.

## Token and session behavior

- Tokens and refresh tokens are stored only as AES-256-GCM ciphertext, with a fresh IV and account-bound additional authenticated data. The key is a Worker secret; it is not stored in D1.
- OAuth state is random, hashed at rest, bound to the initiating browser and existing administrator session, expires after ten minutes and is consumed atomically. Logging out invalidates pending authorizations. A dedicated HttpOnly Secure SameSite=Lax callback cookie handles provider returns without weakening the existing Strict login cookie.
- Etsy additionally uses S256 PKCE. Shopify callbacks verify HMAC, expected shop and timestamp. Arbitrary hosts and user-supplied remote URLs cannot receive credentials.
- Shopify, Etsy and TikTok refresh expiring access tokens on demand when the provider supplied a refresh token. Meta tokens are exchanged for long-lived credentials; reconnect after expiration or revocation. A concurrent disconnect is not undone by refresh. Concurrent refresh conflicts require a retry/reconnect rather than returning an unpersisted token.
- Disconnect deletes the encrypted local connection. It does not revoke provider-side authorization; withdraw the app's permissions in the provider's account settings as well. Reconnecting can add back still-authorized accounts.
- Provider errors are mapped to fixed error codes. Do not log raw API responses, callback URLs, codes, tokens, passwords or D1 credential records. Disable/redact request-URL logging of OAuth callbacks in any external logging service. Only administrators can list, connect, read or disconnect shared business connections.

## Verification and rollout limits

Tests use in-memory SQLite with the actual migrations and synthetic provider responses. They cover authenticated encryption, tamper detection, admin/origin checks, OAuth browser/session binding, replay rejection, Shopify signature verification, Etsy PKCE and refresh, TikTok display fields, Meta discovery, error redaction and preservation of existing workspace data. Build and Wrangler dry-run validate the deployment bundle. These do not substitute for each provider's app approval and a real account authorization.

Before declaring a provider live, authorize a real account, load its preview, exercise deny/reconnect/disconnect, verify no credentials appear in browser responses or workspace exports, and confirm existing workspace content and revision remain unchanged. No production authorization or migration has been performed by the implementation tests.

Official references:

- [Shopify standalone authorization](https://shopify.dev/docs/apps/build/authentication-authorization/authenticate-standalone-apps)
- [Shopify GraphQL Admin API](https://shopify.dev/docs/api/admin-graphql/2026-10)
- [Meta Facebook Login manual flow](https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/)
- [Meta Instagram with Facebook Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/get-started)
- [TikTok Login Kit](https://developers.tiktok.com/doc/login-kit-web/)
- [TikTok video list](https://developers.tiktok.com/doc/tiktok-api-v2-video-list/)
- [Etsy OAuth and PKCE](https://developers.etsy.com/documentation/essentials/oauth2/)
