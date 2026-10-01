'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/ui';
import { api } from '@/lib/api';

/** Opens Metabase under the same ATS account (sets session cookie, then redirects). */
export default function MetabaseSsoPage() {
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ url: string; sessionId: string }>('/reports/metabase/sso');
        if (cancelled) return;
        const host = typeof window !== 'undefined' ? window.location.hostname : '';
        // Cookie is host-scoped (ports share it): Metabase on :3443 will receive it.
        document.cookie = `metabase.SESSION=${encodeURIComponent(res.sessionId)}; path=/; domain=${host}; Secure; SameSite=Lax; max-age=1209600`;
        window.location.href = res.url;
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Не удалось открыть аналитику');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <AppShell title="Аналитика">
      <div className="text-sm text-[var(--muted)]">
        {error ? (
          <div>
            <div style={{ color: 'var(--sk-text-danger)', marginBottom: 12 }}>{error}</div>
            <button type="button" className="sk-btn" onClick={() => router.push('/reports')}>Назад к отчётам</button>
          </div>
        ) : (
          'Открываем аналитику…'
        )}
      </div>
    </AppShell>
  );
}
