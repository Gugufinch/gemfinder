import fs from 'node:fs';
import path from 'node:path';

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, 'utf8');
  const out = {};
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx < 0) return;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    out[key] = value;
  });
  return out;
}

function looksPlaceholder(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return true;
  if (v === 'change-me' || v === 'your-secret-here' || v === 'todo') return true;
  const tokens = [
    'your-domain',
    'replace-with',
    'username:password',
    '@host',
    'example.com',
    'your_username',
    'your_repo',
  ];
  return tokens.some((token) => v.includes(token));
}

function printStatus(ok, label, detail = '') {
  const tag = ok ? 'PASS' : 'FAIL';
  const suffix = detail ? `  ${detail}` : '';
  console.log(`${tag}  ${label}${suffix}`);
}

function printWarn(label, detail = '') {
  const suffix = detail ? `  ${detail}` : '';
  console.log(`WARN  ${label}${suffix}`);
}

const envFileArg = process.argv[2] || '.env.local';
const envFilePath = path.resolve(process.cwd(), envFileArg);
const fileEnv = parseEnvFile(envFilePath);
const env = { ...fileEnv, ...process.env };

console.log(`Deploy preflight using ${envFilePath}`);
if (!fs.existsSync(envFilePath)) {
  printWarn('Env file not found', 'Using process environment only');
}

let failures = 0;

const required = [
  'NEXT_PUBLIC_APP_URL',
  'APP_URL',
  'DATABASE_URL',
  'REDIS_URL',
];

required.forEach((key) => {
  const value = env[key];
  const ok = !!value && !looksPlaceholder(value);
  printStatus(ok, key, ok ? '' : 'missing or placeholder');
  if (!ok) failures += 1;
});

const cronSecret = env.INGEST_CRON_SECRET || env.CRON_SECRET;
const cronOk = !!cronSecret && !looksPlaceholder(cronSecret);
printStatus(cronOk, 'INGEST_CRON_SECRET or CRON_SECRET', cronOk ? '' : 'set one of these');
if (!cronOk) failures += 1;

const aiOk = (!!env.OPENAI_API_KEY && !looksPlaceholder(env.OPENAI_API_KEY)) ||
  (!!env.ANTHROPIC_API_KEY && !looksPlaceholder(env.ANTHROPIC_API_KEY));
printStatus(aiOk, 'OPENAI_API_KEY or ANTHROPIC_API_KEY', aiOk ? '' : 'set at least one');
if (!aiOk) failures += 1;

if (!env.AR_DEFAULT_ADMIN_EMAILS) {
  printWarn('AR_DEFAULT_ADMIN_EMAILS', 'recommended so your first account is admin');
}

const appUrl = String(env.APP_URL || '');
const publicUrl = String(env.NEXT_PUBLIC_APP_URL || '');
const appIsHttps = appUrl.startsWith('https://');
const publicIsHttps = publicUrl.startsWith('https://');
if (!appIsHttps || !publicIsHttps) {
  printWarn('HTTPS URLs', 'APP_URL and NEXT_PUBLIC_APP_URL should be https in production');
}

if (/localhost|127\.0\.0\.1/.test(appUrl) || /localhost|127\.0\.0\.1/.test(publicUrl)) {
  printWarn('Local URLs detected', 'Replace localhost URLs before deploying');
}

if (/localhost|127\.0\.0\.1/.test(String(env.DATABASE_URL || ''))) {
  printWarn('Local Postgres URL detected', 'Use hosted Postgres in production');
}

if (/localhost|127\.0\.0\.1/.test(String(env.REDIS_URL || ''))) {
  printWarn('Local Redis URL detected', 'Use hosted Redis in production');
}

if (failures > 0) {
  console.error(`\nDeploy preflight failed with ${failures} blocking issue(s).`);
  process.exit(1);
}

console.log('\nDeploy preflight passed. You are ready to deploy.');
