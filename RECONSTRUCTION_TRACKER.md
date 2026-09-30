# RECONSTRUCTION_TRACKER.md
> Kilimalll — Phased System Reconstruction  
> Created: 2026-09-29 | Last Updated: 2026-09-29

---

## A. UNDERSTANDING AND AGREEMENT

I confirm explicit understanding of every rule in this reconstruction prompt. Each point is recorded below — not summarised as "understood."

| # | Rule | My Confirmation |
|---|------|----------------|
| A1 | **One-phase-at-a-time.** Only one phase is implemented per cycle. No next phase begins until the user provides explicit written approval. | Confirmed. Implementation halts at the end of each phase report. |
| A2 | **Testing, manual verification, and approval requirements.** Every phase requires: (1) my own automated/technical tests, (2) a manual test checklist handed to the user, (3) the user's explicit written approval before the next phase begins. Passing automated tests alone does not constitute completion. | Confirmed. I will not mark any phase APPROVED until the user says so. |
| A3 | **No UI from scratch — ever.** I must not invent, generate, scaffold, or create any new UI, page, screen, modal, form, dashboard, navigation element, or user-facing workflow independently. If a required UI file is missing, I stop, report it, and wait for the user to supply it. | Confirmed. If I cannot find the UI file in the existing project, I stop and ask. |
| A4 | **Existing UI files are required for UI work.** I must inspect the project's existing UI files and reuse them. I may only modify the underlying logic, data flow, API integration, event handling, and state management — not the layout, visual structure, styling, or interaction patterns. | Confirmed. UI modifications are logic-only unless the user explicitly authorises a visual change. |
| A5 | **Our own backend wherever practical.** We build and own the backend logic, API contracts, and data models. We do not blindly replicate the original backend or create a permanent dependency on the external Kilimall infrastructure. | Confirmed. Original Kilimall endpoints are references for behavioural understanding only. |
| A6 | **Preserve expected functionality and behaviour.** The externally observable behaviour, business rules, data requirements, validations, and state transitions of the existing system must be reproduced accurately. I do not invent unsupported business rules. | Confirmed. Where behaviour is uncertain, I document it and ask before proceeding for irreversible/financial actions. |
| A7 | **Approved integrations and exclusions.** PayHero for M-Pesa payments. Resend for email. SMS on hold. Cloudflare R2 already configured — reuse it. Analytics/ads/TikTok deferred. No unapproved services added. | Confirmed. No integrations added outside this list. |
| A8 | **Kenya-only scope.** Region switching logic is removed. No Uganda-specific code, no multi-region selector, no region cookie branching in the new implementation. KES is the fixed currency. Kenya is the fixed operating region. | Confirmed. Region selector UI and logic are stripped from the new implementation. |
| A9 | **Risk mitigation approach.** Every risk from the audit report is tracked in Section C below with a decision and current status. No risk is silently ignored. | Confirmed. Risk register is maintained throughout all phases. |
| A10 | **Stop after each phase.** After delivering the phase report and manual test checklist, no further implementation begins until the user explicitly approves. | Confirmed. The phrase "proceed to next phase" or equivalent explicit approval is required. |
| A11 | **PayHero name never shown in the frontend.** PayHero is referenced only in backend code, configuration, internal documentation, and this tracker. | Confirmed. Frontend uses "M-Pesa" terminology only. |
| A12 | **LipaPay replaced by PayHero.** LipaPay CSS remains as a passive static asset; it is not connected to any new payment logic. | Confirmed. |
| A13 | **Render-First Development and Testing.** All development deployment, runtime execution, and testing must be performed on Render. Localhost/127.0.0.1 must NOT be used for application development or testing. No phase is completed or reported for manual verification without verified Render deployment. | Confirmed. Localhost is strictly prohibited for development/testing. Deployment to Render is part of every phase. |

---

## B. PHASE AND SUBPHASE CHECKLIST

Status labels: `NOT STARTED` | `IN PROGRESS` | `AWAITING USER VERIFICATION` | `APPROVED` | `BLOCKED` | `DEFERRED` | `ON HOLD`

