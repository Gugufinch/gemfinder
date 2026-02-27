# Deploy Gem Finder Live (Vercel) - Step by Step

This guide is intentionally simple. Follow it in order.

## 0. What you need before starting
1. A GitHub account.
2. A Vercel account.
3. A hosted Postgres database (Neon is easiest).
4. A hosted Redis database (Upstash is easiest).
5. At least one AI key:
   - OpenAI key, or
   - Anthropic key
6. Optional but recommended: SMTP credentials for password reset emails.

## 1. Push your code to GitHub
Run these commands in the project folder:

```bash
cd "/Users/gugumax/Documents/New project"
git init
git add .
git commit -m "Prepare Gem Finder for production deploy"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

If your repo already exists, skip `git init` and `remote add`.

## 2. Create Postgres (Neon)
1. Go to [Neon](https://neon.tech/) and create a project.
2. Copy the connection string.
3. Save it. You will paste it into Vercel as `DATABASE_URL`.
4. Make sure SSL is enabled. Use `sslmode=require`.

## 3. Create Redis (Upstash)
1. Go to [Upstash](https://upstash.com/) and create Redis.
2. Copy the Redis URL.
3. Save it. You will paste it into Vercel as `REDIS_URL`.

## 4. Create the Vercel project
1. Go to [Vercel](https://vercel.com/new).
2. Import your GitHub repo.
3. Framework preset should auto-detect as Next.js.
4. Click Deploy once. It may fail until env vars are set. That is fine.

## 5. Add production environment variables in Vercel
In Vercel project settings, open **Environment Variables** and add these:

Required:
- `NEXT_PUBLIC_APP_URL` = `https://YOUR_DOMAIN`
- `APP_URL` = `https://YOUR_DOMAIN`
- `DATABASE_URL` = your Neon URL
- `DATABASE_SSL` = `require`
- `REDIS_URL` = your Upstash URL
- `INGEST_CRON_SECRET` = long random string
- `CRON_SECRET` = same value as `INGEST_CRON_SECRET`
- `AR_DEFAULT_ADMIN_EMAILS` = your email

Auth behavior:
- `AR_SELF_SIGNUP` = `true` (or `false` if invite-only)
- `AR_ALLOWED_EMAILS` = optional comma list

AI:
- `OPENAI_API_KEY` = your OpenAI key (optional if using Anthropic only)
- `ANTHROPIC_API_KEY` = your Anthropic key (optional if using OpenAI only)

Optional (password reset email):
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

Optional ingestion providers:
- `NEWSAPI_KEY`
- `GNEWS_API_KEY`

## 6. Redeploy
1. In Vercel, open **Deployments**.
2. Click **Redeploy** on latest commit.
3. Wait until status is **Ready**.

## 7. Add your domain
1. In Vercel, open **Settings -> Domains**.
2. Add your domain.
3. Follow DNS instructions from Vercel.
4. Wait for domain status to become active.

## 8. Verify app routes
Open:
- `https://YOUR_DOMAIN/ar`
- `https://YOUR_DOMAIN/ar/admin`

Expected:
- `/ar` shows login/signup page.
- `/ar/admin` redirects to `/ar` unless you are logged in as admin.

## 9. Create first admin account
1. Go to `/ar?mode=signup`.
2. Sign up with the email listed in `AR_DEFAULT_ADMIN_EMAILS`.
3. Log in.
4. Open `/ar/admin` and verify access.

## 10. Verify AI and cron
1. In app, test AI Intel and AI Draft on one artist.
2. Check cron:
   - `vercel.json` already includes a 15-minute cron.
   - Route: `/api/cron/ingest`
   - It uses `CRON_SECRET` / `INGEST_CRON_SECRET`.

## 11. Optional hardening (after launch)
1. Set `AR_SELF_SIGNUP=false` if you want invite-only users.
2. Set `AR_ALLOWED_EMAILS` allowlist.
3. Rotate secrets every 60-90 days.

## Quick troubleshooting
1. `Internal Server Error` right after deploy:
   - check `DATABASE_URL` and `REDIS_URL`.
2. AI shows empty response:
   - verify AI key env vars in Vercel.
3. Password reset not sending:
   - verify SMTP vars.
4. `/ar/admin` blocked for admin:
   - verify your signup email is in `AR_DEFAULT_ADMIN_EMAILS`.
