/** Shared HH access-token resolver used by adapters (non-DI) and HhAuthService. */

import { AsyncLocalStorage } from 'async_hooks';

type TokenProvider = (userId?: string) => Promise<string | null>;

let provider: TokenProvider | null = null;

export const hhRequestContext = new AsyncLocalStorage<{ userId?: string }>();

export function setHhTokenProvider(fn: TokenProvider) {
  provider = fn;
}

export async function resolveHhToken(userId?: string): Promise<string | null> {
  const uid = userId || hhRequestContext.getStore()?.userId;
  if (provider) {
    try {
      const t = await provider(uid);
      if (t) return t;
    } catch {
      /* fall through to env */
    }
  }
  return process.env.HH_ACCESS_TOKEN || process.env.HH_CHAT_TOKEN || null;
}

export function hhUserAgent() {
  return process.env.HH_USER_AGENT || 'LogHR/1.0 (hr@infiit.ru)';
}

export async function withHhUser<T>(userId: string | undefined, fn: () => Promise<T>): Promise<T> {
  return hhRequestContext.run({ userId }, fn);
}
