const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function getAccessToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('accessToken');
}

export function setTokens(access: string, refresh: string, userId: string) {
  localStorage.setItem('accessToken', access);
  localStorage.setItem('refreshToken', refresh);
  localStorage.setItem('userId', userId);
}

export function clearTokens() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('userId');
}

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  if (!headers.has('Content-Type') && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_URL}/api${path}`, { ...init, headers });
  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers.set('Authorization', `Bearer ${getAccessToken()}`);
      const retry = await fetch(`${API_URL}/api${path}`, { ...init, headers });
      if (!retry.ok) throw await toError(retry);
      if (retry.status === 204) return undefined as T;
      return retry.json();
    }
  }
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res as unknown as T;
}

async function tryRefresh() {
  const refreshToken = localStorage.getItem('refreshToken');
  const userId = localStorage.getItem('userId');
  const deviceId = localStorage.getItem('deviceId');
  if (!refreshToken || !userId) return false;
  const res = await fetch(`${API_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, refreshToken, deviceId }),
  });
  if (!res.ok) {
    clearTokens();
    return false;
  }
  const data = await res.json();
  setTokens(data.accessToken, data.refreshToken, userId);
  return true;
}

async function toError(res: Response) {
  let message = res.statusText;
  try {
    const data = await res.json();
    message = data.message || JSON.stringify(data);
  } catch {
    /* ignore */
  }
  return new Error(Array.isArray(message) ? message.join(', ') : message);
}

export function fullName(c: { firstName?: string; lastName?: string; middleName?: string }) {
  return [c.lastName, c.firstName, c.middleName].filter(Boolean).join(' ');
}
