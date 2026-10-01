# CLAUDE.md — Kilimalll Context

Kenya-only rebuild of the Kilimall e-commerce site. It is a **scraped static Nuxt/Next frontend** (in `public/`) served by **our own Express + PostgreSQL backend** (in `server/`). Live at https://kilimalll.onrender.com.

> **Source of truth for process and status:** `RECONSTRUCTION_TRACKER.md`. Read it before starting any phase work. Never delete or truncate the phase history in it. Append to it instead.

---

## 1. Ground rules (from tracker section A, all binding)

| Rule | Meaning in practice |
|---|---|
| A1/A10 | **One phase at a time.** Stop after each phase report. Don't start the next phase without the user's explicit written approval. |
| A2 | Every phase needs automated tests, a manual test checklist for the user, and user approval. Passing tests alone doesn't make a phase done. |
| A3/A4 | **Never build UI from scratch.** Reuse the existing HTML/CSS in `public/`. Change only logic, data flow, and event handling, never layout or styling. If a UI file is missing, stop and ask. |
| A5 | We own the backend and API contracts. The real Kilimall endpoints are for reference only. |
| A6 | Don't invent business rules. Ask before any irreversible or financial behaviour. |
| A7 | Approved services only: **PayHero** (M-Pesa), **Resend** (email), **Cloudflare R2** (storage), **Neon** (Postgres), **Render** (hosting). SMS is on hold. Analytics, ads and TikTok are deferred. |
| A8 | **Kenya only.** KES currency. No region switching and no Uganda code. |
| A11 | **The word "PayHero" must never reach the frontend** (HTML, JS, or any user-facing JSON). Say "M-Pesa" instead. It may appear in backend code and DB columns (`payhero_reference`). Tests enforce this. |
| A12 | LipaPay CSS stays as an inert asset. Don't connect it to anything. |
| A13 | **Render-first.** Development and verification happen on the Render deployment, not localhost. A phase can't be reported until it's verified on Render. |

Commit style: conventional commits, e.g. `feat(phase-N): ...`, `fix(search): ...`, `docs: update RECONSTRUCTION_TRACKER.md ...`. Branch: `main`. Pushing to `main` deploys to Render. Avoid pushing many commits in quick succession, because Render cancels in-flight builds.

---

## 2. Stack and commands

- Node (CommonJS), Express 4, `pg`, Zod 4, bcryptjs, jsonwebtoken, cookie-parser, helmet, compression, morgan, payhero-devkit (ESM, loaded by dynamic `import()`), `@aws-sdk/client-s3` (R2), resend (installed but **not used yet**), express-rate-limit (installed but **not used yet**).
- Package manager: **pnpm** (`pnpm-lock.yaml`). Keep the lockfile in sync, because a lockfile mismatch caused 13 failed Render deploys.
- Scripts: `pnpm start`, `pnpm dev` (`node --watch`), `pnpm migrate`.
- **No `test` script exists in package.json**, even though the tracker says one was added. Run tests with `npx vitest run`.
- Tests: Vitest + Supertest in `server/tests/*.test.js`. They are **integration tests against the real Neon DB** in `DATABASE_URL`. They run sequentially in one fork (Neon free tier allows 5 connections) with a 15s timeout (Neon cold start takes 6–10s). Tests create real users and orders.
- Render config: `render.yaml` (free plan, Frankfurt, health check `/api/health`). **The Render dashboard settings override `render.yaml`** for this service (`srv-darf3gh42hec73ag2eq0`).
- Env vars: see `.env.example`. The local `.env` only has PORT, NODE_ENV, DATABASE_URL, APP_NAME, BASE_URL and R2_* (no JWT, PayHero or Resend). Without them, JWT falls back to hardcoded dev secrets and payments run in **sandbox fallback** (a fake `STK-...` reference). Extra optional var: `PAYHERO_CHANNEL_ID` (default 1).

---

## 3. Layout

