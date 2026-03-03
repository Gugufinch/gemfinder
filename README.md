# Gem Finder

Gem Finder is a standalone Next.js app for artist scouting, outreach, AI-assisted drafting, and team-based A&R workflow management.

## Local development
```bash
npm install
cp .env.example .env.local
npm run dev
```

Open:
- `http://localhost:3000/ar`
- `http://localhost:3000/ar/admin`

## Required environment variables
See [.env.example](/Users/gugumax/Documents/New%20project/.env.example).

Production requires:
- `NEXT_PUBLIC_APP_URL`
- `APP_URL`
- `DATABASE_URL`
- `DATABASE_SSL`
- `AR_DEFAULT_ADMIN_EMAILS`

Optional:
- `AR_SELF_SIGNUP`
- `AR_ALLOWED_EMAILS`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GMAIL_TOKEN_SECRET`
- `SMTP_*`

## Production deploy
This is a standard Node-based Next.js app.

Build:
```bash
npm run build
```

Start:
```bash
npm run start
```

Use any standard Node host such as Render, Railway, Fly.io, or Vercel.

## Gmail integration
To enable Gmail connect, in-app email sending, and inbox sync you also need:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GMAIL_TOKEN_SECRET`

OAuth callback URL:
```text
https://your-app.example.com/api/ar/gmail/callback
```

## Auth model
- Gem Finder uses its own email/password auth.
- Supabase Auth is not required.
- If `DATABASE_URL` is missing, Gem Finder falls back to a local JSON store for development only.
