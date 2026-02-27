# BONAFIED

BONAFIED is a premium same-day news intelligence interface built on Next.js App Router.

## What is live
- `GET /news`: BONAFIED primary UI
- `GET /`: redirects to `/news`
- `GET /admin`: RSS feed admin

Legacy routes (including `/ar`) still exist in this repo but are separate from BONAFIED.
`/ar` now supports email/password auth (signup + login) for team access.

## Core MVP guarantees
- Strict 24h filter (`published_at >= now - 24h`) with timezone support (`America/Chicago` default)
- Verified same-day signal clustering + deduplication
- Channels: Business, Technology, Music Industry, Podcast/Creator Economy
- Three-pane cinematic UI with command palette (`⌘K`) and keyboard controls (`J/K`, `Enter`, `S`)
- Filed stories, dossiers, markdown/text export
- RSS ingestion + cron ingestion endpoint
- Optional NewsAPI + GNews provider ingestion (when API keys are set)
- Postgres persistence + Redis caching when configured

## Stack
- Next.js 15 + React 19 + TypeScript
- Framer Motion + Lucide
- Postgres (`pg`) for persistence
- Redis for cache acceleration

## Quick start (local dev)
```bash
npm install
npm run dev
```

Open:
- BONAFIED: `http://localhost:3000/news`
- Gem Finder: `http://localhost:3000/ar`
- Gem Finder Admin: `http://localhost:3000/ar/admin` (admin users only)

## Deploy (live team URL)
Use the full click-by-click guide:
- [DEPLOY_VERCEL_STEP_BY_STEP.md](/Users/gugumax/Documents/New%20project/DEPLOY_VERCEL_STEP_BY_STEP.md)

Before deploying, run:
```bash
npm run deploy:preflight
```

You can also copy:
- Production env template: [.env.production.example](/Users/gugumax/Documents/New%20project/.env.production.example)

## One-command production-like stack
```bash
cp .env.example .env.local
npm run first
```

`npm run first` does:
1. `docker compose up -d --build`
2. Smoke checks (`/`, `/api/signals/live`, `/api/signals`, `/api/cron/ingest`)

Compose host ports:
- App: `http://localhost:3100` (container runs on 3000 internally)
- Postgres: `localhost:5432`
- Redis: `localhost:6379`

Useful commands:
- `npm run compose:up`
- `npm run compose:down`
- `npm run compose:logs`
- `npm run smoke`

## Environment
See [.env.example](/Users/gugumax/Documents/New%20project/.env.example).

Important keys:
- `DATABASE_URL`
- `REDIS_URL`
- `INGEST_CRON_SECRET`
- `BONAFIED_MIN_FEED_CREDIBILITY` (default `0.72`, ignore lower-credibility feeds at ingestion)
- `BONAFIED_MIN_PROVIDER_CREDIBILITY` (default `0.78`, ignore low-trust API provider sources)
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY` (optional)
- `NEWSAPI_KEY` (optional, broad same-day news API)
- `GNEWS_API_KEY` (optional, broad same-day news API)
- `NEXT_PUBLIC_APP_URL` (used for reset-link URLs in dev preview and emails)
- `AR_ALLOWED_EMAILS` (optional comma-separated allowlist for `/ar` signup/login/reset)
- `AR_SELF_SIGNUP` (`true` by default, set `false` to allow only admin-created users)
- `AR_DEFAULT_ADMIN_EMAILS` (comma-separated emails that should default to admin on signup)
- `SMTP_*` keys (optional, used to email password reset links)

## Main BONAFIED APIs
- `GET /api/signals`
- `GET /api/signals/live`
- `GET /api/signals/search`
- `POST /api/ingest`
- `POST /api/cron/ingest` (requires secret)
- `GET/POST /api/feeds`
- `PATCH /api/feeds/:id`
- `GET/PATCH /api/preferences`
- `GET/POST /api/filed`
- `GET/POST /api/dossiers`
- `GET /api/dossiers/:id/export?format=markdown|text`
- `POST /api/ai/openai`
- `POST /api/ai/anthropic`

## Notes
- If outbound internet is blocked, BONAFIED continues using seeded stories.
- In live network environments, ingestion fetches external RSS feeds and updates clusters.
- If `NEWSAPI_KEY` or `GNEWS_API_KEY` are present, ingestion also pulls same-day articles from those APIs and merges them with RSS.
