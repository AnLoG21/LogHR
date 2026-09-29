'use client';

import { useQuery } from '@tanstack/react-query';
import { AppShell, Card, Empty } from '@/components/ui';
import { api } from '@/lib/api';

export default function NotificationsPage() {
  const templates = useQuery({ queryKey: ['notif-templates'], queryFn: () => api<any[]>('/notifications/templates') });
  const logs = useQuery({ queryKey: ['notif-logs'], queryFn: () => api<any>('/notifications/logs').catch(() => ({ items: [] })) });

  return (
    <AppShell title="Шаблоны писем" subtitle="Email-нотификации процесса подбора">
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="font-bold mb-3">Шаблоны ({templates.data?.length || 0})</div>
          <div className="space-y-2 max-h-[60vh] overflow-auto">
            {(templates.data || []).map((t: any) => (
              <div key={t.id} className="border-b border-[var(--line)] pb-2 text-sm">
                <div className="font-medium">{t.code}</div>
                <div className="text-xs text-[var(--muted)]">{t.subject}</div>
              </div>
            ))}
            {!templates.isLoading && !templates.data?.length ? <Empty text="Шаблонов нет" /> : null}
          </div>
        </Card>
        <Card className="p-4">
          <div className="font-bold mb-3">Последние отправки</div>
          <div className="space-y-2 text-sm max-h-[60vh] overflow-auto">
            {(logs.data?.items || logs.data || []).slice?.(0, 30)?.map?.((l: any) => (
              <div key={l.id} className="border-b border-[var(--line)] pb-2">
                <div>{l.to || l.recipient || '—'}</div>
                <div className="text-xs text-[var(--muted)]">{l.channel || 'email'} · {l.status || '—'}</div>
              </div>
            )) || <Empty text="Логов нет или endpoint недоступен" />}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
