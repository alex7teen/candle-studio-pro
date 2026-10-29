# Manufacturing workspace

## Guided Candle Maker and landed costs

Candle Maker now presents ten steps: container/mould, safety label, wick, adhesive, base wax, fragrance, colour, saved figures, packaging, and final review. Glasses can be selected directly from Inventory; the application creates the linked container profile when needed. Supplier dimensions may fill missing profile fields, while recorded measurements take priority. A supplier's approximate wax capacity in grams never becomes a measured usable volume in ml. Drafts retain the step and batch quantity. Existing layered recipes can still be edited in Composition Builder.

The final review includes every selected material, stock requirements, historical and replacement costs, manufacturing instructions, print/download actions and explicit production confirmation. Saving, printing and downloading do not consume stock. A previously saved unchanged recipe version is reused at confirmation, preserving its version-specific quality records. Confirming a changed recipe creates a new version which needs its own relevant approvals.

Future pricing defaults to **Standard Replacement Cost Without Discounts**. Original line values receive proportional shipping and recorded or separately configured non-recoverable VAT and directly attributable purchase costs. **Actual Historical Purchase Cost** retains invoice discounts and recorded tax. Original purchase transactions are unchanged. `migrations/0004_costing.sql` adds separate tax/original-price settings and bounded supplier lookup counters; apply it before deploying this version. Record a D1 bookmark first.

For order 252484, original merchandise £240.97 plus shipping £11.99 at the reviewed 20% VAT rate gives £303.552, displayed as £303.55. The historical invoice remains £281.77. Rates reconstructed from invoice totals are identified for review; mixed-rate invoices support individual line and shipping rates. Unreconciled tax remains unknown until configured. VAT recovery and output VAT remain explicit business settings.

Material Specifications contains **Enrich Existing Inventory**. Select up to five records, paste product URLs or use supplier lookup, retrieve facts, review the actual product title/source/date and confirm individual fields. Source provenance is stored per imported field. Confirm the basis of a fragrance restriction before applying it. Manual corrections remain available. Photos, cm/mm dimensions, nominal cl/ml, approximate wax grams, instructions, pack descriptions and supported technical-document links are extracted where explicit. No missing temperature, density, compatibility or safety approval is invented. Pack descriptions never silently rewrite historical purchase conversions.

Supplies for Candles public product search, Candle Shack product suggestions and Hobbycraft public search are supported where accessible. Fetching permits fixed supplier HTTPS hosts, rejects redirects and local-address URLs, times out after 12 seconds, and limits page bodies to 2 MB and lookups to 60 requests/user/hour. Restricted or unsupported sources retain existing values and show Not Verified. Supplier pages and documents can change; imported facts require review against the exact formulation and intended use.

Browser QA validates all ten steps, back navigation, draft resumption, excessive-fragrance warnings, saved decorations, gram-based packaging, manufacturing-sheet download, one production deduction and mobile layout. A real public supplier glass page was also retrieved and reviewed in the isolated local QA environment; no synthetic Inventory was added to production.

The existing Inventory remains the raw-material ledger. New manufacturing records use additive migration `migrations/0003_manufacturing.sql`; authentication, purchases, workspace data and integration credentials are retained. Apply the migration before deploying the new Worker. Record a D1 Time Travel bookmark first. There is no production seed or destructive reset in this migration.

## Workshop setup

1. Enter purchases and actual pack quantities in Purchasing. Check whether receipt prices include VAT in Cost Calculator. Positive opening stock without recorded valuation produces an unknown cost, rather than an invented price.
2. Open Material Specifications. Associate each Inventory item with its role and record supplier instructions, source, verification date, fragrance basis, compatibility, density and available documents. Example fragrance percentages are not manufacturer defaults.
3. Register containers with measured usable volume and dimensions. Nominal 30 cl means 300 ml, not 300 g. Register moulds and separate cavity groups; supplier imports require human review and may require manual entry when blocked or incomplete.
4. Record water measurements for volume estimates, or actual wax calibrations for the exact cavity and formulation. Water does not establish the finished wax weight. Create decoration variants linked to matching actual calibrations and optional photos.
5. Build a single or layered recipe. Wax-weight mode adds fragrance relative to wax; target-mixture mode divides the target among ingredients. Volume layers require measured usable volume and verified formulation density. Save a draft or an immutable recipe version.
6. Scale in Batch Optimizer. Mixed sourcing reserves available pre-made figures first, then calculates only missing figures, mould rounds and the last occupied cavities. Save a production plan, export JSON or print the production sheet.
7. Confirm a test batch after reviewing amber warnings. Red errors block confirmation. Sale mode additionally requires relevant recorded burn and compliance checks; these records do not constitute automatic safety certification or a legal classification.
8. Record measured actual consumption or reverse a physically unused batch through the production history. Original records remain immutable. Never return materials already mixed or consumed.

## Accounting and history

Quantities use fixed decimal micro-units. Purchase costs are weighted from documented receipt quantities using the selected historical or replacement basis, allocated shipping and the selected VAT treatment. Unknown costs remain unknown. Pricing separates margin, markup, labour, overhead, platform fees and output VAT.

Production is calculated again on the server from a saved recipe version. D1 batches atomically insert the immutable operation, update the existing Inventory ledger and record figure movements. An idempotency key prevents replay deductions; workspace revision checks and SQL triggers reject stale confirmations and negative figure stock. Existing Inventory saves cannot alter protected manufacturing movements. Recipe versions preserve container and decoration revisions; production captures relevant specifications and immutable calibration records.

Images are authenticated PNG/JPEG/WebP records limited to 512 KB; larger browser uploads are resized. Supplier import permits selected public HTTPS supplier hosts, rejects redirects and local addresses, limits response size/time and never treats missing wax capacity as a measured value.

## Validation

Run `npm test` and `npm run deploy:check`. Tests cover both weight modes, layered volumes, three dynamic figure variants, stock optimisation, VAT, pricing, source validation, version history, quality revocation, idempotency, transaction rollback, measured adjustments and reversals. Test specifications and suppliers are explicitly synthetic and must never be imported as real verified guidance. Browser QA uses an isolated local Workers/D1 database and verifies recipe creation, scaling, pre-made figure consumption, photos, existing routes and mobile layout.

Real supplier limits, blend densities, cavity weights, physical clearance, burn performance and finished-product classification still require the workshop's own evidence. The application deliberately leaves these unknown until recorded.