```
server/
  index.js              Express app. Middleware order, route mounting, static serving, SPA catch-all. Exports `app` for supertest.
  db/pool.js            pg Pool (max 5, TLS verify on, 10s connect timeout)
  db/migrate.js         Runs migrations/*.sql in filename order, tracked in `_migrations`
  db/migrations/        001_bootstrap (no-op), 002_schema (13 tables), 003_seed (Kenya seed data)
  db/schema.sql         LEGACY pre-reconstruction schema. Not used, don't edit. Superseded by 002.
  middleware/auth.js    `authenticate`: JWT from `accessToken` cookie OR `Authorization: Bearer`. Sets req.user = { userId, email, role }
  middleware/validate.js `validate(zodSchema)`: returns 422 { error, errors:[{field,message}] }
  middleware/errorHandler.js  500 handler (hides the message in production)
  utils/jwt.js          access (15m) / refresh (7d) sign + verify
  routes/               health, auth, cms, products, cart, orders, payments
  tests/                one test file per phase + frontend.test.js
scripts/
  inject-ui-script.js   Adds <script src="/js/kilimall-ui.js" defer> before </body> in public/*.html (top level only, not listing/)
  upload-to-r2.js       Uploads public/{images,fonts,listing} to the R2 bucket
public/                 Scraped static site. Hashed asset names. Don't restyle.
  index.html            Homepage
  search.<hash>.html    23 search/category pages (links in index.html point to `search.xxxx.html`)
  listing/*.html        9 product detail pages, named by the ORIGINAL Kilimall product id + slug (not our DB ids)
  help-center/, downloadApp.html, sitemap.html
  js/kilimall-ui.js     OUR frontend bridge (the only hand-written frontend JS). Served with no-cache.
  sw.js                 Minimal service worker (precaches / and 2 CSS files, no fetch handling)
  assets/js.c2512.bin   Unknown binary. Deliberately skipped (risk R3).
```

---

## 4. Routing (server/index.js order matters)

1. CORS (production: only `ALLOWED_ORIGIN`, credentials on), helmet (**CSP disabled** until Phase 12), compression, cookie-parser, morgan, JSON/urlencoded bodies (1mb limit)
2. `/sw.js` → file. `/_nuxt/*` → 204 (silences the old Nuxt preload 404s)
3. API routers, all under `/api`: health → `/api/auth` → cms → products → cart → orders → payments. **cms is mounted before products**, so `/api/products/featured` matches before `/api/products/:id`.
4. Static: `/css`, `/js` (immutable 30d), `/images`, `/fonts`, `/assets`, `/listing`, `/help-center`
5. Pages: `/download`, `/sitemap`, `/search/:id` → `public/search.<id>.html` (falls through to next() if missing)
6. `*` → `index.html` (SPA catch-all, so any unknown path returns the homepage with status 200)

## 5. API surface

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | /api/ping | – | plain `OK`, no DB (used for cron keep-alive) |
| GET | /api/health | – | DB check. 503 if DB down |
| POST | /api/auth/register, /login | – | sets httpOnly `accessToken`/`refreshToken` cookies AND returns tokens in the body |
| POST | /api/auth/refresh | – | body `refreshToken` or cookie. Rotates both tokens. Stateless, so no revocation |
| POST | /api/auth/logout | – | clears cookies |
| GET | /api/auth/me | ✔ | `{ user }` |
| GET | /api/categories | – | `{ categories: [ {..., subcategories: []} ] }` (2-level tree) |
| GET | /api/products | – | `?page&limit(≤50)&category_id|category_slug&min_price&max_price&sort` |
| GET | /api/products/:id | – | numeric id or slug. Includes images, skus, active flash sale |
| GET | /api/products/featured | – | (cms.js) |
| GET | /api/search?q= | – | ILIKE on name/description/sku. Returns `{ query, products, pagination }`. Bumps `search_keywords.search_count` |
| GET | /api/banners?type= | – | `home_top|home_small|category|popup` |
| GET | /api/flash-sales | – | active by time window |
| GET | /api/search-keywords/hot | – | returns **`{ keywords: [...] }`** (an object, not an array) |
| GET | /api/cart | ✔ | includes `item_count`, subtotal |
| POST | /api/cart/items · PUT/DELETE /api/cart/items/:id · POST /api/cart/merge | ✔ | merge = guest localStorage cart on login |
| POST | /api/orders | ✔ | from `items[]` (buy now) or from the cart. Transactional SKU stock decrement. Clears the cart |
| GET | /api/orders, /api/orders/:id | ✔ | owner only |
| PATCH | /api/orders/:id/cancel | ✔ | restores stock |
| POST | /api/payments/initiate | ✔ | `{ order_id, phone_number }`. Phone normalised to `2547…`. STK push via PayHero SDK, or a sandbox reference if credentials are missing or the call fails |
| POST | /api/payments/webhook | – | finds the order by `external_reference` (= order_number) or `payhero_reference`. Sets paid or failed |
| GET | /api/payments/status/:order_id | ✔ | always reports `payment_method: 'M-Pesa'` |

Business rules currently in code:
- Shipping is **free when subtotal ≥ KES 5000**, otherwise KES 150.
- Order number is `KLM<ms timestamp><4 digits>`.
- Discount is always 0.
- Price comes from the SKU when `sku_id` is given, else `products.price`. Stock is only tracked on `product_skus` (products without a SKU have unlimited stock).
- Flash-sale prices are **not** applied at checkout.

Error shapes vary by route. `validate()` returns 422 `{error, errors}`. Inline `schema.parse` in orders/payments returns 422 `{error, details}`. Auth errors are `{ error: 'Unauthorized', message }`.

