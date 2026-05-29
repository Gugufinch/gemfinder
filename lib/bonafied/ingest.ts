import { runIngestCycle } from '@/lib/bonafied/repository';

export async function ingestFeeds() {
  return runIngestCycle();
}
