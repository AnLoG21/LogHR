import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const notificationQueue = new Queue('notifications', { connection });
export const jobBoardQueue = new Queue('job-boards', { connection });

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const WORKER_TOKEN = process.env.WORKER_TOKEN || '';

async function processNotification(job: { name: string; data: any }) {
  const { channel, to, templateCode, text, vars } = job.data || {};
  if (channel === 'SMS' && to && text) {
    const res = await fetch(`${API}/api/notifications/sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(WORKER_TOKEN ? { Authorization: `Bearer ${WORKER_TOKEN}` } : {}) },
      body: JSON.stringify({ to, text }),
    });
    return { ok: res.ok, status: res.status };
  }
  if (to && templateCode) {
    const res = await fetch(`${API}/api/notifications/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, templateCode, vars: vars || {} }),
    });
    return { ok: res.ok, status: res.status };
  }
  console.log('[worker] notification noop', job.name, job.data);
  return { ok: true, skipped: true };
}

async function runAutoPublish() {
  const res = await fetch(`${API}/api/publications/auto-run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(WORKER_TOKEN ? { 'x-worker-token': WORKER_TOKEN } : {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

new Worker(
  'notifications',
  async (job) => {
    console.log(`[worker] notification job ${job.id}`, job.name);
    try {
      return await processNotification(job);
    } catch (e: any) {
      console.error('[worker] notification failed', e?.message);
      throw e;
    }
  },
  { connection },
);

new Worker(
  'job-boards',
  async (job) => {
    console.log(`[worker] job-board job ${job.id}`, job.name, job.data);
    if (job.name === 'auto-publish' || job.name === 'auto-run') {
      return runAutoPublish();
    }
    if (job.name === 'search' && job.data?.board) {
      try {
        const res = await fetch(`${API}/api/job-boards/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(job.data),
        });
        return { ok: res.ok, status: res.status };
      } catch (e: any) {
        return { ok: false, error: e?.message };
      }
    }
    return { ok: true };
  },
  { connection },
);

// Repeatable cron every 5 minutes
jobBoardQueue
  .add(
    'auto-publish',
    {},
    {
      repeat: { every: 5 * 60 * 1000 },
      removeOnComplete: 50,
      removeOnFail: 50,
    },
  )
  .then(() => console.log('[worker] auto-publish repeat scheduled (5m)'))
  .catch((e) => console.warn('[worker] auto-publish schedule failed', e?.message));

// Fallback timer if Redis jobs stall
setInterval(() => {
  runAutoPublish()
    .then((r) => {
      if (r.body?.ran) console.log('[worker] auto-publish tick', r.body.ran);
    })
    .catch((e) => console.warn('[worker] auto-publish tick failed', e?.message));
}, 5 * 60 * 1000);

console.log('LogHR worker started (notifications, job-boards, auto-publish)');