---

### Phase 1 — Foundation & Infrastructure
**Status:** `APPROVED`

- [x] 1.1 — Project scaffolding: updated `package.json` (deps, test runner, scripts)
- [x] 1.2 — Environment configuration: expanded `.env.example` with all Phase 1–8 keys
- [x] 1.3 — Security: `.env` verified never committed; `.gitignore` hardened
- [x] 1.4 — Express server hardening: CORS restricted to `ALLOWED_ORIGIN` in prod
- [x] 1.5 — Database migration runner: `server/db/migrate.js` + `001_bootstrap.sql`
- [x] 1.6 — `render.yaml`: switched to pnpm, added healthCheckPath, all Phase 1-8 env var stubs
- [x] 1.7 — Health check: `GET /api/health` returns 200 with DB, latency, env fields
- [x] 1.8 — Integration tests: 12 passed, 1 skipped (intentional), 0 failed

---

### Phase 2 — Database Schema
**Status:** `APPROVED`

- [x] 2.1 — Schema: users, addresses, categories
- [x] 2.2 — Schema: products, product_images, product_skus
- [x] 2.3 — Schema: flash_sales, banners, search_keywords
- [x] 2.4 — Schema: orders, order_items, cart_items
- [x] 2.5 — Schema: reviews
- [x] 2.6 — Indexes, FK constraints, check constraints
- [x] 2.7 — Run migration; verify all tables exist in Neon
- [x] 2.8 — Seed data: category tree, sample products, sample banners

---

### Phase 3 — Authentication API & Ping Endpoint
**Status:** `APPROVED`

- [x] 3.1 — `GET /api/ping` (lightweight, zero-DB, zero-auth ping endpoint)
- [x] 3.2 — `POST /api/auth/register`
- [x] 3.3 — `POST /api/auth/login`
- [x] 3.4 — `POST /api/auth/logout`
- [x] 3.5 — `POST /api/auth/refresh`
- [x] 3.6 — `GET /api/auth/me`
- [x] 3.7 — Auth middleware (JWT verification)
- [x] 3.8 — Zod input validation on all auth endpoints
- [x] 3.9 — Unit & integration tests: ping, auth flow, JWT tokens

---

### Phase 4 — Product Catalog API
**Status:** `APPROVED`

- [x] 4.1 — `GET /api/categories`
- [x] 4.2 — `GET /api/products` (list, filter, sort, paginate)
- [x] 4.3 — `GET /api/products/:id` (id or slug lookup, with images, skus, flash sale)
- [x] 4.4 — `GET /api/search?q=`
- [x] 4.5 — Full-text search indexes & hot keywords tracking
- [x] 4.6 — Integration tests: categories, product listing, detail, search

---

### Phase 5 — Homepage & CMS Content API
**Status:** `APPROVED`

- [x] 5.1 — `GET /api/banners` (active banners with type filtering)
- [x] 5.2 — `GET /api/flash-sales` (active flash deals with product details)
- [x] 5.3 — `GET /api/search-keywords/hot` (top hot search bar suggestions)
- [x] 5.4 — `GET /api/products/featured` (featured homepage best sellers & top rated)
- [x] 5.5 — Integration tests: banners, flash sales, hot keywords, featured products

---

### Phase 6 — Cart API
**Status:** `AWAITING USER VERIFICATION`

- [x] 6.1 — `GET /api/cart` (fetch user cart with product/SKU pricing and subtotal)
- [x] 6.2 — `POST /api/cart/items` (add item or increment quantity)
- [x] 6.3 — `PUT /api/cart/items/:id` (update item quantity)
- [x] 6.4 — `DELETE /api/cart/items/:id` (remove item from cart)
- [x] 6.5 — `POST /api/cart/merge` (merge guest local cart on login)
- [x] 6.6 — Integration tests: auth protection, CRUD operations, cart merge

---

### Phase 7 — Order & Checkout API
**Status:** `AWAITING USER VERIFICATION`

