/** Shared HH access-token resolver used by adapters (non-DI) and HhAuthService. */

type TokenProvider = () => Promise<string | null>;

let provider: TokenProvider | null = null;

export function setHhTokenProvider(fn: TokenProvider) {
  provider = fn;
}

export async function resolveHhToken(): Promise<string | null> {
  if (provider) {
    try {
      const t = await provider();
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