## 6. Data model (002_schema.sql)

users(role: customer|seller|admin) · addresses(county/subcounty/area, Kenyan format) · categories(self-ref parent_id) · products(sku, slug, price, original_price, main_image_url, seller_name, rating_score, review_count, sales_count) · product_images · product_skus(spec_name, price, stock ≥ 0) · flash_sales · banners · search_keywords · cart_items(unique user+product+sku) · orders(status: pending|paid|processing|shipped|delivered|cancelled|refunded; payment_status: unpaid|paid|failed|refunded; currency KES; payhero_reference, payhero_checkout_url) · order_items (denormalised name/spec/price) · reviews.

Seed: 3 users (customer/seller/admin @kilimall.ke; the password hash looks like a placeholder, so these accounts probably can't log in), 7 categories, 4 products (e.g. Infinix), 5 SKUs, 2 flash sales, 3 banners, 5 hot keywords. Seed image URLs point to Unsplash.

---

## 7. Phase status (as of 2026-10-01, last commit `d4f3274`)

- Phases 1–5: **APPROVED**
- Phases 6 (Cart), 7 (Orders), 8 (Payments), 9 (Frontend core UI): **AWAITING USER VERIFICATION**
- Phase 10 (SEO/analytics): DEFERRED. Phase 11 (Seller portal, needs UI files from the user): NOT STARTED. Phase 12 (hardening: rate limits, CSP nonces, Sentry, load test, OWASP): NOT STARTED.
- Recent work has been fixing search on the frontend in `public/js/kilimall-ui.js`. The tracker checklist was corrected on 2026-10-02 (8.4 and 9.3–9.7 are no longer ticked).

Note: the tracker's section B marks 9.3–9.7 as done, but `kilimall-ui.js` currently only does: Kenya label/region-modal hiding, `/api/auth/me` header name, cart badge count, search-bar binding, search results rendering, and hot keywords. **No banner, flash-sale, featured, product-detail, add-to-cart, checkout, M-Pesa, or login-form wiring exists yet.**

---

## 8. Known issues found during analysis

1. ~~Search results never rendered~~ **Fixed 2026-10-02** (not yet committed): the `var products` line had been swallowed by a `//` comment.
2. ~~Search URL served the homepage~~ **Fixed 2026-10-02**: `/search/:id` now accepts `<id>` and `<id>.html`, and the client uses `/search/010616`. The test now compares the served bytes with `search.010616.html`.
3. **Open (needs a user decision):** search result cards use relative `listing/<db id>.html` and `images/...` URLs. From `/search/...` these resolve under `/search/`. The `public/listing/*.html` files are named by the ORIGINAL Kilimall ids, not DB ids 1–4. Options: A) import the 9 listings into the DB, B) use one listing page as a template filled from `/api/products/:id`, C) leave cards unclickable. Recommended: B (or A for a real catalogue).
4. ~~Hot keywords never rendered~~ **Fixed 2026-10-02**: the client now reads `{ keywords }`.
5. **Open:** `/api/payments/webhook` has **no signature or authenticity check** (tracker 8.4 says it's done). Anyone who knows an order number can mark it paid. The amount is also not compared with `total_amount`. It isn't idempotent, and a failed callback can overwrite an already-paid order.
6. **Open:** if the STK push fails, `/payments/initiate` still returns `STK_PUSH_SENT` with a fake reference. That hides real failures in production.
7. `POST /api/orders` inserts a new address *before* `BEGIN`, so the address is kept even when the order is rolled back (for example, on an empty cart). The client is released correctly in `finally`.
8. **Open:** JWT secrets silently fall back to hardcoded dev values if the env vars are missing.
9. No rate limiting (planned for Phase 12, but the tracker says auth limiting was planned for Phase 3). CSP is off.
10. The unused legacy `server/db/schema.sql` could confuse readers.

---

## 9. Working tips

- The frontend is pre-rendered Vue (Vant UI) markup without its original app runtime for most behaviour. Bind with capture-phase listeners and a MutationObserver, as `kilimall-ui.js` does. Selectors seen: `#pc__search-input .van-field__control`, `.search-button`, `.listings`, `.listing-item > .inner-listing > .product-item`, `.router-jump-animation` (loading overlay, hide it).
- `kilimall-ui.js` is ES5 style (`var`, `function`, no build step). Keep it that way.
- To inject the bridge into more pages, re-run `node scripts/inject-ui-script.js`. It's idempotent, but only covers top-level `public/*.html`.
- Static HTML files are huge (200–330 KB, minified). Use grep for specific selectors instead of reading whole files.
- Every phase must update `RECONSTRUCTION_TRACKER.md`: checklist, phase history (commit SHA, deploy ID, live verification), and the risk register.