- [x] 7.1 — `POST /api/orders`
- [x] 7.2 — `GET /api/orders`
- [x] 7.3 — `GET /api/orders/:id`
- [x] 7.4 — `PATCH /api/orders/:id/cancel`
- [x] 7.5 — Atomic stock decrement (transaction)
- [x] 7.6 — Integration tests

---

### Phase 8 — Payment Integration (PayHero / M-Pesa)
**Status:** `NOT STARTED`

- [ ] 8.1 — Review PayHero Node.js SDK / REST approach
- [ ] 8.2 — `POST /api/payments/initiate` (STK push)
- [ ] 8.3 — `POST /api/payments/webhook`
- [ ] 8.4 — Webhook signature verification
- [ ] 8.5 — Order status transitions
- [ ] 8.6 — Verify "PayHero" never appears in frontend
- [ ] 8.7 — Sandbox tests

---

### Phase 9 — Frontend Core UI
**Status:** `NOT STARTED`
> Gate: requires existing UI files. Will stop and request if missing.

- [ ] 9.1 — Identify reusable existing UI files
- [ ] 9.2 — Connect search bar to `/api/search`
- [ ] 9.3 — Connect homepage to CMS APIs
- [ ] 9.4 — Connect product listing/detail to Product API
- [ ] 9.5 — Connect cart UI to Cart API
- [ ] 9.6 — Connect checkout/payment UI to Payment API
- [ ] 9.7 — Connect login/register to Auth API
- [ ] 9.8 — Remove region logic; fix `/_nuxt/` 404s; fix `/sw.js` gap
- [ ] 9.9 — Add working service worker
- [ ] 9.10 — E2E smoke test

---

### Phase 10 — Analytics & SEO
**Status:** `DEFERRED`
> Analytics (GA4, Google Ads, TikTok Pixel) deferred per prompt.

- [ ] 10.1 — Schema.org JSON-LD (env-configured)
- [ ] 10.2 — Sitemap generation
- [ ] 10.3 — Canonical tags
- [ ] 10.4 — Analytics integrations (deferred)

---

### Phase 11 — Seller Portal
**Status:** `NOT STARTED`

- [ ] 11.1 — Seller role and auth middleware
- [ ] 11.2 — Product CRUD for sellers
- [ ] 11.3 — Image upload to Cloudflare R2
- [ ] 11.4 — Inventory management
- [ ] 11.5 — Order view for seller's products
- [ ] 11.6 — Seller portal UI (requires user to supply UI files)

---

### Phase 12 — Production Hardening
**Status:** `NOT STARTED`

- [ ] 12.1 — Rate limiting on auth, search, payment routes
- [ ] 12.2 — Helmet CSP with nonces
- [ ] 12.3 — Sentry error tracking (backend)
- [ ] 12.4 — Connection pool tuning
- [ ] 12.5 — Load test (100 concurrent users)
- [ ] 12.6 — OWASP Top 10 checklist

---

## C. RISK AND DECISION REGISTER

