/**
 * API smoke tests for LogHR (run with API up on :3001)
 * Usage: node scripts/smoke-api.mjs
 */
const API = process.env.API_URL || 'http://localhost:3001/api';

async function req(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return data;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const health = await req('/health');
  assert(health.status === 'ok', 'health');

  let login;
  try {
    login = await req('/auth/login', { method: 'POST', body: { email: 'admin@loghr.local', password: 'admin123' } });
  } catch {
    login = await req('/auth/login', { method: 'POST', body: { email: 'admin@taimyr.local', password: 'admin123' } });
  }
  const token = login.accessToken;
  assert(token, 'token');

  const me = await req('/auth/me', { token });
  assert(me.email, 'me');

  const cands = await req('/candidates?pageSize=5', { token });
  assert(typeof cands.total === 'number', 'candidates');

  const filters = await req('/filters', {
    method: 'POST',
    token,
    body: { name: `smoke-${Date.now()}`, entity: 'candidates', payload: { search: 'x' } },
  });
  assert(filters.id, 'filter create');

  const ai = await req('/ai/resume/parse', { method: 'POST', token, body: { text: 'Иванов Иван\nemail test@loghr.local\n+79990001122\nИнженер' } });
  assert(ai.data, 'ai parse');

  if (cands.items?.[0]?.id) {
    const score = await req(`/ai/candidates/${cands.items[0].id}/score`, { method: 'POST', token, body: {} });
    assert(typeof score.score === 'number', 'ai score');
  }

  const funnels = await req('/funnels', { token });
  assert(Array.isArray(funnels), 'funnels');

  console.log('SMOKE_OK');
}

main().catch((e) => {
  console.error('SMOKE_FAIL', e.message);
  process.exit(1);
});
