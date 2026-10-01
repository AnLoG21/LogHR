'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, Badge, Button, Card, Empty } from '@/components/ui';
import { api, fullName } from '@/lib/api';

export default function TasksPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api<any>('/tasks?pageSize=50'),
  });
  const done = useMutation({
    mutationFn: (id: string) => api(`/tasks/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'DONE' }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const items = data?.items || [];
  const open = items.filter((t: any) => t.status === 'OPEN');

  return (
    <AppShell title="Мои задачи" subtitle="Задачи по кандидатам и заявкам">
      <div className="text-[13px] text-[var(--sk-muted)] mb-3">Открытых: {open.length} · всего {items.length}</div>
      <Card className="divide-y divide-[var(--line)]">
        {items.map((t: any, i: number) => (
          <div key={t.id} className="px-4 py-3.5 flex items-center justify-between gap-3 table-row-enter" style={{ animationDelay: `${i * 30}ms` }}>
            <div>
              <div className="font-semibold text-sm">{t.title}</div>
              <div className="text-xs text-[var(--muted)] mt-1">
                {t.candidate ? fullName(t.candidate) : t.hiringRequest?.title || '—'}
                {t.stage ? ` · ${t.stage.name}` : ''}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge color={t.status === 'OPEN' ? 'amber' : 'green'}>{t.status === 'OPEN' ? 'Открыта' : 'Готово'}</Badge>
              {t.status === 'OPEN' ? <Button variant="ghost" onClick={() => done.mutate(t.id)}>Готово</Button> : null}
            </div>
          </div>
        ))}
        {!isLoading && !items.length ? <Empty text="Открытых задач нет" /> : null}
      </Card>
    </AppShell>
  );
}