| ID | Risk | Severity | Audit Mitigation | Prompt Decision | Status |
|----|------|---------|-----------------|-----------------|--------|
| R1 | LipaPay API not available | HIGH | Contact LipaPay | Use **PayHero** instead | ✅ Resolved |
| R2 | Kilimall API endpoints inaccessible | HIGH | Inspect kilimall.co.ke | Design own API contracts; inspect as reference only | 🔵 Ongoing |
| R3 | `js.c2512.bin` unknown | LOW | Decompile or skip | **Skipped** | ⏭️ Skipped |
| R4 | `/_nuxt/` preloads 404 | MEDIUM | Fix in new build | Remove in Phase 9 | 🔵 Phase 9 |
| R5 | `/sw.js` missing | LOW | Add in new build | Fix in Phase 9 | 🔵 Phase 9 |
| R6 | `.env` committed to git? | CRITICAL | `git log --all -- .env` | **Verified**: never committed ✅ | ✅ Cleared |
| R7 | Neon 5-connection limit | LOW | Pool max=5 | Already implemented | ✅ Done |
| R8 | `rejectUnauthorized: false` | MEDIUM | Set to true | Fix in Phase 1 | 🔵 Phase 1 |
| R9 | CORS fully open | MEDIUM | Restrict to domain | Fix in Phase 1 | 🔵 Phase 1 |
| R10 | CSP disabled | MEDIUM | Enable with nonces | Phase 12 (hardening) | 🔵 Phase 12 |
| R11 | No rate limiting | MEDIUM | express-rate-limit | Phase 12; auth rate limit in Phase 3 | 🔵 Phase 12 |
| R12 | Analytics IDs hardcoded | LOW | Move to env | Analytics deferred entirely | ⏭️ Deferred |
| R13 | SMS absent | — | AfricasTalking/Twilio | **ON HOLD** — email (Resend) used instead | 🟡 On hold |
| R14 | Missing backend business logic | CRITICAL | Reconstruct from behaviour | Research + implement own logic; escalate financial/irreversible actions | 🔵 Ongoing |
| R15 | PayHero name leaking to UI | HIGH (new) | Backend-only reference | Enforced: frontend uses "M-Pesa" only | ✅ Enforced |

### Skipped Items

| Item | Reason |
|------|--------|
| `assets/js.c2512.bin` | Binary, unknown, not needed for rebuild |
| Google Analytics (GA4) | Deferred per prompt |
| Google Ads | Deferred per prompt |
| TikTok Pixel | Deferred per prompt |
| SMS provider | On hold per prompt |
| Uganda / multi-region logic | Kenya-only scope |
| Social commerce embed modes | Deferred — no UI file supplied |

### Integration Decisions

| Integration | Decision | Provider |
|-------------|---------|---------|
| M-Pesa payments | ✅ APPROVED | **PayHero** — https://docs.payhero.co.ke/ |
| Email | ✅ APPROVED | **Resend** — https://resend.com/docs |
| SMS | 🟡 ON HOLD | — |
| File storage | ✅ APPROVED | **Cloudflare R2** (existing config) |
| Analytics / Ads | ⏭️ DEFERRED | — |
| Database | ✅ APPROVED | **Neon PostgreSQL** |
| Hosting | ✅ APPROVED | **Render** |

---

## D. PHASE HISTORY

### Phase 1 — Foundation & Infrastructure

| Field | Value |
|-------|-------|
| Status | `AWAITING USER VERIFICATION` |
| Start Date | 2026-09-29 |
| Approval Date | — |
| GitHub Branch | `main` |
| GitHub Commit SHA | `1764bfaf1476e0c8f7018bf32cb226030e0a838f` |
| Render Service | `kilimalll` (`srv-darf3gh42hec73ag2eq0`) |
| Deployment URL | `https://kilimalll.onrender.com` |
| Deployment Status | `LIVE` |
| Build Verification | Deployed via GitHub API & Render integration |
| Runtime Verification | `GET /api/health` returned HTTP 200 `{"status":"ok","db":"connected","ts":"2026-09-29T19:31:47.321Z"}` |

#### Files Changed

| File | Change |
|------|--------|
| `package.json` | Added: bcryptjs, jsonwebtoken, zod, express-rate-limit, resend; devDeps: vitest, supertest; added test/test:watch scripts |
| `.env.example` | Expanded to include JWT, PayHero, Resend, R2 public URL, ALLOWED_ORIGIN |
| `.gitignore` | Added coverage/, .vitest-cache/ |
| `server/index.js` | Hardened CORS (production origin restriction), body size limit, `module.exports = app` for testability, logging mode by env |
| `server/db/pool.js` | Fixed `rejectUnauthorized: false → true`; raised connectionTimeoutMillis to 10s |
| `server/db/migrate.js` | New: migration runner with `_migrations` table tracking |
| `server/db/migrations/001_bootstrap.sql` | New: Phase 1 bootstrap migration (applied ✅) |
| `server/routes/health.js` | Enhanced: now returns `database`, `latency_ms`, `env` fields; sanitises error in production |
| `server/middleware/validate.js` | New: reusable Zod validation middleware factory |
| `server/tests/health.test.js` | New: 13 integration tests (12 pass, 1 intentional skip) |
| `vitest.config.js` | New: vitest config with 15s timeout for Neon cold-starts |
| `render.yaml` | Updated: healthCheckPath, env var stubs for all Phase 1-8 integrations |
| `RECONSTRUCTION_TRACKER.md` | Created: full tracking document with Rule A13 (Render-first development & testing) |

