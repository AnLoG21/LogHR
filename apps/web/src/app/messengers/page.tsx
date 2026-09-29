'use client';

import { useQuery } from '@tanstack/react-query';
import { AppShell, Card, Empty } from '@/components/ui';
import { api, fullName } from '@/lib/api';

export default function MessengersPage() {
  const candidates = useQuery({
    queryKey: ['candidates-msg'],
    queryFn: () => api<any>('/candidates?pageSize=30'),
  });

  return (
    <AppShell title="Мессенджеры" subtitle="Быстрые ссылки WhatsApp / Telegram из карточек кандидатов">
      <Card className="p-4 mb-4 text-sm text-[var(--muted)]">
        История чатов не хранится — открывается web-версия мессенджера с личным аккаунтом (как в тарифе Base Extended).
      </Card>
      <div className="space-y-2">
        {(candidates.data?.items || []).filter((c: any) => c.phone).map((c: any) => {
          const phone = String(c.phone).replace(/\D/g, '');
          return (
            <Card key={c.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <a href={`/candidates/${c.id}`} className="font-semibold sk-link">{fullName(c)}</a>
                <div className="text-xs text-[var(--muted)]">{c.phone}</div>
              </div>
              <div className="flex gap-2">
                <a className="sk-btn sk-btn-outline" href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer">WhatsApp</a>
                <a className="sk-btn sk-btn-outline" href={`https://t.me/+${phone}`} target="_blank" rel="noreferrer">Telegram</a>
              </div>
            </Card>
          );
        })}
        {!candidates.isLoading && !(candidates.data?.items || []).filter((c: any) => c.phone).length ? (
          <Empty text="Нет кандидатов с телефоном" />
        ) : null}
      </div>
    </AppShell>
  );
}
