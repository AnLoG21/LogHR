'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, Button, Card, Empty } from '@/components/ui';
import { api, fullName } from '@/lib/api';

export default function MessengersPage() {
  const qc = useQueryClient();
  const inbox = useQuery({
    queryKey: ['max-inbox'],
    queryFn: () => api<{ unread: number; items: any[] }>('/integrations/max/inbox'),
    refetchInterval: 8_000,
  });
  const candidates = useQuery({
    queryKey: ['candidates-msg'],
    queryFn: () => api<any>('/candidates?pageSize=30'),
  });
  const maxStatus = useQuery({
    queryKey: ['max-status'],
    queryFn: () => api<any>('/integrations/max/status'),
  });
  const readAll = useMutation({
    mutationFn: () => api('/integrations/max/inbox/read-all', { method: 'POST', body: '{}' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['max-inbox'] }),
  });
  const readOne = useMutation({
    mutationFn: (id: string) => api(`/integrations/max-chat/${id}/read`, { method: 'POST', body: '{}' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['max-inbox'] }),
  });

  const unreadItems = inbox.data?.items || [];

  return (
    <AppShell
      title="Мессенджеры"
      subtitle="WhatsApp, Telegram и MAX из карточек кандидатов"
      actions={
        unreadItems.length ? (
          <Button variant="ghost" onClick={() => readAll.mutate()} disabled={readAll.isPending}>
            Отметить все прочитанными
          </Button>
        ) : null
      }
    >
      {unreadItems.length ? (
        <Card className="p-4 mb-4">
          <div className="text-sm font-semibold mb-3">Новые сообщения MAX ({inbox.data?.unread || 0})</div>
          <div className="space-y-2">
            {unreadItems.map((m: any) => (
              <a
                key={m.candidateId + m.id}
                href={`/candidates/${m.candidateId}?tab=messengers`}
                className="block rounded-lg border border-[var(--sk-line)] px-3 py-2 hover:bg-[var(--sk-hover)]"
                onClick={() => readOne.mutate(m.candidateId)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-sm">{m.name || 'Кандидат'}</div>
                  {m.unread > 1 ? <span className="nav-badge">{m.unread}</span> : null}
                </div>
                <div className="text-sm text-[var(--sk-muted)] line-clamp-2 mt-0.5">{m.text}</div>
              </a>
            ))}
          </div>
        </Card>
      ) : null}

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