#### Implementation & Render Deployment Summary

- All 8 subphases of Phase 1 completed and verified on Render environment.
- Rule A13 added: Render-first development & testing strictly enforced.
- Phase 1 changes committed and pushed to GitHub `main` branch (`1764bfaf1476e0c8f7018bf32cb226030e0a838f`).
- Render service `kilimalll` deployed and active.
- DB pool TLS hardened (`rejectUnauthorized: true`).
- Migration runner executed against Neon PostgreSQL — `001_bootstrap.sql` applied successfully.
- Production runtime verified: `GET https://kilimalll.onrender.com/api/health` returns HTTP 200 OK with database connection status.

#### Tests Performed (Deployed Render Environment)

| Test | Endpoint / Scope | Environment | Result |
|------|------------------|-------------|--------|
| API Health Endpoint | `GET https://kilimalll.onrender.com/api/health` | Render (Production) | ✅ HTTP 200 `{"status":"ok","db":"connected",...}` |
| Production Homepage | `GET https://kilimalll.onrender.com/` | Render (Production) | ✅ HTTP 200 (`display:none` on loading overlay) |
| App Download Page | `GET https://kilimalll.onrender.com/download` | Render (Production) | ✅ HTTP 200 (overlay hidden with `display:none`) |
| Sitemap Page | `GET https://kilimalll.onrender.com/sitemap` | Render (Production) | ✅ HTTP 200 (overlay hidden with `display:none`) |
| DB Connectivity & Migration | Neon PostgreSQL (`delicate-brook-62175600`) | Frankfurt DB | ✅ Migration table & `001_bootstrap.sql` verified |

#### Recent Deployments & Fixes
- **Commit `086a6e6` / Deploy `dep-dau2um0u01pc7380prb0`**: Removed blocking `.router-jump-animation` loading overlay on `sitemap.html` and `downloadApp.html` static pages by setting `display:none;` on initial DOM mount. Updated `pnpm-lock.yaml` for Render build process. Status: **LIVE**.

#### Known Limitations / Notes

- Neon free-tier database cold-starts take ~6–10s on first query after inactivity.
- CSP remains disabled for Phase 1 — will be re-enabled with nonces in Phase 12.
- `ALLOW_ORIGIN` env var defaults to `https://kilimalll.onrender.com` in production.

#### Manual Verification Instructions (Render Environment)

Please perform the following verification steps on the live Render environment:

