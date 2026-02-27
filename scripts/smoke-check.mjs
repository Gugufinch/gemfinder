const base = (process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3100').replace(/\/$/, '');
const secret = process.env.INGEST_CRON_SECRET || process.env.CRON_SECRET || 'change-me';

const checks = [
  {
    name: 'root redirect',
    request: () => fetch(`${base}/`, { redirect: 'manual' }),
    validate: async (res) => {
      if (!(res.status === 307 || res.status === 308)) {
        throw new Error(`expected redirect, got ${res.status}`);
      }
      const location = res.headers.get('location') || '';
      if (!location.includes('/news')) {
        throw new Error(`expected redirect to /news, got ${location}`);
      }
      return `redirect ${res.status} -> ${location}`;
    }
  },
  {
    name: 'signals live',
    request: () => fetch(`${base}/api/signals/live`),
    validate: async (res) => {
      if (!res.ok) {
        throw new Error(`status ${res.status}`);
      }
      const body = await res.json();
      if (typeof body.ingestCounter !== 'number') {
        throw new Error('missing ingestCounter');
      }
      return `ingestCounter=${body.ingestCounter}, recentCount=${body.recentCount}`;
    }
  },
  {
    name: 'signals payload',
    request: () =>
      fetch(
        `${base}/api/signals?channel=TODAY&timezone=${encodeURIComponent('America/Chicago')}&only24h=true&userId=smoke-user`
      ),
    validate: async (res) => {
      if (!res.ok) {
        throw new Error(`status ${res.status}`);
      }
      const body = await res.json();
      const heroTitle = body?.hero?.title || 'none';
      const rowCount = Array.isArray(body?.rows) ? body.rows.length : 0;
      return `hero=${heroTitle.slice(0, 70)}${heroTitle.length > 70 ? '...' : ''}, rows=${rowCount}`;
    }
  },
  {
    name: 'cron ingest',
    request: () =>
      fetch(`${base}/api/cron/ingest`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`
        }
      }),
    validate: async (res) => {
      if (!res.ok) {
        throw new Error(`status ${res.status}`);
      }
      const body = await res.json();
      if (!body.ok) {
        throw new Error('ok flag missing');
      }
      return `ingestedStories=${body.ingestedStories}, clusters=${body.clusteredSignals}`;
    }
  }
];

console.log(`BONAFIED smoke: ${base}`);

let failures = 0;
for (const check of checks) {
  try {
    const res = await check.request();
    const detail = await check.validate(res);
    console.log(`PASS  ${check.name}  ${detail}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL  ${check.name}  ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures) {
  console.error(`Smoke failed (${failures} failing checks).`);
  process.exit(1);
}

console.log('Smoke passed.');
