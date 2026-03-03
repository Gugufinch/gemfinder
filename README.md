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

### How to validate Gmail is working in production
1. Confirm these env vars are set on the live deploy:
   - `APP_URL`
   - `NEXT_PUBLIC_APP_URL`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GMAIL_TOKEN_SECRET`
2. In Google Cloud, confirm the OAuth client uses the exact live callback URL:
   - `https://your-app.example.com/api/ar/gmail/callback`
3. Sign into Gem Finder with an editor or admin account.
4. Open a project, then open any artist with an email address.
5. Go to the artist `Inbox` tab or the project `Mailboxes` settings panel.
6. Click `Connect My Gmail`.
7. After Google approval, Gem Finder should return to `/ar` and automatically validate the mailbox.
8. Verify these fields show real values:
   - `Connected: Yes`
   - connected Gmail address
   - last token refresh time
   - granted scopes
9. Run:
   - `Test Profile`
   - `Test Gmail API`
10. Expected result:
   - profile test shows `Gmail connected for {email}`
   - Gmail API test returns success and sample message ids
11. Then use `Sync Gmail` on an artist with a known email to pull threads into:
   - the artist `Inbox` tab
   - the project-wide `Inbox` view

If Gmail connect fails:
- `redirect_uri_mismatch`: callback URL in Google Cloud does not match `APP_URL`
- `invalid_client`: wrong `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET`
- `invalid_grant`: refresh token revoked or expired, disconnect and reconnect
- `No refresh token returned`: reconnect with consent and confirm `access_type=offline`
- Google access blocked: for internal OAuth, use an allowed `songfinch.com` Google account

## Auth model
- Gem Finder uses its own email/password auth.
- Supabase Auth is not required.
- If `DATABASE_URL` is missing, Gem Finder falls back to a local JSON store for development only.
