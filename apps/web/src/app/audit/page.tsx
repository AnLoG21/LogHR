'use client';

import { useQuery } from '@tanstack/react-query';
import { AppShell, Card, Empty } from '@/components/ui';
import { api, fullName } from '@/lib/api';

const ACTION_LABELS: Record<string, string> = {
  login: 'Вход',
  login_failed: 'Неудачный вход',
  logout: 'Выход',
  password_changed: 'Смена пароля',
  stage_change: 'Смена этапа',
  create: 'Создание',
  delete: 'Удаление',
  depersonalize: 'Обезличивание',
  status_change: 'Смена статуса',
  publish: 'Публикация',
  publish_failed: 'Ошибка публикации',
};

export default function AuditPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['audit'],
    queryFn: () => api<any>('/audit?pageSize=80'),
  });

  return (
    <AppShell title="Журнал действий" subtitle="Кто входил, менял этапы и опасные операции">
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--sk-soft)] text-left text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3 font-semibold">Когда</th>
              <th className="px-4 py-3 font-semibold">Кто</th>
              <th className="px-4 py-3 font-semibold">Действие</th>
              <th className="px-4 py-3 font-semibold">Объект</th>
              <th className="px-4 py-3 font-semibold">Детали</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {(data?.items || []).map((e: any) => (
              <tr key={e.id} className="hover:bg-[var(--sk-hover)]">
                <td className="px-4 py-3 whitespace-nowrap text-xs text-[var(--sk-muted)]">
                  {new Date(e.createdAt).toLocaleString('ru-RU')}
                </td>
                <td className="px-4 py-3">
                  {e.actor ? fullName(e.actor) : e.actorEmail || '—'}
                  {e.actor?.email ? (
                    <div className="text-xs text-[var(--sk-muted)]">{e.actor.email}</div>
                  ) : null}
                </td>
                <td className="px-4 py-3">{ACTION_LABELS[e.action] || e.action}</td>
                <td className="px-4 py-3">
                  {e.entity}
                  {e.entityId ? (
                    <div className="text-xs text-[var(--sk-muted)] font-mono">{String(e.entityId).slice(0, 8)}…</div>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--sk-muted)] max-w-xs truncate">
                  {e.meta ? JSON.stringify(e.meta) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && !(data?.items || []).length ? <Empty text="Записей пока нет" /> : null}
      </Card>
    </AppShell>
  );
}
