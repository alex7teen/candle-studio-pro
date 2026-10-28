# Candle Studio Pro

A React + TypeScript + Tailwind CSS + React Router Vite application. The UI uses shadcn-style component patterns and Lucide icons. It is a local-first frontend prototype, **not a connected Shopify/Meta/TikTok service**.

## Run

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite. For production: `npm run build`; deploy the `dist` folder to a host configured to rewrite all routes to `index.html` (SPA fallback). Refreshing `/inventory/seed-1` then works on a correctly configured host.

## Included
- Dedicated routes and page components for dashboard, purchases, purchase detail, inventory, material detail, products, recipe detail, production, orders, social media, analytics, settings.
- Seed purchase #252484, 20 original line items, £281.77 total; package quantities converted into g, ml or pieces. E.g. 1 × 5 kg = 5000 g, 3 × 10 wicks = 30 pcs.
- Stock ledger with received, consumed, wasted and adjustment movements; physical stock count reconciliations, low-stock thresholds and unit cost.
- Production batches deduct recipe materials atomically once; duplicate batch IDs rejected; insufficient stock rejected.
- Purchase email text import preview with editable package count, package size and unit; ambiguity flags; duplicate order protection.
- Local browser persistence, JSON export/restore. Social post manual entry and chart filters.

## Known limitations
- The app cannot read Gmail or sync Shopify/Instagram/TikTok without a backend, authentication, API credentials and user authorization. Links in Settings are informational only.
- Email parsing currently targets plain-text confirmations in the Supplies for Candles layout. Other formats need parser adapters.
- Previous single-file prototype data is not automatically merged because its quantity fields conflate package and stock units. A legacy localStorage backup is retained under `candle-studio-legacy-backup` when a known legacy key is found; import/migration needs manual review.
- If you previously entered production or purchases in the old prototype, export that data before replacing it. The new seeded purchase is not evidence of historical consumption.
- This local-only build is not multi-device, authenticated, or suitable for financial accounting without a hosted backend.

## Cloudflare deployment

The application files live at the repository root, not inside `Candle_Studio_Pro/`.
Use Node.js 22.12 or newer. Commit `package-lock.json` and install with `npm ci`.

### Workers Static Assets (Wrangler configuration included)

Connect this GitHub repository in Cloudflare Workers Builds with:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Root directory | repository root (leave empty) |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |

`wrangler.jsonc` serves `dist` and enables the SPA fallback for React Router.
No Worker entry script or backend is required for this frontend.
For an authenticated local deployment, run `npm ci` followed by `npm run deploy`.
`npm run deploy:check` validates the build and deployment bundle without publishing.
`npm run preview:cloudflare` serves the production build through the local Workers runtime.

### Cloudflare Pages alternative

Import the same GitHub repository as a **Pages** project. Select React (Vite),
branch `main`, root directory empty, build command `npm run build`, output directory
`dist`, and Node.js 22. Pages uses its built-in SPA fallback when no top-level
`404.html` exists. Do not use `wrangler deploy` as a Pages build command; the
Wrangler configuration in this repository targets Workers Static Assets.

After deployment, open `/dashboard` and refresh `/inventory/seed-1` directly.
Both should render the application. Data remains in browser localStorage;
deployment does not add server storage or third-party account integrations.

References: [Workers SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)
and [React on Pages](https://developers.cloudflare.com/pages/framework-guides/deploy-a-react-site/).

## Two-person Cloudflare D1 setup (required before deployment)

**This change introduces a Worker backend. Do not deploy until D1 is created and bound.**

1. In Cloudflare dashboard > Storage & databases > D1, create a database named `candle-studio-pro-db`.
2. Copy its database UUID into `wrangler.jsonc` as `d1_databases[0].database_id`, replacing `REPLACE_WITH_D1_DATABASE_ID`. This is a database identifier, not a secret.
3. In Cloudflare Workers project > Settings > Variables and Secrets, add a **secret** named `BOOTSTRAP_SECRET` with a unique random value of at least 20 characters. Never commit it to GitHub. Use the same secret for the first-time setup form.
4. Run D1 migration against the remote database: `npx wrangler d1 migrations apply candle-studio-pro-db --remote`. This must happen before the API can work. For a dashboard-only workflow, use D1 Console to execute the statements from `migrations/0001_init.sql` once.
5. Deploy via Cloudflare Workers Builds, with build `npm run build`, deploy `npx wrangler deploy`, root blank, branch `main`.
6. Open the site, choose **First-time setup**, enter your name, email, password (12+ characters) and the setup secret. Only the first account can use this one-time route.
7. Sign in, open Settings and create Corina's second account. Give her a temporary password privately; she can change it using the `/api/password` endpoint (a UI for password change is still pending).
8. **Existing browser data is not automatically migrated.** Export a JSON backup from the old deployment *before* activating this backend. After login, restore it using Settings. Be aware that restoring overwrites the shared workspace and requires coordination.

The shared workspace is stored as a versioned JSON document in D1. The server rejects stale revisions with HTTP 409; the frontend requires reload after a conflict. This is a first iteration, not a row-level transactional inventory system or real-time multiuser synchronization. Passwords use PBKDF2-SHA256, 210,000 iterations and per-user salts; sessions are HTTP-only Secure SameSite cookies. No public registration is available. Back up D1 separately using Cloudflare's supported backup/export tools.
