# Inventory Management System — REST API

A backend for tracking products, stock levels across multiple warehouses, and customer orders.
Built with **Node.js, Express, PostgreSQL and Prisma**.

The focus is on correct inventory business logic rather than on breadth of features:
stock can never go negative, every stock change leaves an audit record, and confirming an
order deducts stock atomically inside a database transaction.

> This is a learning / portfolio project. It is a single, modular Express application with one
> PostgreSQL database — not a distributed system — and it is not production-hardened
> (see [Limitations](#limitations)).

---

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Domain model](#domain-model)
- [Authentication & authorization](#authentication--authorization)
- [Inventory & stock movements](#inventory--stock-movements)
- [Order workflow](#order-workflow)
- [Transactions & concurrency](#transactions--concurrency)
- [API reference](#api-reference)
- [Getting started](#getting-started)
- [Testing](#testing)
- [Limitations](#limitations)
- [Possible future improvements](#possible-future-improvements)

---

## Features

- **Users & auth** — registration, login, bcrypt password hashing, JWT authentication,
  three roles (`ADMIN`, `STAFF`, `VIEWER`) with role-based authorization.
- **Catalog** — categories, products (unique SKU, positive price, search/filter/pagination,
  soft delete), warehouses (activate/deactivate).
- **Multi-warehouse inventory** — stock is stored per *(product, warehouse)*, not on the product.
- **Stock in / stock out** — with business rules (no negative stock, inactive products or
  warehouses cannot receive stock, quantities must be positive).
- **Stock movement history** — every change writes an append-only `STOCK_IN` / `STOCK_OUT`
  record showing who made it and, for order deductions, which order caused it.
- **Orders** — `PENDING → CONFIRMED → DISPATCHED`. Confirming checks stock, deducts it and
  records movements in a single transaction; invalid status transitions are rejected.
- **Validation & errors** — Zod request validation and one centralized error handler with
  consistent JSON error responses and correct HTTP status codes.
- **Tests** — 48 integration tests (Jest + Supertest) against a real PostgreSQL database,
  including concurrency and rollback tests.
- **Postman collection** — a ready-made end-to-end walkthrough in `postman/`.

## Tech stack

| Concern | Choice |
|---|---|
| Runtime / framework | Node.js (≥ 20), Express 5 |
| Database | PostgreSQL |
| ORM / migrations | Prisma 6 (`engineType = "client"` with the `@prisma/adapter-pg` driver adapter) |
| Validation | Zod |
| Auth | JSON Web Tokens (`jsonwebtoken`), `bcryptjs` |
| Testing | Jest, Supertest |
| Config | `dotenv` |

Plain JavaScript (CommonJS) — no TypeScript, no build step.

## Architecture

A layered, modular monolith. Every feature module follows the same path:

```
HTTP request
   │
   ▼
Router            *.routes.js       URL + method → middleware chain → controller
   │  middleware: authenticate → authorize(roles) → validate(zod schema)
   ▼
Controller        *.controller.js   reads req, calls the service, sends the response
   ▼
Service           *.service.js      business rules, transactions
   ▼
Repository        *.repository.js   Prisma queries only
   ▼
Prisma Client → PostgreSQL

Any thrown error → centralized errorHandler → consistent JSON error response
```

```
src/
├── app.js                  builds the Express app (used by server.js and by tests)
├── server.js               checks the DB connection, then starts listening
├── config/                 env.js (validated env vars), prisma.js (single Prisma client)
├── middleware/             authenticate, authorize, validate, notFound, errorHandler
├── utils/                  AppError, jwt, pagination, shared Zod schemas
└── modules/
    ├── auth/               register, login
    ├── users/              admin user management
    ├── categories/
    ├── products/
    ├── warehouses/
    ├── inventory/          inventory reads (/inventory) + stock in/out & movements (/stock)
    └── orders/
prisma/
├── schema.prisma           data model
├── migrations/             SQL migrations (includes hand-written CHECK constraints)
└── seed.js                 development data
tests/                      Jest + Supertest integration tests
postman/                    Postman collection
```

Design notes:

- Controllers contain no business logic and no `try/catch`. Services throw `AppError`
  (status + code + message); Express 5 forwards thrown/rejected errors to `errorHandler`.
- Repository write functions accept an optional transaction client (`tx`) so a service can
  run several repository calls inside one `prisma.$transaction`.
- Nothing that other records reference is ever hard-deleted. Products and warehouses are
  deactivated, and stock movements cannot be edited or deleted through the API.

## Domain model

```
Category 1 ── * Product
Product  * ── * Warehouse       through Inventory (productId, warehouseId, quantity)
Product  1 ── * StockMovement * ── 1 Warehouse
User     1 ── * StockMovement   (performedBy)
User     1 ── * Order           (createdBy)
Warehouse 1 ── * Order          (the warehouse the order is fulfilled from)
Order    1 ── * OrderItem * ── 1 Product
Order    1 ── * StockMovement   (STOCK_OUT records created when the order was confirmed)
```

| Table | Purpose / key constraints |
|---|---|
| `users` | `email` unique; `role` enum `ADMIN / STAFF / VIEWER`; only the bcrypt hash is stored |
| `categories` | `name` unique |
| `products` | `sku` unique; `price DECIMAL(10,2)` with `CHECK (price > 0)`; `active` flag |
| `warehouses` | `name` unique; `active` flag |
| `inventory` | one row per (product, warehouse) — `UNIQUE(productId, warehouseId)`; `CHECK (quantity >= 0)` |
| `stock_movements` | `type` enum `STOCK_IN / STOCK_OUT`; `CHECK (quantity > 0)`; `performedById`; optional `orderId` |
| `orders` | `orderNumber` unique; `status` enum `PENDING / CONFIRMED / DISPATCHED`; `warehouseId`; `createdById` |
| `order_items` | `UNIQUE(orderId, productId)`; `CHECK (quantity > 0)` |

Foreign keys use `RESTRICT` (a referenced row cannot be deleted), except order items, which
are deleted with their order. Foreign-key columns that are filtered on are indexed.
The CHECK constraints are added by hand in the initial migration, because Prisma's schema
language cannot express them. They back up the service-layer rules at the database level.

## Authentication & authorization

- **Register** (`POST /auth/register`) always creates a `VIEWER`. A role in the request body
  is ignored. Passwords are hashed with bcrypt (cost 10) and never returned.
- **Login** (`POST /auth/login`) returns a signed JWT (`sub` = user id, `role`, `exp`).
  A wrong password and an unknown email return the same `401`, so the login form cannot be
  used to discover registered emails.
- **`authenticate` middleware** verifies the `Authorization: Bearer <token>` header and loads
  the user from the database on every request, so a role change or a deleted user takes
  effect immediately rather than when the token expires.
- **`authorize(...roles)` middleware** returns `403` if the user's role is not allowed.
- The first ADMIN comes from the seed script. Admins promote users with
  `PATCH /users/:id/role`, and cannot change their own role (prevents admin lock-out).

| Capability | ADMIN | STAFF | VIEWER |
|---|:-:|:-:|:-:|
| Read products, categories, warehouses, inventory | ✅ | ✅ | ✅ |
| Create/update products, categories, warehouses | ✅ | ❌ | ❌ |
| Stock in / stock out, view movement history | ✅ | ✅ | ❌ |
| Create, view, confirm, dispatch orders | ✅ | ✅ | ❌ |
| Manage users | ✅ | ❌ | ❌ |

## Inventory & stock movements

Inventory is **current state**; stock movements are **history**. Every change to an
inventory row writes a movement in the same transaction, so for every (product, warehouse):

```
inventory.quantity  ==  Σ STOCK_IN.quantity  −  Σ STOCK_OUT.quantity
```

(The test suite checks this invariant after a mix of stock-ins, stock-outs and orders.)

**Stock in** (`POST /stock/in`):
1. The product and warehouse must exist (`404`) and both must be active (`409`).
2. In a transaction: upsert the inventory row (`INSERT … ON CONFLICT DO UPDATE SET quantity = quantity + n`)
   and create a `STOCK_IN` movement.

**Stock out** (`POST /stock/out`):
1. The product and warehouse must exist (`404`). Removing stock from an inactive product or
   warehouse is allowed, so old stock can be cleared out.
2. In a transaction: a *conditional* decrement,
   `UPDATE inventory SET quantity = quantity - n WHERE … AND quantity >= n`.
   If no row was updated, respond `409 INSUFFICIENT_STOCK` with `requested` and `available`.
   Otherwise create a `STOCK_OUT` movement.

## Order workflow

```
POST /orders                 → PENDING      (validates products/warehouse; does NOT touch stock)
POST /orders/:id/confirm     → CONFIRMED    (checks + deducts stock, writes STOCK_OUT movements)
POST /orders/:id/dispatch    → DISPATCHED   (status change only)
```

- An order is fulfilled from **one warehouse** (`warehouseId`) and has one or more items.
  The same product cannot appear twice in an order.
- A `PENDING` order reserves nothing. Stock is committed only at confirmation.
- Any other transition (dispatching a `PENDING` order, confirming twice, confirming a
  `DISPATCHED` order) returns `409 INVALID_STATUS_TRANSITION`.

**Confirmation, step by step (one database transaction):**

```
BEGIN
  1. UPDATE orders SET status='CONFIRMED' WHERE id=? AND status='PENDING'
       0 rows → 404 (no such order) or 409 (wrong status)
  2. For every item, read the available stock.
       any shortage → 409 INSUFFICIENT_STOCK listing every short item → ROLLBACK
  3. For every item (in productId order):
       conditional decrement (quantity >= n) → if it fails → 409 → ROLLBACK
       INSERT STOCK_OUT movement (orderId, performedBy)
COMMIT
```

If anything fails at any step, including an unexpected database error half-way through,
the status change, all deductions and all movements are rolled back together.

## Transactions & concurrency

| Risk | How it is handled |
|---|---|
| Stock changes without a history record (or the reverse) | Inventory update and movement insert share one `prisma.$transaction` |
| Two requests remove the same stock at once | The check and the write are one conditional `UPDATE … WHERE quantity >= n`. PostgreSQL row locking makes the second request re-check against the new value |
| An order confirmed twice at the same moment | Status change is a conditional `UPDATE … WHERE status = 'PENDING'`, so only one request can win |
| Partial confirmation (item 1 deducted, item 2 fails) | Everything is in one transaction, so it all rolls back |
| Deadlock between two orders sharing products | Items are always processed in `productId` order, so rows are locked in a consistent order |
| A bug bypasses the service rules | `CHECK (quantity >= 0)` and the other CHECK constraints make PostgreSQL reject the write (mapped to `409`) |

These guarantees are covered by tests. For example, 10 simultaneous removals of 3 units from
a stock of 20 produce exactly 6 successes and a final quantity of 2, and 5 simultaneous
confirmations of one order deduct its stock exactly once.

## API reference

All endpoints except `/health` and `/auth/*` require `Authorization: Bearer <token>`.
Request and response bodies are JSON.

**Response shapes**

```jsonc
{ "data": { ... } }                                                     // single resource
{ "data": [ ... ], "meta": { "page": 1, "limit": 20, "total": 57, "totalPages": 3 } }  // paginated list
{ "error": { "code": "INSUFFICIENT_STOCK", "message": "...", "details": ... } }       // any error
```

**Status codes:** `400` validation error or malformed JSON · `401` missing, invalid or expired
token, or bad credentials · `403` role not allowed · `404` resource not found · `409` business-rule
conflict (duplicate value, insufficient stock, inactive product/warehouse, invalid status
transition) · `500` unexpected error (details are logged on the server, never returned).

| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/health` | public | `{ "status": "ok" }` |
| POST | `/auth/register` | public | `{ name, email, password }` → creates a VIEWER |
| POST | `/auth/login` | public | `{ email, password }` → `{ token, user }` |
| GET | `/users` | ADMIN | `?page&limit` |
| GET | `/users/:id` | ADMIN | |
| PATCH | `/users/:id/role` | ADMIN | `{ role }`; cannot change your own role |
| GET | `/categories` | all | |
| GET | `/categories/:id` | all | includes product count |
| POST | `/categories` | ADMIN | `{ name, description? }` |
| PATCH | `/categories/:id` | ADMIN | |
| GET | `/products` | all | `?search&categoryId&active&page&limit` — search matches name or SKU |
| GET | `/products/:id` | all | |
| POST | `/products` | ADMIN | `{ sku, name, description?, price, categoryId }` |
| PATCH | `/products/:id` | ADMIN | `{ name?, description?, price?, categoryId?, active? }` — SKU is immutable |
| DELETE | `/products/:id` | ADMIN | soft delete (`active = false`) |
| GET | `/warehouses` | all | `?active` |
| GET | `/warehouses/:id` | all | |
| POST | `/warehouses` | ADMIN | `{ name, location }` |
| PATCH | `/warehouses/:id` | ADMIN | `{ name?, location?, active? }` |
| GET | `/inventory` | all | `?productId` (one product across warehouses) `&warehouseId&page&limit` |
| GET | `/inventory/:productId/:warehouseId` | all | `quantity: 0` if never stocked there |
| POST | `/stock/in` | ADMIN, STAFF | `{ productId, warehouseId, quantity }` |
| POST | `/stock/out` | ADMIN, STAFF | `{ productId, warehouseId, quantity }` |
| GET | `/stock/movements` | ADMIN, STAFF | `?productId&warehouseId&type&page&limit`, newest first |
| POST | `/orders` | ADMIN, STAFF | `{ warehouseId, items: [{ productId, quantity }] }` |
| GET | `/orders` | ADMIN, STAFF | `?status&page&limit` |
| GET | `/orders/:id` | ADMIN, STAFF | includes items and the order's stock movements |
| POST | `/orders/:id/confirm` | ADMIN, STAFF | PENDING → CONFIRMED (deducts stock) |
| POST | `/orders/:id/dispatch` | ADMIN, STAFF | CONFIRMED → DISPATCHED |

Prices are returned as fixed two-decimal strings (e.g. `"799.00"`) to avoid floating-point
rounding.

### Example session

```bash
# 1. Log in as the seeded staff user
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"staff@ims.local","password":"Staff@12345"}' | jq -r .data.token)

# 2. Receive 20 Wireless Mice (product 1) into Jaipur Central (warehouse 1)
curl -s -X POST http://localhost:3000/stock/in -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"productId":1,"warehouseId":1,"quantity":20}'

# 3. Create an order and confirm it
ORDER=$(curl -s -X POST http://localhost:3000/orders -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"warehouseId":1,"items":[{"productId":1,"quantity":2},{"productId":2,"quantity":1}]}' | jq -r .data.id)
curl -s -X POST http://localhost:3000/orders/$ORDER/confirm -H "Authorization: Bearer $TOKEN"
```

An order that asks for more than is available is rejected:

```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Not enough stock to confirm this order",
    "details": [{ "productId": 5, "sku": "FURN-CHAIR-01", "requested": 1000, "available": 5 }]
  }
}
```

## Getting started

### Prerequisites

- Node.js 20 or newer
- PostgreSQL 14 or newer, running locally

### Setup

```bash
git clone <your-repo-url> inventory-management-system
cd inventory-management-system
npm install                      # also generates the Prisma client

# Create the databases (adjust the user if yours is not "postgres";
# on Windows you can also create them in pgAdmin)
psql -U postgres -c "CREATE DATABASE inventory_db;"
psql -U postgres -c "CREATE DATABASE inventory_test;"

# Configure environment variables
cp .env.example .env             # Windows (PowerShell): Copy-Item .env.example .env
#   → edit DATABASE_URL (your Postgres password) and set a long random JWT_SECRET

npm run db:deploy                # apply migrations
npm run db:seed                  # load development data
npm run dev                      # http://localhost:3000  (auto-restarts on file changes)
```

### Environment variables

| Variable | Required | Example | Purpose |
|---|---|---|---|
| `DATABASE_URL` | yes | `postgresql://postgres:postgres@localhost:5432/inventory_db?schema=public` | PostgreSQL connection |
| `JWT_SECRET` | yes | 32+ random characters | Signs JWTs; the app refuses to start if shorter |
| `JWT_EXPIRES_IN` | no | `1h` (default) | Token lifetime |
| `PORT` | no | `3000` (default) | HTTP port |
| `NODE_ENV` | no | `development` (default) / `test` / `production` | Environment name |

Environment variables are validated at startup. The server exits with a clear message if one
is missing or invalid, and it also refuses to start if the database is unreachable.

### Database commands

| Command | What it does |
|---|---|
| `npm run db:deploy` | Apply all migrations (non-interactive; use for setup) |
| `npm run db:migrate` | Create and apply a new migration after changing `schema.prisma` (development) |
| `npm run db:seed` | Load development data (safe to run repeatedly) |
| `npm run db:reset` | Drop the database, re-apply migrations, re-seed |
| `npm run db:studio` | Open Prisma Studio to browse data |

### Seeded development data

> ⚠️ **Development only.** These credentials exist only in the local seed script.
> Never use them anywhere real.

| Role | Email | Password |
|---|---|---|
| ADMIN | `admin@ims.local` | `Admin@12345` |
| STAFF | `staff@ims.local` | `Staff@12345` |
| VIEWER | `viewer@ims.local` | `Viewer@12345` |

The seed also creates 3 categories, 2 warehouses (Jaipur Central = 1, Delhi North = 2),
6 products (ids 1–6; `FURN-LAMP-OLD` (id 6) is deliberately **inactive**) and opening stock
recorded as `STOCK_IN` movements.

### Postman

Import `postman/IMS.postman_collection.json`, run `npm run db:reset`, start the server and run
the collection top to bottom. The login requests store tokens in collection variables, and
each request has a status-code assertion. It walks through auth, role checks, catalog
management, stock rules and the full order lifecycle.

## Testing

```bash
# one-time: create .env.test (see the bottom of .env.example) pointing at inventory_test
npm run test:db     # apply migrations to the test database
npm test            # run the suite
```

- 48 integration tests in `tests/`, run through the real Express app (Supertest) against a
  real PostgreSQL database. Every table is truncated before each test.
- Tests run serially (`--runInBand`) because they share one database.
- Coverage by area:
  - **Auth:** registration, login, hashing, token tampering and expiry, 401 vs 403, role changes.
  - **Catalog:** validation, unique SKU, soft delete, search, filters, pagination.
  - **Inventory:** stock in and out, negative-stock prevention, inactive product and warehouse rules, rollback, 10 concurrent stock-outs.
  - **Orders:** creation rules, the confirmation deduction, insufficient stock, rollback after a mid-way failure, competing confirmations, the status workflow.
  - **Invariant:** quantity always equals Σ IN − Σ OUT.

## Limitations

Intentionally out of scope for this project:

- No refresh tokens or logout/token revocation. Tokens are valid until they expire.
- No rate limiting, CORS configuration or security headers middleware.
- No order cancellation, order editing, or stock transfer between warehouses.
- No pricing on orders (no totals, taxes, payments, invoices or shipping).
- An order is fulfilled from a single warehouse. There is no automatic split across warehouses.
- No API documentation generator (OpenAPI/Swagger). The endpoint table above is the reference.

## Possible future improvements

- Order cancellation that returns stock through `STOCK_IN` movements
- Warehouse-to-warehouse transfers as a paired `STOCK_OUT` + `STOCK_IN` in one transaction
- Low-stock thresholds per product
- OpenAPI specification
- Rate limiting and security headers
- A CI workflow that runs the test suite against a PostgreSQL service

## License

MIT
