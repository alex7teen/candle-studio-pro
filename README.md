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