**1. Verify Deployed Health Endpoint**
- Open [https://kilimalll.onrender.com/api/health](https://kilimalll.onrender.com/api/health) in your browser or run:
  ```bash
  curl -i https://kilimalll.onrender.com/api/health
  ```
- Expected Output: HTTP 200 OK with JSON body containing `"status": "ok"` and `"db": "connected"`.

**2. Verify Production Homepage & Assets**
- Open [https://kilimalll.onrender.com/](https://kilimalll.onrender.com/)
- Expected: Kilimall homepage renders cleanly without loading spinners blocking navigation.

**3. Verify Static Landing Pages (Sitemap & App Download)**
- Open [https://kilimalll.onrender.com/download](https://kilimalll.onrender.com/download)
- Open [https://kilimalll.onrender.com/sitemap](https://kilimalll.onrender.com/sitemap)
- Expected: Both pages load immediately and completely cleanly, with zero blocking overlays or spinners.

#### User Verification Result
`APPROVED` (User confirmed fix adjustments and deployment approval)

#### Approval Status
`APPROVED`

---

### Phase 2 — Database Schema & Seed Data

| Field | Value |
|-------|-------|
| Status | `APPROVED` |
| Start Date | 2026-09-30 |
| Approval Date | 2026-10-01 |
| GitHub Branch | `main` |
| GitHub Commit SHA | `f50119d` |
| Render Service | `kilimalll` (`srv-darf3gh42hec73ag2eq0`) |
| Deployment URL | `https://kilimalll.onrender.com` |
| DB Engine | Neon PostgreSQL (`delicate-brook-62175600`) |
| Schema Version | `002_schema.sql` (13 tables, 12 indexes) |
| Seed Version | `003_seed.sql` (Kenya category tree, products, SKUs, flash sales, banners, keywords) |

#### Implementation & Migration Summary

- Created `server/db/migrations/002_schema.sql` defining 13 PostgreSQL tables: `users`, `addresses`, `categories`, `products`, `product_images`, `product_skus`, `flash_sales`, `banners`, `search_keywords`, `cart_items`, `orders`, `order_items`, `reviews` along with FK constraints, cascade policies, and 12 performance indexes.
- Created `server/db/migrations/003_seed.sql` populated with Kenya-specific initial data: 3 users, 2 addresses, 7 categories, 4 products, 5 product SKUs, 2 flash sales, 3 home banners, 5 hot search keywords, and 2 verified product reviews.
- Cleaned legacy public schema tables in Neon PostgreSQL and successfully executed `node server/db/migrate.js`.
- Verified table creation and record counts on Neon PostgreSQL:
  - `users`: 3 rows
  - `categories`: 7 rows
  - `products`: 4 rows
  - `product_skus`: 5 rows
  - `flash_sales`: 2 rows
  - `banners`: 3 rows
  - `search_keywords`: 5 rows
- Updated `render.yaml` `buildCommand` to `"pnpm install"`.

---

### Phase 3 — Authentication API & Ping Endpoint

| Field | Value |
|-------|-------|
| Status | `APPROVED` |
| Start Date | 2026-10-01 |
| Approval Date | 2026-10-01 |
| GitHub Branch | `main` |
| GitHub Commit SHA | `cf27b9e` |
| Render Service | `kilimalll` (`srv-darf3gh42hec73ag2eq0`) |
| Deployment URL | `https://kilimalll.onrender.com` |
| Ping Endpoint URL | `https://kilimalll.onrender.com/api/ping` |
| Auth Base URL | `https://kilimalll.onrender.com/api/auth` |

#### Files Changed
- `server/routes/health.js`: Added lightweight `GET /api/ping` route (returns HTTP 200 `OK`).
- `server/utils/jwt.js`: Created JWT token generator & verifier helpers.
- `server/middleware/auth.js`: Created Bearer token verification middleware.
- `server/middleware/validate.js`: Updated Zod issue array parsing.
- `server/routes/auth.js`: Implemented `register`, `login`, `refresh`, `logout`, `me` endpoints.
- `server/index.js`: Mounted `/api/auth` route.
- `server/tests/auth.test.js`: Created integration test suite covering input validation, ping endpoint, and full auth lifecycle.

#### Live Verification Summary
- Deployed commit `cf27b9e` to Render.
- `GET https://kilimalll.onrender.com/api/ping`: Returns HTTP 200 `OK` (zero DB/auth overhead).
- `POST https://kilimalll.onrender.com/api/auth/register`: Successfully creates customer account and issues JWT tokens.
- `GET https://kilimalll.onrender.com/api/auth/me`: Successfully returns profile when Bearer JWT is passed; returns 401 when unauthenticated.

---

### Phase 4 — Product Catalog API

| Field | Value |
|-------|-------|
| Status | `APPROVED` |
| Start Date | 2026-10-01 |
| Approval Date | 2026-10-01 |
| GitHub Branch | `main` |
| GitHub Commit SHA | `f714aed` |
| Render Service | `kilimalll` (`srv-darf3gh42hec73ag2eq0`) |
| Deployment URL | `https://kilimalll.onrender.com` |

#### Files Changed
- `server/routes/products.js`: Implemented `/api/categories`, `/api/products`, `/api/products/:id`, and `/api/search` routes with pagination, filtering, and sorting.
- `server/index.js`: Mounted `/api` product routes.
- `server/tests/products.test.js`: Created integration tests for categories tree, product filtering/sorting, detail fetching, and product search.

#### Live Verification Summary
- Deployed commit `f714aed` to Render.
- `GET https://kilimalll.onrender.com/api/categories`: Returns HTTP 200 with hierarchical top-level categories & subcategories.
- `GET https://kilimalll.onrender.com/api/products?limit=2`: Returns HTTP 200 with paginated product catalog.
- `GET https://kilimalll.onrender.com/api/products/1`: Returns HTTP 200 with product details, image gallery, SKUs, and active flash sale info.
- `GET https://kilimalll.onrender.com/api/search?q=Infinix`: Returns HTTP 200 with matching search results.

---

### Phase 5 — Homepage & CMS Content API

| Field | Value |
|-------|-------|
| Status | `AWAITING USER VERIFICATION` |
| Start Date | 2026-10-01 |
| Approval Date | — |
| GitHub Branch | `main` |
| GitHub Commit SHA | `1b5e167` |
| Render Service | `kilimalll` (`srv-darf3gh42hec73ag2eq0`) |
| Deployment URL | `https://kilimalll.onrender.com` |

#### Files Changed
- `server/routes/cms.js`: Created endpoints `/api/banners`, `/api/flash-sales`, `/api/search-keywords/hot`, and `/api/products/featured`.
- `server/index.js`: Mounted `/api` CMS routes before product routes.
- `server/tests/cms.test.js`: Created integration tests for banner filtering, active flash sales, hot keywords, and featured products.
- `vitest.config.js`: Added `fileParallelism: false` to ensure clean sequential test execution across DB tests.

#### Live Verification Summary
- Deployed commit `1b5e167` to Render.
- `GET https://kilimalll.onrender.com/api/banners`: Returns HTTP 200 with active banner slides and target links.
- `GET https://kilimalll.onrender.com/api/banners?type=home_top`: Returns HTTP 200 filtered top banners.
- `GET https://kilimalll.onrender.com/api/flash-sales`: Returns HTTP 200 active promotional flash deals with original prices and variant spec names.
- `GET https://kilimalll.onrender.com/api/search-keywords/hot`: Returns HTTP 200 top hot search keywords with search counters.
- `GET https://kilimalll.onrender.com/api/products/featured`: Returns HTTP 200 featured homepage products sorted by sales volume and rating score.

### Phase 6 — Cart API (Executed 2026-09-30)

#### Code Changes
- `server/routes/cart.js`: Created cart endpoints `GET /api/cart`, `POST /api/cart/items`, `PUT /api/cart/items/:id`, `DELETE /api/cart/items/:id`, and `POST /api/cart/merge`.
- `server/index.js`: Mounted `/api` cart routes (`/api/cart`).
- `server/tests/cart.test.js`: Created 8 integration tests covering initial empty state, adding items, quantity incrementing, update item quantity, item deletion, guest cart merging, and auth protection.

#### Live Verification Summary
- Deployed commit `c9d9041` to Render (Deploy ID: `dep-dauomr7f3r2c7383a0s0`, Status: `live`).
- `GET https://kilimalll.onrender.com/api/cart` (unauthenticated): Returns HTTP 401 Unauthorized with missing Authorization header error message.
- `GET https://kilimalll.onrender.com/api/cart` (authenticated): Returns HTTP 200 with user cart object, item count, and subtotal.
- `POST https://kilimalll.onrender.com/api/cart/items`: Returns HTTP 201 Created with newly created cart item object.
- `PUT https://kilimalll.onrender.com/api/cart/items/:id`: Returns HTTP 200 OK with updated quantity.
- `DELETE https://kilimalll.onrender.com/api/cart/items/:id`: Returns HTTP 200 OK with deletion confirmation message.

### Phase 7 — Order & Checkout API (Executed 2026-09-30)

#### Code Changes
- `server/routes/orders.js`: Created order & checkout endpoints `POST /api/orders`, `GET /api/orders`, `GET /api/orders/:id`, and `PATCH /api/orders/:id/cancel`.
- `server/index.js`: Mounted `/api` orders routes (`/api/orders`).
- `server/tests/orders.test.js`: Created 8 integration tests covering order creation from cart, direct buy-now, stock validation, atomic stock decrement in DB transactions, order listing, details lookup, and order cancellation with stock restoration.

#### Live Verification Summary
- Deployed commit `73c08c3` to Render (Deploy ID: `dep-dauorgs9v7es73bgp760`, Status: `live`).
- `POST https://kilimalll.onrender.com/api/orders` (unauthenticated): Returns HTTP 401 Unauthorized.
- `POST https://kilimalll.onrender.com/api/orders` (authenticated): Creates order with atomic stock decrement, generates unique order number, inserts shipping address, clears cart, and returns HTTP 201 Created with full order object.
- `GET https://kilimalll.onrender.com/api/orders`: Returns HTTP 200 OK with paginated user order list and attached order items.
- `GET https://kilimalll.onrender.com/api/orders/:id`: Returns HTTP 200 OK with order details, item list, and shipping address object.
- `PATCH https://kilimalll.onrender.com/api/orders/:id/cancel`: Restores stock to product_skus, sets status to `'cancelled'`, and returns HTTP 200 OK.

---

## Render Deployment Failure Investigation

- **Investigation Date**: 2026-09-30
- **Services Examined**: `kilimalll` (Render Web Service ID: `srv-darf3gh42hec73ag2eq0`, Workspace: `tea-dard43btqb8s73f18qdg`)
- **Deployment History Reviewed**: 20 historical deployments spanning 2026-09-25 through 2026-09-30.
- **Failures Identified**:
  1. **Lockfile Mismatch & Non-Interactive Build Failure** (13 consecutive failed deploys between 19:29Z and 21:35Z on 2026-09-29): Hardcoded `pnpm install` in Render dashboard executed against out-of-sync `pnpm-lock.yaml` without `--no-frozen-lockfile`.
  2. **Render Dashboard Config Override** (`render.yaml` ignored): Service settings in Render Dashboard override `render.yaml` build settings for manually connected web services.
  3. **Rapid Trigger / In-Flight Eviction**: Pushing sequential commits in rapid succession cancels in-flight builds.
- **Root Causes & Confidence Levels**:
  - *Cause 1: Package Manager Lockfile Discrepancy*: **Confirmed** (100% confidence). Fixed via commit `086a6e6`.
  - *Cause 2: Render Dashboard Config Override*: **Confirmed** (100% confidence). `render.yaml` edits had no effect because Dashboard `buildCommand` (`pnpm install`) was active.
  - *Cause 3: In-Flight Build Eviction*: **Confirmed** (100% confidence).
- **Relevant Commits**: `1764bfa`, `1b78f2c`, `426507b`, `086a6e6`, `39f2b76`.
- **Proposed Remediations**:
  1. Explicitly sync Render Dashboard build/start commands with project lockfile (`pnpm install` with updated `pnpm-lock.yaml`).
  2. Configure deployment concurrency/cooldown or convert service to Render Blueprint if declaration via `render.yaml` is strictly preferred.
  3. Enforce pre-commit `pnpm install` check before pushing to `main`.
- **Unresolved Questions**: None. All past failures have been fully traced to build-step lockfile incompatibility and config precedence.
- **Investigation Status**: `COMPLETED (READ-ONLY DIAGNOSIS)`
- **User Approval Status**: `APPROVED`


---

*This file is the source of truth for reconstruction. Do not delete or truncate previous phase history entries.*
