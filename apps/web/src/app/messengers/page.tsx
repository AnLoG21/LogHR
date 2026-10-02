'use client';

import { useQuery } from '@tanstack/react-query';
import { AppShell, Card, Empty } from '@/components/ui';
import { api, fullName } from '@/lib/api';

export default function MessengersPage() {
  const candidates = useQuery({
    queryKey: ['candidates-msg'],
    queryFn: () => api<any>('/candidates?pageSize=30'),
  });
  const maxStatus = useQuery({
    queryKey: ['max-status'],
    queryFn: () => api<any>('/integrations/max/status'),
  });

  return (
    <AppShell title="Мессенджеры" subtitle="WhatsApp, Telegram и MAX из карточек кандидатов">
      <Card className="p-4 mb-4 text-sm text-[var(--sk-muted)] space-y-2">
        <p>WhatsApp и Telegram открывают ваш личный аккаунт в браузере по номеру телефона кандидата.</p>
        <p>
          В MAX нельзя открыть чат по номеру. Работает через корпоративного бота:
          рекрутер копирует ссылку-приглашение в карточке кандидата → кандидат открывает бота → переписка идёт в ATS.
          {maxStatus.data?.configured
            ? ` Бот: @${maxStatus.data.botUsername}.`
            : ' Бот пока не настроен — администратор задаёт MAX_BOT_TOKEN и MAX_BOT_USERNAME на сервере.'}
        </p>
      </Card>
      <div className="space-y-2">
        {(candidates.data?.items || []).filter((c: any) => c.phone).map((c: any) => {
          const phone = String(c.phone).replace(/\D/g, '');
          const bot = maxStatus.data?.botUsername;
          const invite = bot
            ? `https://max.ru/${bot}?start=c_${String(c.id).replace(/-/g, '').slice(0, 32)}`
            : null;
          return (
            <Card key={c.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <a href={`/candidates/${c.id}`} className="font-semibold sk-link">{fullName(c)}</a>
                <div className="text-xs text-[var(--sk-muted)]">{c.phone}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <a className="sk-btn sk-btn-outline" href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer">WhatsApp</a>
                <a className="sk-btn sk-btn-outline" href={`https://t.me/+${phone}`} target="_blank" rel="noreferrer">Telegram</a>
                {invite ? (
                  <a className="sk-btn sk-btn-outline" href={invite} target="_blank" rel="noreferrer">MAX — ссылка кандидату</a>
                ) : (
                  <a className="sk-btn sk-btn-outline" href={`/candidates/${c.id}?tab=messengers`}>MAX в карточке</a>
                )}
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
