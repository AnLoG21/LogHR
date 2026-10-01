'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, Badge, Button, Card, Empty } from '@/components/ui';
import { api, fullName } from '@/lib/api';
import { CHECK_STATUS_LABELS, CHECK_TYPE_LABELS, ruLabel } from '@skillaz/shared';

export default function ChecksPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['checks'],
    queryFn: () => api<any>('/checks?pageSize=50'),
  });
  const change = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/checks/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['checks'] }),
  });

  return (
    <AppShell title="Проверки" subtitle="СБ, заявка на приём, обратная связь">
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#f3f7f9] text-left text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3 font-semibold">Тип</th>
              <th className="px-4 py-3 font-semibold">Кандидат</th>
              <th className="px-4 py-3 font-semibold">Статус</th>
              <th className="px-4 py-3 font-semibold">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {(data?.items || []).map((c: any) => (
              <tr key={c.id} className="hover:bg-[#f7fbfc]">
                <td className="px-4 py-3">{ruLabel(CHECK_TYPE_LABELS, c.type)}</td>
                <td className="px-4 py-3">{c.candidate ? fullName(c.candidate) : '—'}</td>
                <td className="px-4 py-3"><Badge color={c.status === 'APPROVED' ? 'green' : c.status === 'REJECTED' ? 'rose' : 'amber'}>{ruLabel(CHECK_STATUS_LABELS, c.status)}</Badge></td>
                <td className="px-4 py-3 space-x-1">
                  <Button variant="ghost" onClick={() => change.mutate({ id: c.id, status: 'APPROVED' })}>Одобрить</Button>
                  <Button variant="ghost" onClick={() => change.mutate({ id: c.id, status: 'REJECTED' })}>Отклонить</Button>
                  {c.externalToken ? (
                    <a className="text-xs text-[var(--brand-secondary)] underline" href={`/public/check/${c.externalToken}`} target="_blank" rel="noreferrer">Ссылка для проверки</a>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && !data?.items?.length ? <Empty text="Проверок нет" /> : null}
      </Card>
    </AppShell>
  );
}
