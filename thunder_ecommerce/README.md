# ShopEase / Thunder Marketplace

The existing HTML/CSS/JavaScript storefront uses the ShopEase Express and MySQL backend. Product browsing and guest carts are public; authentication is required for customer checkout and personal orders. Admin APIs independently enforce the admin role.

## Requirements

- Node.js 18+
- MySQL 8+
- Optional: VS Code Live Server

## Database setup

### New installation

Run `database/schema.sql` in MySQL Workbench or the MySQL command line. It creates the 12 marketplace tables, their foreign keys and indexes, and the editable Thunder sample catalogue.

### Existing installation

Run each migration only if the corresponding upgrade has not already been applied:

1. On the original starter database, run `database/migration_order_management.sql`.
2. Then run `database/migration_public_catalog_guest_cart.sql`.
3. Run `database/migration_marketplace_complete.sql` once to add delivery snapshots, COD payment records, product visibility/images, and order-status history.

If the database already includes order management and the public catalogue, run only `migration_marketplace_complete.sql`. The marketplace migration preserves existing customers, products, and orders; existing payments are recorded as pending, not falsely marked paid.

## Windows setup

1. In PowerShell from the `thunder_ecommerce` directory:
   ```powershell
   cd backend
   npm install
   Copy-Item .env.example .env
   ```
2. Edit `backend/.env` with MySQL credentials, a private random `JWT_SECRET` of at least 32 characters, and the frontend origin in `CLIENT_ORIGIN`. Generate a secret with:
   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
3. Start the API:
   ```powershell
   npm run dev
   ```
   Confirm it responds at `http://localhost:5000/api/health`.
4. Serve `frontend/index.html` through Live Server (or another static web server). Product browsing and guest cart work without an account.
5. Register an account, then promote it for admin access:
   ```sql
   USE shop_ease;
   UPDATE users SET role='admin' WHERE email='your-admin-email@example.com';
   ```
   Log in again to issue a fresh role token. The admin portal is at `http://localhost:5501/admin/` when using the local frontend server; it is not linked from the public storefront.

## Render deployment

Deploy the backend and frontend as separate services from the `main` branch.

### Backend web service

- **Repository:** `rajeev8964/ShopEase_Ecommerce_PBL_Project`
- **Branch:** `main`
- **Root Directory:** `thunder_ecommerce/backend`
- **Build Command:** `npm ci`
- **Start Command:** `npm start`
- **Health Check Path:** `/api/health`

Set these environment variables in the Render service dashboard. Render supplies `PORT`; do not hardcode it.

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | A new private random value of at least 32 characters |
| `DB_HOST` | The hostname supplied by the production MySQL provider (not `localhost` or `127.0.0.1`) |
| `DB_PORT` | The production MySQL port, commonly `3306` |
| `DB_USER` | The production MySQL username |
| `DB_PASSWORD` | The production MySQL password |
| `DB_NAME` | The existing production database name |
| `DB_SSL` | `true` (production requires verified TLS) |
| `DB_SSL_CA` | Optional PEM certificate if the provider uses a private/custom CA |
| `CLIENT_ORIGIN` | The exact HTTPS origin of the Render Static Site, without a trailing slash |

`CLIENT_ORIGIN` accepts comma-separated origins when multiple frontend domains are needed. Do not put credentials in the repository or in the frontend.
Set `DB_PORT` explicitly to the port supplied by the hosted provider. For Railway accessed from Render, use the public TCP proxy hostname and port, not Railway's internal service hostname or port. If a custom CA is needed, set `DB_SSL_CA` to its PEM contents; certificate verification remains enabled.

### Frontend Static Site

- **Repository:** `rajeev8964/ShopEase_Ecommerce_PBL_Project`
- **Branch:** `main`
- **Root Directory:** `thunder_ecommerce/frontend`
- **Build Command:** Leave blank
- **Publish Directory:** `.`

The frontend selects `http://localhost:5000/api` on localhost and the production backend URL on non-local hosts. It also uses that backend origin for `/uploads/...` image URLs. After creating the Static Site, copy its actual HTTPS URL into the backend's `CLIENT_ORIGIN`.

### Uploaded images

Bundled images under `frontend/assets/products/` are part of the static site and do not need persistent storage. Admin-uploaded files are stored on the backend filesystem, which is ephemeral on Render by default. To preserve those uploads across deploys, attach a persistent disk to the web service at `/var/data` and set `UPLOADS_DIR=/var/data/uploads`. Without a disk or external object storage, expect uploaded files to be lost when the service is replaced.

The current Render API health endpoint is `/api/health`. It checks MySQL connectivity and returns HTTP 503 with a non-sensitive JSON response when the database is unavailable. The root URL returns API information; use `/api/health` for service and database health.

The production MySQL host, username, password, database name, TLS requirements, and actual Static Site URL are provider/account-specific and must be entered in Render; they cannot be inferred from this repository. Do not run schema migrations against an existing production database until its current schema has been verified and a backup exists.

## Customer workflow

1. Browse the public catalogue, category shortcuts, search/filter/sort products, and add products to the localStorage guest cart.
2. Checkout redirects unauthenticated customers to `account.html`. After registration or login, the guest cart is merged into the account cart, duplicate quantities are combined, and quantities are capped to stock.
3. Enter recipient name, email, Indian mobile, and the complete delivery address. Mobile and PIN are validated in the browser and API.
4. The only configured payment option is **Cash on Delivery**. A COD payment record starts as `Pending`; no payment is reported as successful.
5. The API calculates prices/discounts from MySQL, locks and checks stock, snapshots the order-time delivery address, creates the order/items/payment/history, reduces stock, and empties the cart in one transaction.
6. The customer confirmation page shows the unique order ID, COD payment state, totals, and items. Customers can review their own order history and status history.

## Admin

The dashboard's MySQL statistics include orders, revenue, customers, active products, pending/delivered/cancelled orders, low stock, daily/monthly sales, and best sellers. Admins can add/edit/deactivate products, upload product images, edit categories, search customers, open a separate order-details page, and update order statuses. Status history records each transition. Cancellation restores reserved stock once; reopening a cancelled order rechecks stock transactionally.

## Main API routes

| Method | Route | Access |
|---|---|---|
| POST | `/api/auth/register`, `/api/auth/login` | Public |
| GET | `/api/products`, `/api/products/:id`, `/api/categories` | Public |
| POST/PUT/DELETE | `/api/admin/products`, `/api/admin/products/:id` | Admin |
| GET | `/api/admin/products` | Admin |
| POST/GET | `/api/cart` | Customer |
| POST | `/api/cart/merge` | Customer |
| PUT/DELETE | `/api/cart/:id` | Customer |
| POST | `/api/orders` | Customer |
| GET | `/api/orders/my-orders`, `/api/orders/:id` | Customer (own orders only; admin may view order details) |
| GET | `/api/admin/orders`, `/api/admin/orders/:id` | Admin |
| PATCH | `/api/admin/orders/:id/status` | Admin |
| GET | `/api/admin/customers`, `/api/admin/dashboard` | Admin |

Never commit `backend/.env`. Before deployment, use HTTPS, set a specific `CLIENT_ORIGIN`, and configure production database credentials and hosting. Razorpay is not configured; do not mark payments paid without a verified gateway callback.
