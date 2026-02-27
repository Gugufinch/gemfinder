const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000';
const secret = process.env.INGEST_CRON_SECRET || process.env.CRON_SECRET || '';
const intervalMinutes = Number(process.env.INGEST_INTERVAL_MINUTES || 15);
const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000;

async function triggerIngestion(options = { quietNetworkErrors: false }) {
  const started = new Date();
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/cron/ingest`, {
      method: 'POST',
      headers: secret ? { Authorization: `Bearer ${secret}` } : {}
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error(`[ingest-worker] ${started.toISOString()} failed`, response.status, data);
      return false;
    }

    console.log(
      `[ingest-worker] ${started.toISOString()} ok +${data.ingestedStories || 0} stories, clusters ${
        data.clusteredSignals || 0
      }`
    );
    return true;
  } catch (error) {
    if (options.quietNetworkErrors) {
      console.warn(`[ingest-worker] ${started.toISOString()} waiting for app readiness`);
    } else {
      console.error(`[ingest-worker] ${started.toISOString()} error`, error);
    }
    return false;
  }
}

async function warmupAndTrigger() {
  const retries = 8;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const ok = await triggerIngestion({ quietNetworkErrors: true });
    if (ok) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

console.log(`[ingest-worker] started for ${baseUrl} every ${intervalMinutes} minute(s)`);
await warmupAndTrigger();
setInterval(triggerIngestion, intervalMs);
