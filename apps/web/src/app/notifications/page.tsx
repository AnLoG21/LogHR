'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, Badge, Button, Card, Empty, Input, Modal, Select, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { NOTIFICATION_CHANNEL_LABELS, NOTIFICATION_STATUS_LABELS, ruLabel } from '@skillaz/shared';

const TEMPLATE_TITLES: Record<string, string> = {
  INTERVIEW_INVITE: 'Приглашение на интервью',
  REJECT_CANDIDATE: 'Отказ кандидату',
  OFFER_SENT: 'Оффер кандидату',
  PDN_REQUEST: 'Запрос согласия на ПДн',
  WA_FIRST_CONTACT: 'WhatsApp: первый контакт',
  WA_INTERVIEW_INVITE: 'WhatsApp: приглашение',
  WA_REMINDER: 'WhatsApp: напоминание',
  WA_DOCUMENTS: 'WhatsApp: документы',
  WA_REJECT: 'WhatsApp: отказ',
};

function titleOf(t: { code: string; subject?: string }) {
  return TEMPLATE_TITLES[t.code] || t.subject || t.code;
}

export default function NotificationsPage() {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<any | null>(null);
  const [channel, setChannel] = useState<'ALL' | 'EMAIL' | 'WHATSAPP'>('ALL');
  const templates = useQuery({ queryKey: ['notif-templates'], queryFn: () => api<any[]>('/notifications/templates') });
  const logs = useQuery({ queryKey: ['notif-logs'], queryFn: () => api<any>('/notifications/logs').catch(() => []) });

  const save = useMutation({
    mutationFn: () =>
      api(`/notifications/templates/${edit.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          subject: edit.subject,
          body: edit.body,
          isActive: edit.isActive,
        }),
      }),
    onSuccess: () => {
      setEdit(null);
      qc.invalidateQueries({ queryKey: ['notif-templates'] });
    },
  });

  const filtered = useMemo(() => {
    const all = templates.data || [];
    if (channel === 'ALL') return all;
    return all.filter((t) => (t.channel || 'EMAIL') === channel);
  }, [templates.data, channel]);

  const logItems = Array.isArray(logs.data) ? logs.data : logs.data?.items || [];

  return (
    <AppShell title="Шаблоны сообщений" subtitle="Письма и тексты WhatsApp. Нажмите шаблон, чтобы изменить.">
      <div className="flex gap-2 mb-4">
        {([
          ['ALL', 'Все'],
          ['EMAIL', 'Email'],
          ['WHATSAPP', 'WhatsApp'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`sk-tab ${channel === id ? 'active' : ''}`}
            onClick={() => setChannel(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="font-bold mb-3">Шаблоны ({filtered.length})</div>
          <div className="space-y-1 max-h-[60vh] overflow-auto">
            {filtered.map((t: any) => (
              <button
                key={t.id}
                type="button"
                className="w-full text-left border-b border-[var(--line)] py-2.5 px-1 hover:bg-[var(--surface-2)] rounded transition"
                onClick={() => setEdit({ ...t })}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-sm">{titleOf(t)}</div>
                  <Badge color={t.isActive ? 'green' : 'amber'}>{t.isActive ? 'вкл' : 'выкл'}</Badge>
                </div>
                <div className="text-xs text-[var(--muted)] mt-0.5 truncate">
                  {ruLabel(NOTIFICATION_CHANNEL_LABELS, t.channel || 'EMAIL')} · {t.subject}
                </div>
              </button>
            ))}
            {!templates.isLoading && !filtered.length ? <Empty text="Шаблонов нет" /> : null}
          </div>
        </Card>

        <Card className="p-4">
          <div className="font-bold mb-3">Последние отправки</div>
          <div className="space-y-2 text-sm max-h-[60vh] overflow-auto">
            {logItems.slice(0, 40).map((l: any) => (
              <div key={l.id} className="border-b border-[var(--line)] pb-2">
                <div className="font-medium">{l.subject || l.to || '—'}</div>
                <div className="text-xs text-[var(--muted)]">
                  {l.to} · {ruLabel(NOTIFICATION_CHANNEL_LABELS, l.channel, 'Email')} · {ruLabel(NOTIFICATION_STATUS_LABELS, l.status)}
                  {l.createdAt ? ` · ${new Date(l.createdAt).toLocaleString('ru-RU')}` : ''}
                </div>
              </div>
            ))}
            {!logItems.length ? <Empty text="Пока нет отправок" /> : null}
          </div>
        </Card>
      </div>

      <Modal open={!!edit} title={edit ? titleOf(edit) : ''} onClose={() => setEdit(null)}>
        {edit ? (
          <div className="space-y-3">
            <div className="text-xs text-[var(--muted)]">
              Код: {edit.code}. Подстановки: {'{{name}}'}, {'{{firstName}}'}, {'{{vacancy}}'}, {'{{datetime}}'}, {'{{link}}'}, {'{{company}}'}
            </div>
            <Input
              placeholder="Тема"
              value={edit.subject || ''}
              onChange={(e) => setEdit({ ...edit, subject: e.target.value })}
            />
            <Textarea
              rows={8}
              placeholder="Текст"
              value={edit.body || ''}
              onChange={(e) => setEdit({ ...edit, body: e.target.value })}
            />
            <label className="text-sm flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!edit.isActive}
                onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })}
              />
              Активен
            </label>
            <Button disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? 'Сохранение…' : 'Сохранить'}
            </Button>
            {save.isError ? <div className="text-sm text-[var(--sk-danger)]">{(save.error as Error).message}</div> : null}
          </div>
        ) : null}
      </Modal>
    </AppShell>
  );
}
