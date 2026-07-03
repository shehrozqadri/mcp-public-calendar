# Cloudflare Pages Deployment Guide

Deploy **MongoDB Certification Program (MCP) Portal** to Cloudflare Pages with Pages Functions handling backend logic and MongoDB Atlas as the data layer.

## Architecture

```
┌──────────────┐    HTTPS     ┌────────────────────────┐    Driver     ┌──────────────────┐
│    Browser   │ ───────────► │  Cloudflare Pages      │ ────────────► │  MongoDB Atlas   │
│  (React SPA) │              │  + Pages Functions     │  (TLS/TCP)    │  (mcp-forge DB)  │
└──────────────┘              │  (nodejs_compat)       │               └──────────────────┘
                              └────────────────────────┘
```

- **Frontend**: React SPA built to `frontend/build/`, served as static assets by Cloudflare's global CDN
- **Backend**: Cloudflare Pages Functions in `/functions/api/*` (JavaScript, V8 runtime with Node.js compatibility)
- **Data**: MongoDB Atlas accessed via the official `mongodb` npm driver (v6+)
- **Auth**: JWT (HS256) signed with Web Crypto API, stored in `HttpOnly` + `Secure` + `SameSite=Strict` cookies

## Prerequisites

1. Cloudflare account (free plan is fine)
2. MongoDB Atlas cluster (existing `mcp-forge` DB)
3. `wrangler` CLI installed: `npm install -g wrangler`

## MongoDB Atlas Setup

1. **Network Access**: In Atlas, add `0.0.0.0/0` to the IP Access List (Cloudflare uses shared IPs). For production, use **MongoDB Atlas Private Endpoint** or IP allowlisting per region.
2. **Database User**: Create a read-only user with access limited to `mcp-forge` database (and write access to `customer_logins` collection only if audit trail is enabled).
3. **Copy the SRV connection string** (looks like `mongodb+srv://user:pass@cluster.mongodb.net/`).

## Deploy Steps

### 1. Push to GitHub

```bash
cd /app
git init
git add .
git commit -m "MCP Portal - Cloudflare Pages ready"
git remote add origin https://github.com/YOUR_USERNAME/mcp-portal.git
git push -u origin main
```

### 2. Create Cloudflare Pages Project

1. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. Select the repo
3. Build settings:
   - **Framework preset**: `Create React App`
   - **Build command**: `cd frontend && yarn install --frozen-lockfile && yarn build`
   - **Build output directory**: `frontend/build`
   - **Root directory**: `/` (leave blank)
4. **Environment variables** (build-time):
   - `NODE_VERSION` = `20`
   - `REACT_APP_BACKEND_URL` = your production URL (e.g., `https://mcp-portal.pages.dev`) or empty to use relative paths

### 3. Configure Runtime Secrets

Under the Pages project → **Settings** → **Environment variables** → **Production**, add these as **Secrets** (encrypted):

| Name | Value |
|------|-------|
| `MONGO_URL` | Your MongoDB Atlas SRV connection string |
| `DB_NAME` | `mcp-forge` |
| `JWT_SECRET` | A random 64-character hex string (generate with `openssl rand -hex 32`) |
| `ALLOWED_ORIGIN` | Your Pages URL (e.g., `https://mcp-portal.pages.dev`) |

### 4. Enable `nodejs_compat`

Already configured in `wrangler.toml`. Cloudflare Pages will pick this up automatically. Verify under **Settings** → **Functions** → **Compatibility flags** that `nodejs_compat` is present.

### 5. Deploy

Trigger a deployment (push to main or click **Retry deployment**). First deploy ~2 minutes.

### 6. Verify

Visit your Pages URL:
- `GET /api/health` should return `{"status": "ok", ...}`
- Login flow should work end-to-end with a valid SPOC email

## Frontend API URL Configuration

The React app uses `REACT_APP_BACKEND_URL`. When the frontend and Pages Functions are on the **same origin** (recommended), set `REACT_APP_BACKEND_URL` to an **empty string** so requests hit `/api/...` on the same domain. This eliminates CORS complexity and ensures cookies work.

If you're using a separate custom domain for the API, set `REACT_APP_BACKEND_URL=https://api.yourdomain.com` and configure `ALLOWED_ORIGIN` accordingly.

## Local Development

```bash
# Terminal 1 - React dev server
cd frontend && yarn start

# Terminal 2 - Pages Functions (local emulation)
wrangler pages dev frontend/build --compatibility-flags=nodejs_compat
```

## Security Features

- **JWT** in `HttpOnly` + `Secure` + `SameSite=Strict` cookies (8-hour expiry)
- **CSP** header restricting scripts, styles, and connections
- **HSTS** with 1-year `max-age` and `preload`
- **X-Frame-Options: DENY** to prevent clickjacking
- **X-Content-Type-Options: nosniff**
- **Referrer-Policy: strict-origin-when-cross-origin**
- **Permissions-Policy** disabling camera/mic/geolocation/payment
- **Rate limiting** on `/api/auth/login` (10 requests/minute/IP)
- **Input validation** on all endpoints (length, format, email)
- **CORS** locked to `ALLOWED_ORIGIN` (no wildcards)
- **MongoDB** connection uses TLS, read-only credentials, and connection pooling

## Bonus: Custom Domain

1. Cloudflare Pages → your project → **Custom domains** → **Set up a custom domain**
2. Add your domain (e.g., `mcp.example.com`)
3. Update `ALLOWED_ORIGIN` secret to `https://mcp.example.com`
4. Redeploy

## Notes

- The existing FastAPI backend (`/app/backend`) remains functional for the E1 preview environment. It is **not** deployed to Cloudflare — Pages Functions in `/app/functions` replace it in production.
- SSE (Server-Sent Events) is **not** supported by Pages Functions the same way as FastAPI (long-lived connections have edge timeouts). The React app falls back to periodic polling (Refresh button + on-filter-change reload) when SSE is unavailable.
- MongoDB driver connection is cached at module scope for warm-request reuse; cold starts add ~500ms for the initial TLS handshake.
