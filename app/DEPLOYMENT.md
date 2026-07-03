# MCP Portal — Deployment Guide

Platform-agnostic deployment for the MongoDB Certification Program portal. The React frontend and API handlers can run on any host that supports static files plus Node.js serverless functions (or Cloudflare Pages Functions).

## Architecture

```
Browser  →  Static SPA (frontend/build)  →  /api/* handlers (server/)
                                              ↓
                                         MongoDB Atlas
```

- **Frontend**: React app in `frontend/` (build output: `frontend/build`)
- **API**: Shared handlers in `functions/api/` with platform adapters in `api/` (Vercel) or `functions/` (Cloudflare)
- **Shared logic**: `server/` (env, MongoDB, JWT, responses)

## Required environment variables

| Variable | Description |
|----------|-------------|
| `MONGO_URL` | MongoDB Atlas SRV connection string |
| `DB_NAME` | Database name (default: `mcp-forge`) |
| `JWT_SECRET` | Random secret for JWT signing (`openssl rand -hex 32`) |
| `ALLOWED_ORIGIN` | Public app URL for CORS (optional — auto-detected from request host if unset) |

Copy `.env.example` to `.env` for local development.

Verify configuration:

```bash
curl https://your-app.example.com/api/health
```

A healthy deployment returns `"status": "ok"` with `"missing": []`.

## Local development

```bash
# Terminal 1 — frontend
cd frontend && yarn start

# Terminal 2 — API (Cloudflare Pages emulation)
cp .env.example .env   # fill in values
yarn build
yarn dev
```

## Vercel

```bash
cd app
npx vercel env add MONGO_URL production
npx vercel env add DB_NAME production
npx vercel env add JWT_SECRET production
npx vercel env add ALLOWED_ORIGIN production
npx vercel --prod
```

**Important:** After adding or changing environment variables, redeploy so functions pick up the new values.

Production URL example: https://app-bay-kappa-72.vercel.app

## Cloudflare Pages

See `CLOUDFLARE_DEPLOYMENT.md` for Cloudflare-specific steps. Set secrets via:

```bash
wrangler pages secret put MONGO_URL
wrangler pages secret put JWT_SECRET
```

## Frontend API URL

When the SPA and API share the same origin (recommended), leave `REACT_APP_BACKEND_URL` empty so requests go to `/api/...` on the same domain.

For split deployments, set `REACT_APP_BACKEND_URL` at build time to your API origin.

## Security notes

- JWT stored in `HttpOnly` + `Secure` + `SameSite=Strict` cookies
- Rate limiting on `/api/auth/login`
- MongoDB Atlas: allow `0.0.0.0/0` for serverless hosts with shared egress IPs
